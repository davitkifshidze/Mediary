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
use App\Support\AppTime;
use App\Support\NotificationType;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
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

        // გამოსული ნაკლული ერთია — მასზე მოდის; გამოუსვლელზე (უთარიღო „Matrix 5") ჯერ არა
        $this->assertSame(1, $this->tracker()->notifyMissing($this->user));
        $this->assertSame(['Reloaded'], $this->missing());

        $row = $this->user->notifications()->where('type', NotificationType::FRANCHISE_PART)->get()
            ->first(fn ($n) => $n->data['tmdb_id'] === 604);
        $this->assertSame(self::SAGA, $row->data['collection_id']);
        $this->assertSame('The Matrix Collection', $row->data['collection_name']);
        $this->assertFalse($row->data['out_today']);
        // „ფრანჩაიზების" გვერდზე მიდის, ამ ფრანჩაიზზე
        $this->assertSame('/movies/franchises?open='.self::SAGA, NotificationType::route($row->type, $row->data));
        $this->assertNotNull($mine->id);

        // მეორედ — არაფერი, თუნდაც შეტყობინება წაშლილი იყოს
        $this->user->notifications()->delete();
        $this->assertSame(0, $this->tracker()->notifyMissing($this->user));
        $this->assertSame([], $this->missing());

        // ახალი ნაწილი გამოცხადდა — შეტყობინება მისი გამოსვლის დღეს მოდის და არა ადრე
        $this->parts[] = ['id' => 607, 'title' => 'Matrix 6', 'release_date' => '2031-01-01'];
        FranchisePart::query()->update(['checked_at' => now()->subDays(2)]);
        $this->tracker()->refresh(self::SAGA);
        $this->assertSame(0, $this->tracker()->notifyMissing($this->user));

        $this->travelTo(Carbon::parse('2031-01-01 09:00:00', AppTime::zone()));
        $this->assertSame(1, $this->tracker()->notifyMissing($this->user));
        $this->assertSame(['Matrix 6'], $this->missing());
        $this->assertTrue($this->user->notifications()->where('type', NotificationType::FRANCHISE_PART)->first()->data['out_today']);
    }

    public function test_the_first_check_of_a_franchise_sends_one_summary_instead_of_a_row_per_part(): void
    {
        $this->parts[] = ['id' => 605, 'title' => 'Revolutions', 'release_date' => '2003-11-05'];
        $this->movie(603, 'The Matrix', 1999);
        $this->tracker()->refresh(self::SAGA);

        // ორი გამოსული ნაკლული → ერთი ჯამური; ნაწილებზე ცალკე არაფერი
        $this->assertSame(1, $this->tracker()->notifyMissing($this->user));
        $this->assertSame([], $this->missing());

        $summary = $this->user->notifications()->where('type', NotificationType::FRANCHISE_GAPS)->get();
        $this->assertCount(1, $summary);
        $this->assertSame(2, $summary[0]->data['count']);
        $this->assertSame(self::SAGA, $summary[0]->data['collection_id']);
        $this->assertSame('The Matrix Collection', $summary[0]->data['collection_name']);
        $this->assertSame('/movies/franchises?open='.self::SAGA, NotificationType::route($summary[0]->type, $summary[0]->data));

        // ჯამში მოხვედრილი ნაწილები ნათქვამია — განმეორებითი გაშვება არაფერს აგზავნის
        $this->assertEqualsCanonicalizing(
            [604, 605],
            FranchiseReminder::where('user_id', $this->user->id)->whereNotNull('notified_at')->pluck('tmdb_id')->all(),
        );
        $this->assertSame(0, $this->tracker()->notifyMissing($this->user));

        // შემდეგ გაჩენილ ნაწილებზე — თითოზე ერთი, თუნდაც ორი ერთად გაჩნდეს
        $this->parts[] = ['id' => 624, 'title' => 'Resurrections', 'release_date' => '2021-12-22'];
        $this->parts[] = ['id' => 625, 'title' => 'Animatrix', 'release_date' => '2003-06-03'];
        FranchisePart::query()->update(['checked_at' => now()->subDays(2)]);
        $this->tracker()->refresh(self::SAGA);

        $this->assertSame(2, $this->tracker()->notifyMissing($this->user));
        $this->assertSame(['Animatrix', 'Resurrections'], $this->missing());
        $this->assertSame(1, $this->user->notifications()->where('type', NotificationType::FRANCHISE_GAPS)->count());

        // ნაკლულის დამატება ჯამურს არ შლის, სანამ სხვა გამოსული ნაკლული რჩება…
        $this->tracker()->track($this->movie(604, 'Reloaded', 2003));
        $this->assertSame(1, $this->user->notifications()->where('type', NotificationType::FRANCHISE_GAPS)->count());

        // …მთელი ფრანჩაიზის გაჩუმება კი ჯამურსაც აშორებს
        $this->tracker()->mute($this->user, self::SAGA);
        $this->assertSame(0, $this->user->notifications()->whereIn('type', [NotificationType::FRANCHISE_GAPS, NotificationType::FRANCHISE_PART])->count());
    }

    public function test_the_summary_goes_away_once_the_last_released_part_is_added(): void
    {
        $this->parts[] = ['id' => 605, 'title' => 'Revolutions', 'release_date' => '2003-11-05'];
        $this->tracker()->track($this->movie(603, 'The Matrix', 1999));
        $this->assertSame(1, $this->user->notifications()->where('type', NotificationType::FRANCHISE_GAPS)->count());

        $this->tracker()->track($this->movie(604, 'Reloaded', 2003));
        $this->tracker()->track($this->movie(605, 'Revolutions', 2003));

        // გამოუსვლელი „Matrix 5" რჩება ნაკლულად, მაგრამ „რამდენიმე ნაწილი აკლია" აღარ არის სწორი
        $this->assertSame(0, $this->user->notifications()->where('type', NotificationType::FRANCHISE_GAPS)->count());
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

        $this->assertSame(['Reloaded'], $this->missing());

        // ერთ ნაწილზე — მისი შეტყობინებაც ქრება
        $this->patchJson('/api/franchises/'.self::SAGA.'/reminders', ['muted' => true, 'tmdb_id' => 604])
            ->assertOk()
            ->assertJsonPath('muted', true);
        $this->assertSame([], $this->missing());

        // მთელ ფრანჩაიზზე — ახალი ნაწილიც აღარ მოდის
        $this->patchJson('/api/franchises/'.self::SAGA.'/reminders', ['muted' => true])->assertOk();
        $this->assertTrue($this->tracker()->muted($this->user, self::SAGA));

        $this->parts[] = ['id' => 607, 'title' => 'Matrix 6', 'release_date' => '2021-12-22'];
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

        $this->assertSame(['Reloaded'], $this->missing());

        // მეორე ნაწილი დაემატა — მასზე დაწერილი „აკლია" ქრება, ახალი არაფერი მოდის
        $this->tracker()->track($this->movie(604, 'Reloaded', 2003));

        $this->assertSame([], $this->missing());
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

        $this->assertSame(['Reloaded'], $this->missing());
        $this->assertSame(['The Matrix'], $this->missing($keyless));
        $this->assertNotNull(Cache::get(CheckFranchisesCommand::HEARTBEAT));
        // ფრანჩაიზების ცხრილი საერთოა — ორი ანგარიშის ერთი ფრანჩაიზი ერთხელ იკითხება
        Http::assertSentCount(1);

        // მეორე გაშვება არაფერს იმეორებს
        $this->artisan('franchises:check', ['--delay' => 0])->assertSuccessful();
        $this->assertCount(1, $this->missing());
    }

    /** „ფრანჩაიზების" გვერდი: მხოლოდ ჩემი, ნაგულისხმევად დაუსრულებელი; ურნისა და ჩაკეტილის გარეშე */
    public function test_the_franchises_page_lists_my_unfinished_franchises_with_their_parts(): void
    {
        $mine = $this->movie(603, 'The Matrix', 1999);
        $this->tracker()->refresh(self::SAGA);

        // სრული ფრანჩაიზი — ორივე ნაწილი მაქვს
        foreach ([[11, 'Alpha', '2001-01-01'], [12, 'Beta', '2004-01-01']] as [$id, $title, $date]) {
            FranchisePart::create(['tmdb_collection_id' => 77, 'collection_name' => 'Done Saga', 'tmdb_id' => $id, 'title' => $title, 'release_date' => $date, 'checked_at' => now()]);
            $this->movie($id, $title, (int) substr($date, 0, 4), null, ['tmdb_collection_id' => 77, 'collection_name' => 'Done Saga']);
        }

        // სხვისი ფრანჩაიზი ჩემს სიაში არ ჩანს
        $other = $this->makeUser('dato');
        FranchisePart::create(['tmdb_collection_id' => 88, 'collection_name' => 'Other Saga', 'tmdb_id' => 21, 'title' => 'One', 'release_date' => '2010-01-01', 'checked_at' => now()]);
        FranchisePart::create(['tmdb_collection_id' => 88, 'collection_name' => 'Other Saga', 'tmdb_id' => 22, 'title' => 'Two', 'release_date' => '2012-01-01', 'checked_at' => now()]);
        $this->movie(21, 'One', 2010, $other, ['tmdb_collection_id' => 88, 'collection_name' => 'Other Saga']);

        $res = $this->getJson('/api/movies/franchises')->assertOk();
        $res->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.counts', ['open' => 1, 'complete' => 1, 'muted' => 0])
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.collection_id', self::SAGA)
            ->assertJsonPath('data.0.name', 'The Matrix Collection')
            ->assertJsonPath('data.0.state', 'open')
            ->assertJsonPath('data.0.owned', 1)
            ->assertJsonPath('data.0.total', 3)
            ->assertJsonPath('data.0.missing', 2)
            // ყურების რიგით; ჩემი ნაწილი ჩანაწერზე მიუთითებს, გამოუსვლელი ცალკეა მონიშნული
            ->assertJsonPath('data.0.parts.0.title', 'The Matrix')
            ->assertJsonPath('data.0.parts.0.owned', true)
            ->assertJsonPath('data.0.parts.0.movie_id', $mine->id)
            ->assertJsonPath('data.0.parts.1.title', 'Reloaded')
            ->assertJsonPath('data.0.parts.1.owned', false)
            ->assertJsonPath('data.0.parts.1.released', true)
            ->assertJsonPath('data.0.parts.2.title', 'Matrix 5')
            ->assertJsonPath('data.0.parts.2.released', false);

        // სრულებიც — სახელით დალაგებული; გვერდი ფრანჩაიზებს ითვლის
        $this->assertSame(['Done Saga', 'The Matrix Collection'], array_column($this->getJson('/api/movies/franchises?complete=1')->json('data'), 'name'));
        $paged = $this->getJson('/api/movies/franchises?complete=1&per_page=1&page=2')->assertOk();
        $paged->assertJsonPath('meta.last_page', 2)->assertJsonPath('data.0.name', 'The Matrix Collection');

        // შეტყობინებიდან გახსნილი ფრანჩაიზი ფილტრის მიუხედავად ჩანს და პირველია
        $this->assertSame([77, self::SAGA], array_column($this->getJson('/api/movies/franchises?open=77')->json('data'), 'collection_id'));

        // ურნაში მყოფი ასლი: არც „მაქვს"-ია, არც „აკლია" — გვერდზე არ ჩანს და არ ითვლება
        $this->movie(604, 'Reloaded', 2003)->moveToTrash();
        $saga = $this->getJson('/api/movies/franchises')->json('data.0');
        $this->assertSame(['The Matrix', 'Matrix 5'], array_column($saga['parts'], 'title'));
        $this->assertSame([1, 2, 1], [$saga['owned'], $saga['total'], $saga['missing']]);

        // სხვა ანგარიში მხოლოდ თავისას ხედავს
        $this->actingAs($other);
        $this->assertSame([88], array_column($this->getJson('/api/movies/franchises')->json('data'), 'collection_id'));
    }

    public function test_muted_and_all_locked_franchises_leave_the_default_page(): void
    {
        $this->movie(603, 'The Matrix', 1999);
        $this->tracker()->refresh(self::SAGA);

        // ერთი ნაკლული გაჩუმდა — ფრანჩაიზი ღია რჩება, რიცხვი კლებულობს
        $this->tracker()->mute($this->user, self::SAGA, 604);
        $saga = $this->getJson('/api/movies/franchises')->json('data.0');
        $this->assertSame(['open', 1], [$saga['state'], $saga['missing']]);
        $this->assertTrue($saga['parts'][1]['muted']);

        // ყველა ნაკლული გაჩუმდა — ნაგულისხმევ სიაში აღარ არის
        $this->tracker()->mute($this->user, self::SAGA, 606);
        $this->getJson('/api/movies/franchises')->assertJsonCount(0, 'data')->assertJsonPath('meta.counts.muted', 1);
        $this->getJson('/api/movies/franchises?muted=1')->assertJsonPath('data.0.state', 'muted')->assertJsonPath('data.0.muted', false);

        // მთელი ფრანჩაიზის გაჩუმება იმავე ჭრილშია, `muted` კი ამას ცალკე ამბობს
        $this->tracker()->mute($this->user, self::SAGA);
        $this->getJson('/api/movies/franchises?muted=1')->assertJsonPath('data.0.state', 'muted')->assertJsonPath('data.0.muted', true);

        // ფრანჩაიზი, რომლის ერთადერთი ჩემი ნაწილი ჩაკეტილია, გვერდზე საერთოდ არ არის
        $other = $this->makeUser('dato');
        $hidden = $this->movie(603, 'The Matrix', 1999, $other);
        RecordLock::create([
            'user_id' => $other->id,
            'lockable_type' => $hidden->getMorphClass(),
            'lockable_id' => $hidden->getKey(),
            'password_hash' => Hash::make('secret1'),
        ]);

        $this->actingAs($other);
        $this->getJson('/api/movies/franchises?complete=1&muted=1')->assertOk()
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('meta.counts', ['open' => 0, 'complete' => 0, 'muted' => 0]);
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
