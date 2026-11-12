<?php

namespace Tests\Feature;

use App\Console\Commands\CheckFranchisesCommand;
use App\Models\FranchisePart;
use App\Models\FranchiseReminder;
use App\Models\Module;
use App\Models\Movie;
use App\Models\RecordLock;
use App\Models\Series;
use App\Models\User;
use App\Services\Media\FranchiseTracker;
use App\Services\Sync\ItemSyncer;
use App\Support\NotificationType;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **ფრანჩაიზის დაუმატებელი ნაწილები.**
 *
 * ⚠️ მოწმდება: ნაწილები TMDB-დან ცხრილში იწერება (გამოუსვლელიც) და ახალი მონაცემი
 * ხელახლა არ იკითხება; ბიბლიოთეკასთან შედარება თითო დაუმატებელ ნაწილზე **ერთ**
 * შეტყობინებას აგზავნის — მეორედ არასდროს; ურნაში მყოფი და ჩაკეტილი ნაწილი „მაქვს"-ია;
 * „აღარ შემახსენო" ნაწილზე და მთელ ფრანჩაიზზე მუშაობს და მოსულ შეტყობინებასაც აშორებს;
 * სიის ფრანჩაიზის ჯგუფში დაუმატებელი ნაწილი მკრთალ ბარათად ჩანს — მხოლოდ დაუფილტრავ
 * სიაში; ღამის ბრძანება ყველა ფრანჩაიზს ამოწმებს; სერიალზე ახალი სეზონი ცხადდება.
 */
class FranchiseTrackerTest extends TestCase
{
    use RefreshDatabase;

    private const SAGA = 2344;

    private User $user;

    /** @var list<array<string, mixed>> TMDB-ის ნაწილები — ტესტი მათ გზადაგზა ცვლის */
    private array $parts = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        Cache::flush();

        $this->user = $this->makeUser('nino');
        $this->giveCredential($this->user, 'tmdb');
        $this->actingAs($this->user);

        $this->parts = [
            ['id' => 604, 'title' => 'Reloaded', 'release_date' => '2003-05-15', 'poster_path' => '/b.jpg', 'vote_average' => 7.0],
            ['id' => 603, 'title' => 'The Matrix', 'release_date' => '1999-03-30', 'poster_path' => '/a.jpg', 'vote_average' => 8.2],
            // გამოცხადებული, ჯერ უთარიღო და უპოსტერო
            ['id' => 606, 'title' => 'Matrix 5', 'release_date' => ''],
        ];

        // ⚠️ ერთი stub ცვლადი პასუხით — `Http::fake()` stub-ებს ამატებს და არა ცვლის
        Http::fake([
            'api.themoviedb.org/3/collection/*' => fn () => Http::response(['id' => self::SAGA, 'name' => 'The Matrix Collection', 'parts' => $this->parts]),
        ]);
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'series'])->pluck('id')->all());

        return $user->refresh();
    }

    private function movie(int $tmdbId, string $title, int $year, ?User $owner = null, array $extra = []): Movie
    {
        $movie = Movie::create([
            'user_id' => ($owner ?? $this->user)->id,
            'tmdb_id' => $tmdbId,
            'year' => $year,
            'tmdb_collection_id' => self::SAGA,
            'collection_name' => 'The Matrix Collection',
            ...$extra,
        ]);
        $movie->setTranslation('en', ['title' => $title]);

        return $movie;
    }

    private function tracker(): FranchiseTracker
    {
        return app(FranchiseTracker::class);
    }

    /** @return list<string> ნაწილები, რომლებზეც „აკლია" მოვიდა */
    private function missing(?User $user = null): array
    {
        return ($user ?? $this->user)->notifications()
            ->where('type', NotificationType::FRANCHISE_PART)
            ->get()
            ->map(fn ($n) => $n->data['title_en'])
            ->sort()
            ->values()
            ->all();
    }

    public function test_the_parts_are_stored_once_and_a_fresh_franchise_is_not_asked_again(): void
    {
        $this->assertTrue($this->tracker()->refresh(self::SAGA));

        // ყურების რიგით; უთარიღო ბოლოშია, უპოსტეროც ჩაწერილია
        $parts = $this->tracker()->parts(self::SAGA);
        $this->assertSame(['The Matrix', 'Reloaded', 'Matrix 5'], $parts->pluck('title')->all());
        $this->assertNull($parts[2]->release_date);
        $this->assertNull($parts[2]->posterUrl());
        $this->assertSame('The Matrix Collection', $parts[0]->collection_name);

        $this->tracker()->refresh(self::SAGA);
        Http::assertSentCount(1);

        // ძველი მონაცემი თავიდან იკითხება; TMDB-დან ამოღებული ნაწილი ჩვენთანაც ქრება
        FranchisePart::query()->update(['checked_at' => now()->subDays(2)]);
        $this->parts = [$this->parts[1]];
        $this->tracker()->refresh(self::SAGA);

        Http::assertSentCount(2);
        $this->assertSame(['The Matrix'], $this->tracker()->parts(self::SAGA)->pluck('title')->all());
    }

    public function test_each_missing_part_is_told_once_and_never_again(): void
    {
        $mine = $this->movie(603, 'The Matrix', 1999);
        $this->tracker()->refresh(self::SAGA);

        $this->assertSame(2, $this->tracker()->notifyMissing($this->user));
        $this->assertSame(['Matrix 5', 'Reloaded'], $this->missing());

        $row = $this->user->notifications()->where('type', NotificationType::FRANCHISE_PART)->get()
            ->first(fn ($n) => $n->data['tmdb_id'] === 604);
        $this->assertSame(self::SAGA, $row->data['collection_id']);
        $this->assertSame('The Matrix Collection', $row->data['collection_name']);
        // ჩემი ნაწილის გვერდზე მიდის — იქ ფრანჩაიზის ბლოკია
        $this->assertSame("/movies/{$mine->id}", NotificationType::route($row->type, $row->data));

        // მეორედ — არაფერი, თუნდაც შეტყობინება წაშლილი იყოს
        $this->user->notifications()->delete();
        $this->assertSame(0, $this->tracker()->notifyMissing($this->user));
        $this->assertSame([], $this->missing());

        // ახალი ნაწილი გამოცხადდა — მხოლოდ მასზე მოდის
        $this->parts[] = ['id' => 607, 'title' => 'Matrix 6', 'release_date' => '2031-01-01'];
        FranchisePart::query()->update(['checked_at' => now()->subDays(2)]);
        $this->tracker()->refresh(self::SAGA);

        $this->assertSame(1, $this->tracker()->notifyMissing($this->user));
        $this->assertSame(['Matrix 6'], $this->missing());
    }

    public function test_a_trashed_or_locked_part_is_owned_and_an_all_locked_franchise_is_left_alone(): void
    {
        $this->movie(603, 'The Matrix', 1999);
        $this->movie(604, 'Reloaded', 2003)->moveToTrash();
        $locked = $this->movie(606, 'Matrix 5', 2030);
        RecordLock::create([
            'user_id' => $this->user->id,
            'lockable_type' => $locked->getMorphClass(),
            'lockable_id' => $locked->getKey(),
            'password_hash' => Hash::make('secret1'),
        ]);
        $this->tracker()->refresh(self::SAGA);

        $this->assertSame(0, $this->tracker()->notifyMissing($this->user));

        // ფრანჩაიზი, რომლის ერთადერთი ჩემი ნაწილი ჩაკეტილია, არ მოწმდება — შეტყობინება მას გაამხელდა
        $other = $this->makeUser('dato');
        $hidden = $this->movie(603, 'The Matrix', 1999, $other);
        RecordLock::create([
            'user_id' => $other->id,
            'lockable_type' => $hidden->getMorphClass(),
            'lockable_id' => $hidden->getKey(),
            'password_hash' => Hash::make('secret1'),
        ]);

        $this->assertSame(0, $this->tracker()->notifyMissing($other));
        $this->assertSame([], $this->missing($other));
    }

    public function test_muting_a_part_or_the_whole_franchise_stops_the_reminders(): void
    {
        $this->movie(603, 'The Matrix', 1999);
        $this->tracker()->refresh(self::SAGA);
        $this->tracker()->notifyMissing($this->user);

        // ერთ ნაწილზე — მისი შეტყობინებაც ქრება, მეორე რჩება
        $this->patchJson('/api/franchises/'.self::SAGA.'/reminders', ['muted' => true, 'tmdb_id' => 604])
            ->assertOk()
            ->assertJsonPath('muted', true);
        $this->assertSame(['Matrix 5'], $this->missing());

        // მთელ ფრანჩაიზზე — ახალი ნაწილიც აღარ მოდის
        $this->patchJson('/api/franchises/'.self::SAGA.'/reminders', ['muted' => true])->assertOk();
        $this->assertSame([], $this->missing());
        $this->assertTrue($this->tracker()->muted($this->user, self::SAGA));

        $this->parts[] = ['id' => 607, 'title' => 'Matrix 6', 'release_date' => '2031-01-01'];
        FranchisePart::query()->update(['checked_at' => now()->subDays(2)]);
        $this->tracker()->refresh(self::SAGA);
        $this->assertSame(0, $this->tracker()->notifyMissing($this->user));

        // „ისევ შემახსენე" — ჯერ არნახულ ნაწილზე მოდის; უკვე ნათქვამზე და ცალკე გაჩუმებულზე — არა
        $this->patchJson('/api/franchises/'.self::SAGA.'/reminders', ['muted' => false])->assertJsonPath('muted', false);
        $this->assertSame(1, $this->tracker()->notifyMissing($this->user));
        $this->assertSame(['Matrix 6'], $this->missing());

        // სხვისი ანგარიში ხელუხლებელია
        $this->assertSame(0, FranchiseReminder::where('user_id', '!=', $this->user->id)->count());
        $this->patchJson('/api/franchises/'.self::SAGA.'/reminders', [])->assertStatus(422);
    }

    public function test_adding_a_movie_checks_its_franchise_and_clears_its_own_reminder(): void
    {
        $first = $this->movie(603, 'The Matrix', 1999);
        $this->tracker()->track($first);

        $this->assertSame(['Matrix 5', 'Reloaded'], $this->missing());

        // მეორე ნაწილი დაემატა — მასზე დაწერილი „აკლია" ქრება, ახალი არაფერი მოდის
        $this->tracker()->track($this->movie(604, 'Reloaded', 2003));

        $this->assertSame(['Matrix 5'], $this->missing());
        Http::assertSentCount(1);
    }

    public function test_the_franchise_block_reads_the_table_and_shows_what_is_missing(): void
    {
        $movie = $this->movie(603, 'The Matrix', 1999);
        $owned = $this->movie(604, 'Reloaded', 2003, null, ['is_favorite' => true]);

        $res = $this->getJson("/api/movies/{$movie->id}/collection")->assertOk();

        $res->assertJsonPath('collection_id', self::SAGA)
            ->assertJsonPath('name', 'The Matrix Collection')
            ->assertJsonPath('muted', false)
            ->assertJsonCount(3, 'parts')
            ->assertJsonPath('parts.0.title', 'The Matrix')
            ->assertJsonPath('parts.0.released', true)
            ->assertJsonPath('parts.1.movie_id', $owned->id)
            ->assertJsonPath('parts.1.is_favorite', true)
            // გამოუსვლელი, ჯერ დაუმატებელი ნაწილი ბლოკში რჩება
            ->assertJsonPath('parts.2.title', 'Matrix 5')
            ->assertJsonPath('parts.2.owned', false)
            ->assertJsonPath('parts.2.released', false)
            ->assertJsonPath('parts.2.poster', null);

        // მეორე გახსნა TMDB-ს აღარ ეკითხება
        $this->getJson("/api/movies/{$movie->id}/collection")->assertOk();
        Http::assertSentCount(1);

        $this->patchJson('/api/franchises/'.self::SAGA.'/reminders', ['muted' => true]);
        $this->getJson("/api/movies/{$movie->id}/collection")->assertJsonPath('muted', true);
    }

    public function test_the_list_shows_missing_parts_as_ghosts_only_when_nothing_narrows_it(): void
    {
        $this->movie(603, 'The Matrix', 1999);
        $solo = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 1, 'year' => 2020]);
        $solo->setTranslation('en', ['title' => 'Solo']);
        $this->tracker()->refresh(self::SAGA);

        $rows = $this->getJson('/api/movies?franchise_gaps=1&sort=year_asc')->assertOk()->json('data');

        // ჯგუფი გამოსვლის წლით: ჩემი ნაწილი, მერე დაუმატებელი; უწლო ბოლოს
        $this->assertSame(['The Matrix', 'Reloaded', 'Matrix 5', 'Solo'], array_column($rows, 'title_en'));
        $this->assertSame([null, true, true, null], array_map(fn ($r) => $r['ghost'] ?? null, $rows));
        $this->assertSame(-604, $rows[1]['id']);
        $this->assertSame(604, $rows[1]['tmdb_id']);
        $this->assertSame(self::SAGA, $rows[1]['collection_id']);
        $this->assertFalse($rows[2]['released']);

        // ჯამი ჩანაწერებს ითვლის — მკრთალი ბარათი ჩანაწერი არ არის
        $this->assertSame(2, $this->getJson('/api/movies?franchise_gaps=1')->json('meta.records'));

        // კლებადობით უწლო (ახლად გამოცხადებული) ნაწილი წინაა
        $desc = array_column($this->getJson('/api/movies?franchise_gaps=1&sort=year_desc')->json('data'), 'title_en');
        $this->assertSame(['Solo', 'Matrix 5', 'Reloaded', 'The Matrix'], $desc);

        // პარამეტრის გარეშე, გაფილტრულ სიაში და ძებნისას — მხოლოდ ჩანაწერები
        $this->assertCount(2, $this->getJson('/api/movies')->json('data'));
        $this->assertCount(1, $this->getJson('/api/movies?franchise_gaps=1&year_max=2000')->json('data'));
        $this->assertCount(1, $this->getJson('/api/movies?franchise_gaps=1&q=matrix')->json('data'));

        // გაჩუმებული ნაწილი სიაშიც არ ჩანს
        $this->tracker()->mute($this->user, self::SAGA, 604);
        $muted = array_column($this->getJson('/api/movies?franchise_gaps=1&sort=year_asc')->json('data'), 'title_en');
        $this->assertSame(['The Matrix', 'Matrix 5', 'Solo'], $muted);
    }

    public function test_the_nightly_check_refreshes_every_franchise_and_leaves_a_heartbeat(): void
    {
        $this->movie(603, 'The Matrix', 1999);
        // გასაღების გარეშე ანგარიში: ფრანჩაიზი მისი გასაღებით არ იკითხება, მაგრამ ჩაწერილს ედრება
        $keyless = $this->makeUser('dato');
        $this->movie(604, 'Reloaded', 2003, $keyless);

        $this->artisan('franchises:check', ['--delay' => 0])->assertSuccessful();

        $this->assertSame(['Matrix 5', 'Reloaded'], $this->missing());
        $this->assertSame(['Matrix 5', 'The Matrix'], $this->missing($keyless));
        $this->assertNotNull(Cache::get(CheckFranchisesCommand::HEARTBEAT));
        // ფრანჩაიზების ცხრილი საერთოა — ორი ანგარიშის ერთი ფრანჩაიზი ერთხელ იკითხება
        Http::assertSentCount(1);

        // მეორე გაშვება არაფერს იმეორებს
        $this->artisan('franchises:check', ['--delay' => 0])->assertSuccessful();
        $this->assertCount(2, $this->missing());
    }

    public function test_the_doctor_says_when_the_nightly_check_last_ran(): void
    {
        $this->artisan('mediary:doctor')->expectsOutputToContain('არასდროს გაშვებულა — ფრანჩაიზები');

        Cache::put(CheckFranchisesCommand::HEARTBEAT, now()->subHours(3)->toIso8601String());
        $this->artisan('mediary:doctor')->expectsOutputToContain('ბოლო შემოწმება 3 საათის წინ');
    }

    /** სერიალი: შემდეგი სერია ახალ სეზონშია → „გამოცხადდა ახალი სეზონი" — ერთხელ და არა პირველ სინქრონზე */
    public function test_a_new_season_is_announced_on_a_later_sync(): void
    {
        $details = ['id' => 1399, 'name' => 'Show', 'number_of_seasons' => 3, 'next_episode_to_air' => null];
        Http::fake([
            'api.themoviedb.org/3/tv/*/credits*' => fn () => Http::response(['cast' => []]),
            'api.themoviedb.org/3/tv/*' => function () use (&$details) {
                return Http::response($details);
            },
        ]);

        $series = Series::create(['user_id' => $this->user->id, 'tmdb_id' => 1399])->refresh();
        $series->setTranslation('en', ['title' => 'Show']);
        $sync = fn () => app(ItemSyncer::class)->sync($series->refresh(), ['fields' => ['details']]);

        // პირველი სინქრონი: მეოთხე სეზონი უკვე გამოცხადებულია, მაგრამ ჩვენთვის ყველაფერი ახალია
        $details['next_episode_to_air'] = ['air_date' => '2030-01-10', 'season_number' => 4, 'episode_number' => 1];
        $sync();
        $this->assertSame(0, $this->user->notifications()->where('type', NotificationType::NEW_SEASON)->count());

        // იგივე სეზონი — არაფერი; მეხუთე სეზონი გამოცხადდა — ერთი შეტყობინება
        $sync();
        $details['next_episode_to_air'] = ['air_date' => '2031-01-10', 'season_number' => 5, 'episode_number' => 1];
        $sync();
        $sync();

        $rows = $this->user->notifications()->where('type', NotificationType::NEW_SEASON)->get();
        $this->assertCount(1, $rows);
        $this->assertSame(5, $rows[0]->data['season']);
        $this->assertSame('Show', $rows[0]->data['title_en']);
        $this->assertSame("/series/{$series->id}", NotificationType::route($rows[0]->type, $rows[0]->data));
    }
}
