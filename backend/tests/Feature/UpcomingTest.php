<?php

namespace Tests\Feature;

use App\Models\Anime;
use App\Models\Game;
use App\Models\Module;
use App\Models\NoteEntry;
use App\Models\Series;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **FEAT-10 — „მალე".**
 *
 * ⚠️ **„ახლა" ცხადად იყინება.** ფანჯარა მიმდინარე დღიდან ითვლება, ე.ი.
 * გაყინვის გარეშე ტესტი წელიწადში ერთხელ (ან თბილისის ღამის საათებში)
 * სხვაგვარად პასუხობდა — ზუსტად ის მცურავი ჩავარდნა, რომლის მიზეზსაც
 * მერე ვერავინ პოულობს.
 */
class UpcomingTest extends TestCase
{
    use RefreshDatabase;

    private User $me;

    /** TMDB-ის `next_episode_to_air` — იხ. `fakeTv()`-ის შენიშვნა */
    private ?array $next = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        Carbon::setTestNow(Carbon::parse('2026-09-19 12:00:00', 'UTC'));

        $this->me = User::create([
            'name' => 'soon', 'username' => 'soon',
            'email' => 'soon@example.com', 'password' => 'password',
        ]);
        $this->me->modules()->sync(
            Module::whereIn('key', ['series', 'anime', 'game', 'note'])->pluck('id')->all(),
        );
        $this->me->refresh();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function events(?int $days = null): array
    {
        $url = '/api/upcoming'.($days ? "?days={$days}" : '');

        return $this->actingAs($this->me)->getJson($url)->assertOk()->json('data');
    }

    /** ოთხივე წყარო ერთ სიაში, თარიღის ზრდით */
    public function test_events_from_every_source_come_back_sorted(): void
    {
        $series = Series::create(['user_id' => $this->me->id, 'year' => 2020]);
        $series->setTranslation('en', ['title' => 'Show']);
        $series->forceFill(['next_air_at' => '2026-09-25', 'next_season' => 5, 'next_episode' => 3])->save();

        Game::create(['user_id' => $this->me->id, 'title_en' => 'Game', 'release_date' => '2026-09-21']);
        NoteEntry::create(['user_id' => $this->me->id, 'title' => 'Note', 'due_at' => '2026-09-23 09:00:00']);

        $events = $this->events();

        $this->assertSame(['game', 'note', 'series'], array_column($events, 'module'));
        $this->assertSame(['2026-09-21', '2026-09-23', '2026-09-25'], array_column($events, 'date'));

        $show = $events[2];
        $this->assertSame('Show', $show['title']);
        // ⚠️ სეზონი/ეპიზოდი ცალკე რიცხვებია — „S05E03"-ს ინტერფეისი აგებს
        $this->assertSame(5, $show['season']);
        $this->assertSame(3, $show['episode']);
    }

    /** ფანჯრის გარეთ დარჩენილი მოვლენა არ ჩანს; `days`-ით ის ჩნდება */
    public function test_the_window_is_thirty_days_by_default(): void
    {
        Game::create(['user_id' => $this->me->id, 'title_en' => 'Far', 'release_date' => '2026-12-01']);

        $this->assertSame([], $this->events());
        $this->assertSame('Far', $this->events(120)[0]['title']);
    }

    /** ⚠️ წარსული არ ჩანს, დღევანდელი დღე კი ჩანს — საღამოს გასული ეპიზოდიც დღესაა */
    public function test_today_counts_but_yesterday_does_not(): void
    {
        Game::create(['user_id' => $this->me->id, 'title_en' => 'Today', 'release_date' => '2026-09-19']);
        Game::create(['user_id' => $this->me->id, 'title_en' => 'Gone', 'release_date' => '2026-09-18']);

        $this->assertSame(['Today'], array_column($this->events(), 'title'));
    }

    /** სხვისი ჩანაწერი სიაში არ ხვდება */
    public function test_another_users_event_is_absent(): void
    {
        $other = User::create([
            'name' => 'nope', 'username' => 'nope',
            'email' => 'nope@example.com', 'password' => 'password',
        ]);

        Game::create(['user_id' => $other->id, 'title_en' => 'Theirs', 'release_date' => '2026-09-21']);

        $this->assertSame([], $this->events());
    }

    /** გამორთული მოდული არ იკითხება */
    public function test_a_disabled_module_contributes_nothing(): void
    {
        Game::create(['user_id' => $this->me->id, 'title_en' => 'Hidden', 'release_date' => '2026-09-21']);

        $this->me->modules()->sync(Module::where('key', 'note')->pluck('id')->all());

        $this->assertSame([], $this->events());
    }

    /**
     * სინქრონი `next_air_at`-ს ავსებს TMDB-ის `next_episode_to_air`-იდან.
     *
     * ⚠️ **და ცარიელ პასუხზე წმენდს** — დასრულებულ სერიალს შემდეგი ეპიზოდი
     * აღარ აქვს, შენარჩუნებული ძველი თარიღი კი კალენდარში სამუდამოდ
     * წარსულში იდგებოდა.
     */
    public function test_sync_fills_and_then_clears_the_next_air_date(): void
    {
        config()->set('services.tmdb.key', 'test-key');

        $anime = Anime::create(['user_id' => $this->me->id, 'tmdb_id' => 31910]);

        $this->next = ['air_date' => '2026-09-22', 'season_number' => 2, 'episode_number' => 7];
        $this->fakeTv();

        $this->actingAs($this->me)->postJson("/api/anime/{$anime->id}/resync")->assertOk();

        $this->assertSame('2026-09-22', $anime->refresh()->next_air_at?->format('Y-m-d'));
        $this->assertSame(2, $anime->next_season);

        // დასრულებული სერიალი — TMDB შემდეგ ეპიზოდს აღარ აბრუნებს
        $this->next = null;

        $this->actingAs($this->me)->postJson("/api/anime/{$anime->id}/resync")->assertOk();

        $this->assertNull($anime->refresh()->next_air_at);
        $this->assertNull($anime->next_season);
    }

    /**
     * **მასობრივი სინქრონიც ავსებს კალენდარს** (გასწორებულია 2026-09-19).
     *
     * ⚠️ ზემოთა ტესტი `resync`-ზე გადის, ე.ი. `TvEnricher`-ზე; `/sync`-ის
     * გვერდის რიგი კი `ItemSyncer`-ს იძახებს, რომელსაც ეს სამი სვეტი
     * **საერთოდ არ ეწერა**. შედეგად ბიბლიოთეკის სინქრონიზაციის შემდეგაც
     * „მალე" ცარიელი რჩებოდა — ე.ი. ფუნქცია არსებობდა და არ მუშაობდა.
     *
     * ⚠️ **ცარიელ პასუხზე წმენდაც აქ მოწმდება**, რადგან `ItemSyncer`-ის
     * ჩვეულებრივი წესი („ცარიელს ავსებს, შევსებულს არ ეხება") სწორედ
     * იმას აკეთებდა, რაც აქ აკრძალულია.
     */
    public function test_the_bulk_sync_fills_and_clears_the_next_air_date(): void
    {
        config()->set('services.tmdb.key', 'test-key');

        $series = Series::create(['user_id' => $this->me->id, 'tmdb_id' => 1402]);

        $this->next = ['air_date' => '2026-10-02', 'season_number' => 5, 'episode_number' => 3];
        $this->fakeTv();

        $this->actingAs($this->me)
            ->postJson("/api/media/sync/series/{$series->id}", ['fields' => ['details']])
            ->assertOk();

        $series->refresh();

        $this->assertSame('2026-10-02', $series->next_air_at?->format('Y-m-d'));
        $this->assertSame(5, $series->next_season);
        $this->assertSame(3, $series->next_episode);

        // ⚠️ დასრულებული სერიალი — ძველი თარიღი უნდა გაქრეს და არა შენარჩუნდეს
        $this->next = null;

        $this->actingAs($this->me)
            ->postJson("/api/media/sync/series/{$series->id}", ['fields' => ['details']])
            ->assertOk();

        $series->refresh();

        $this->assertNull($series->next_air_at);
        $this->assertNull($series->next_season);
    }

    /**
     * ⚠️ **`Http::fake()` **ამატებს** stub-ებს და არ ცვლის.**
     *
     * `Factory::fake()` თითოეულ URL-ს `stubUrl()`-ით **აწყობს სიაში** და
     * ძველებს არ შლის, ე.ი. მეორედ გამოძახებული `Http::fake()` **ჩუმად
     * არაფერს ცვლის**: პირველი დამთხვეული stub იგებს. სწორედ ამიტომ
     * პასუხი აქ **ერთია** და იცვლება `$this->next`, და არა fake.
     */
    private function fakeTv(): void
    {
        Http::fake([
            'api.themoviedb.org/3/tv/*/credits*' => Http::response(['cast' => []]),
            'api.themoviedb.org/3/tv/*/videos*' => Http::response(['results' => []]),
            'api.themoviedb.org/3/tv/*' => fn () => Http::response([
                'id' => 31910,
                'name' => 'Brotherhood',
                'next_episode_to_air' => $this->next,
            ]),
            '*' => Http::response([], 404),
        ]);
    }
}
