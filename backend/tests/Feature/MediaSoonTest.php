<?php

namespace Tests\Feature;

use App\Models\Anime;
use App\Models\Module;
use App\Models\Movie;
use App\Models\RecordLock;
use App\Models\Series;
use App\Models\User;
use App\Services\Sync\ItemSyncer;
use App\Support\AppTime;
use App\Support\NotificationType;
use App\Support\StatusDomain;
use App\Support\Upcoming;
use Database\Seeders\ModulesSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * **„მალე" — გამოუსვლელი სათაურები ფილმში, სერიალსა და ანიმეში.**
 *
 * ⚠️ მოწმდება: სია აჩვენებს იმას, რაც დღეს ან წინ გამოდის, ახლოდან შორისკენ, უთარიღო
 * (მხოლოდ გამოცხადებული) ბოლოში; სერიალსა და ანიმეზე შემდეგი სერიაც ითვლება; ჩაკეტილი
 * და სხვისი ჩანაწერი არ ჩანს; თარიღი და TMDB-ის მდგომარეობა სინქრონიზაციისას იწერება;
 * გამოსვლის დღეს ერთ ჩანაწერზე ერთი შეტყობინება მოდის; „TMDB-ზე მალე" თრეილერს და
 * „უკვე მაქვს" ნიშანს აბრუნებს.
 */
class MediaSoonTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('nino');
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'series', 'anime'])->pluck('id')->all());

        return $user->refresh();
    }

    /** @return array<string, array{class-string<Model>, string, bool}> */
    public static function modules(): array
    {
        return [
            'movie' => [Movie::class, '/api/movies', false],
            'series' => [Series::class, '/api/series', true],
            'anime' => [Anime::class, '/api/anime', true],
        ];
    }

    /** @param  class-string<Model>  $model */
    private function record(string $model, string $title, array $attributes = [], ?User $owner = null): Model
    {
        $record = $model::create(['user_id' => ($owner ?? $this->user)->id, 'year' => 2026, ...$attributes]);
        $record->setTranslation('en', ['title' => $title]);

        return $record;
    }

    private function day(int $offset): string
    {
        return AppTime::now()->addDays($offset)->format('Y-m-d');
    }

    #[DataProvider('modules')]
    public function test_the_list_shows_what_is_ahead_nearest_first_and_the_undated_last(string $model, string $uri): void
    {
        $this->record($model, 'Next month', ['release_date' => $this->day(30)]);
        $this->record($model, 'Announced', ['tmdb_status' => 'Planned']);
        $this->record($model, 'Today', ['release_date' => $this->day(0), 'trailer_url' => 'https://www.youtube.com/watch?v=abc12345678']);
        $this->record($model, 'Next week', ['release_date' => $this->day(7)]);
        // უკვე გამოსული და უთარიღო „გამოსული" სიაში არ ხვდება
        $this->record($model, 'Yesterday', ['release_date' => $this->day(-1), 'tmdb_status' => 'Released']);
        $this->record($model, 'Old and undated', ['tmdb_status' => 'Released']);
        $this->record($model, 'Nothing known');

        $rows = $this->actingAs($this->user)->getJson("{$uri}/soon")->assertOk()->json('data');

        $this->assertSame(['Today', 'Next week', 'Next month', 'Announced'], array_column($rows, 'title_en'));
        $this->assertSame([0, 7, 30, null], array_column($rows, 'days'));
        $this->assertSame(['premiere', 'premiere', 'premiere', 'announced'], array_column($rows, 'kind'));
        $this->assertSame($this->day(7), $rows[1]['date']);

        // თრეილერი აპის ფლეიერისთვის — ჩაშენებადი მისამართით; სადაც არ არის, `null`
        $this->assertSame('youtube', $rows[0]['trailer']['platform']);
        $this->assertStringContainsString('abc12345678', $rows[0]['trailer']['embed_url']);
        $this->assertNull($rows[1]['trailer']);
    }

    public function test_a_series_counts_its_next_episode_and_knows_a_new_season(): void
    {
        $this->record(Series::class, 'Mid season', [
            'release_date' => '2020-01-01', 'next_air_at' => $this->day(3), 'next_season' => 2, 'next_episode' => 5,
        ]);
        $this->record(Series::class, 'New season', [
            'release_date' => '2019-01-01', 'next_air_at' => $this->day(10), 'next_season' => 4, 'next_episode' => 1,
        ]);
        $this->record(Series::class, 'Ended', ['release_date' => '2010-01-01', 'next_air_at' => $this->day(-5)]);

        $rows = $this->actingAs($this->user)->getJson('/api/series/soon')->assertOk()->json('data');

        $this->assertSame(['Mid season', 'New season'], array_column($rows, 'title_en'));
        $this->assertSame(['episode', 'season'], array_column($rows, 'kind'));
        $this->assertSame([2, 5], [$rows[0]['season'], $rows[0]['episode']]);
        $this->assertSame(10, $rows[1]['days']);

        // ფილმს შემდეგი სერია არ აქვს — იგივე სვეტი მასზე არ მოქმედებს
        $this->record(Movie::class, 'Released movie', ['release_date' => '2020-01-01']);
        $this->assertSame([], $this->actingAs($this->user)->getJson('/api/movies/soon')->json('data'));
    }

    #[DataProvider('modules')]
    public function test_a_locked_or_foreign_record_is_not_listed(string $model, string $uri): void
    {
        $this->record($model, 'Mine', ['release_date' => $this->day(5)]);
        $this->record($model, 'Theirs', ['release_date' => $this->day(5)], $this->makeUser('dato'));
        $locked = $this->record($model, 'Locked', ['release_date' => $this->day(5)]);

        RecordLock::create([
            'user_id' => $this->user->id,
            'lockable_type' => $locked->getMorphClass(),
            'lockable_id' => $locked->getKey(),
            'password_hash' => Hash::make('secret1'),
        ]);

        $rows = $this->actingAs($this->user)->getJson("{$uri}/soon")->assertOk()->json('data');

        $this->assertSame(['Mine'], array_column($rows, 'title_en'));
    }

    public function test_soon_is_a_reserved_section_key(): void
    {
        $this->assertContains('soon', StatusDomain::RESERVED_KEYS);
    }

    /** თარიღი და მდგომარეობა TMDB-ის ფაქტია: არჩეულ ველებს არ ეკითხება და ცარიელი პასუხი ძველს არ შლის */
    public function test_a_sync_writes_the_release_date_and_the_tmdb_status(): void
    {
        $this->giveCredential($this->user, 'tmdb');
        $this->actingAs($this->user);

        $details = ['id' => 603, 'title' => 'Avatar 4', 'release_date' => '2029-12-21', 'status' => 'Post Production'];
        Http::fake([
            'api.themoviedb.org/3/movie/*/credits*' => fn () => Http::response(['cast' => []]),
            'api.themoviedb.org/3/movie/*/videos*' => fn () => Http::response(['results' => []]),
            'api.themoviedb.org/3/movie/*' => function () use (&$details) {
                return Http::response($details);
            },
        ]);

        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 603])->refresh();

        $result = app(ItemSyncer::class)->sync($movie, ['fields' => ['year']]);

        $this->assertContains('release', $result['changed']);
        $this->assertSame('2029-12-21', $movie->refresh()->release_date->format('Y-m-d'));
        $this->assertSame('Post Production', $movie->tmdb_status);

        // იგივე პასუხი — ცვლილება არ არის
        $this->assertNotContains('release', app(ItemSyncer::class)->sync($movie, ['fields' => ['year']])['changed']);

        // ცარიელი თარიღი ძველს არ შლის, მდგომარეობა კი ახლდება
        $details = ['id' => 603, 'title' => 'Avatar 4', 'release_date' => '', 'status' => 'Released'];
        app(ItemSyncer::class)->sync($movie, ['fields' => ['year']]);
        $this->assertSame('2029-12-21', $movie->refresh()->release_date->format('Y-m-d'));
        $this->assertSame('Released', $movie->tmdb_status);
    }

    public function test_a_tv_stamp_reads_the_first_air_date(): void
    {
        $series = new Series;

        $this->assertTrue(Upcoming::stamp($series, ['first_air_date' => '2027-03-01', 'release_date' => '1999-01-01', 'status' => 'Planned'], true));
        $this->assertSame('2027-03-01', $series->release_date->format('Y-m-d'));
        $this->assertSame('Planned', $series->tmdb_status);

        $this->assertFalse(Upcoming::stamp($series, ['first_air_date' => 'not-a-date'], true));
    }

    public function test_the_backfill_fills_existing_records_with_the_owners_key(): void
    {
        $this->giveCredential($this->user, 'tmdb');
        $keyless = $this->makeUser('dato');

        Http::fake([
            'api.themoviedb.org/3/movie/*' => fn () => Http::response(['id' => 1, 'release_date' => '2028-05-05', 'status' => 'In Production']),
        ]);

        $mine = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 1]);
        $dated = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 2, 'release_date' => '2001-01-01']);
        $theirs = Movie::create(['user_id' => $keyless->id, 'tmdb_id' => 3]);
        $paused = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 4, 'sync_paused' => true]);
        $synced = $mine->fresh()->last_synced_at;

        $this->artisan('media:release-dates', ['--delay' => 0])->assertSuccessful();

        // „აღარ განაახლო" ჩანაწერს ბრძანება არ ეხება; სინქრონის კვალი ხელუხლებელია
        $this->assertNull(Movie::withoutGlobalScopes()->find($paused->id)->release_date);
        $this->assertEquals($synced, Movie::withoutGlobalScopes()->find($mine->id)->last_synced_at);
        $this->assertSame('2028-05-05', Movie::withoutGlobalScopes()->find($mine->id)->release_date->format('Y-m-d'));
        // თარიღიანი ხელუხლებელია, გასაღების გარეშე ანგარიში — გამოტოვებული
        $this->assertSame('2001-01-01', Movie::withoutGlobalScopes()->find($dated->id)->release_date->format('Y-m-d'));
        $this->assertNull(Movie::withoutGlobalScopes()->find($theirs->id)->release_date);
    }

    public function test_release_day_sends_one_notification_per_record(): void
    {
        $movie = $this->record(Movie::class, 'Premiere', ['release_date' => $this->day(0)]);
        $movie->setTranslation('ka', ['title' => 'პრემიერა']);
        $series = $this->record(Series::class, 'Season two', [
            'release_date' => '2020-01-01', 'next_air_at' => $this->day(0), 'next_season' => 2, 'next_episode' => 1,
        ]);
        $this->record(Movie::class, 'Tomorrow', ['release_date' => $this->day(1)]);
        $locked = $this->record(Movie::class, 'Locked', ['release_date' => $this->day(0)]);
        RecordLock::create([
            'user_id' => $this->user->id,
            'lockable_type' => $locked->getMorphClass(),
            'lockable_id' => $locked->getKey(),
            'password_hash' => Hash::make('secret1'),
        ]);

        $this->artisan('media:release-notify')->assertSuccessful();
        // ორჯერ გაშვება დღევანდელს არ იმეორებს
        $this->artisan('media:release-notify')->assertSuccessful();

        $rows = $this->user->notifications()->where('type', NotificationType::RELEASE_TODAY)->get();
        $this->assertCount(2, $rows);

        $premiere = $rows->first(fn ($n) => $n->data['module'] === 'movie');
        $this->assertSame($movie->id, $premiere->data['record_id']);
        $this->assertSame('პრემიერა', $premiere->data['title_ka']);
        $this->assertSame('premiere', $premiere->data['kind']);
        $this->assertSame("/movies/{$movie->id}", NotificationType::route($premiere->type, $premiere->data));

        $season = $rows->first(fn ($n) => $n->data['module'] === 'series');
        $this->assertSame(['season', 2, 1], [$season->data['kind'], $season->data['season'], $season->data['episode']]);
        $this->assertSame("/series/{$series->id}", $season->data['path']);

        // ზარის სიაში გადასასვლელი მისამართით ჩანს
        $this->actingAs($this->user)->getJson('/api/notifications')->assertOk()
            ->assertJsonFragment(['route' => "/movies/{$movie->id}"]);
    }

    public function test_the_tmdb_tab_lists_unreleased_titles_with_a_trailer_and_marks_what_i_have(): void
    {
        Cache::flush();
        $this->giveCredential($this->user, 'tmdb');
        Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 11]);

        Http::fake([
            'api.themoviedb.org/3/discover/movie*' => fn () => Http::response([
                'total_pages' => 3,
                'results' => [
                    ['id' => 11, 'title' => 'Owned one', 'release_date' => '2030-01-01', 'poster_path' => '/a.jpg', 'genre_ids' => []],
                    ['id' => 12, 'title' => 'New one', 'release_date' => '2030-02-02', 'poster_path' => '/b.jpg', 'genre_ids' => []],
                    ['id' => 13, 'title' => 'No poster', 'release_date' => '2030-03-03', 'poster_path' => null],
                ],
            ]),
            'api.themoviedb.org/3/movie/12/videos*' => fn () => Http::response([
                'results' => [['site' => 'YouTube', 'key' => 'trailerKey12', 'type' => 'Trailer', 'official' => true]],
            ]),
            'api.themoviedb.org/3/movie/*/videos*' => fn () => Http::response(['results' => []]),
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/discover/upcoming?type=movie')->assertOk();

        $this->assertSame(3, $res->json('total_pages'));
        $this->assertSame(['Owned one', 'New one'], array_column($res->json('results'), 'title'));
        $this->assertTrue($res->json('results.0.owned'));
        $this->assertNull($res->json('results.0.trailer'));
        $this->assertFalse($res->json('results.1.owned'));
        $this->assertSame('2030-02-02', $res->json('results.1.date'));
        $this->assertStringContainsString('trailerKey12', $res->json('results.1.trailer.embed_url'));

        // TMDB-ს მხოლოდ მომავალი ეკითხება — ხვალიდან
        Http::assertSent(fn ($request) => str_contains($request->url(), 'discover/movie')
            && $request['primary_release_date.gte'] === $this->day(1));
    }

    public function test_the_tmdb_tab_needs_the_key(): void
    {
        $this->actingAs($this->user)->getJson('/api/discover/upcoming?type=movie')
            ->assertStatus(409)
            ->assertJsonPath('message', 'credential_missing');
    }
}
