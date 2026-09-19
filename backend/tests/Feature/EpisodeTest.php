<?php

namespace Tests\Feature;

use App\Models\Anime;
use App\Models\Module;
use App\Models\Series;
use App\Models\Status;
use App\Models\TvEpisode;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **FEAT-09 — სეზონები და ეპიზოდები.**
 *
 * ⚠️ **ეპიზოდის ცხრილი გლობალურია** (`tv_episodes`, `user_id` არ აქვს) —
 * ე.ი. ორი ანგარიში ერთსა და იმავე რიგებს იზიარებს და მთელი მფლობელობა
 * `episode_watches`-ზე დგას. სწორედ ამიტომ არის „სხვას არ ჩანს" აქ
 * ყველაზე მნიშვნელოვანი ტესტი.
 */
class EpisodeTest extends TestCase
{
    use RefreshDatabase;

    private User $me;

    private User $other;

    private Series $series;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        config()->set('services.tmdb.key', 'test-key');

        $this->me = $this->makeUser('epi');
        $this->other = $this->makeUser('epo');

        $this->series = Series::create(['user_id' => $this->me->id, 'tmdb_id' => 1396, 'year' => 2008]);
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', ['series', 'anime'])->pluck('id')->all());

        return $user->refresh();
    }

    /** ორი სეზონი, ორ-ორი ეპიზოდი — TMDB-ის გარეშე */
    private function seedEpisodes(int $tmdbSeriesId = 1396): void
    {
        foreach ([1, 2] as $season) {
            foreach ([1, 2] as $episode) {
                TvEpisode::create([
                    'tmdb_series_id' => $tmdbSeriesId,
                    'season_number' => $season,
                    'episode_number' => $episode,
                    'name' => "S{$season}E{$episode}",
                    'air_date' => sprintf('2025-%02d-%02d', $season, $episode),
                ]);
            }
        }
    }

    private function overview(User $user, string $type = 'series', ?int $id = null): array
    {
        $id ??= $this->series->id;

        return $this->actingAs($user)->getJson("/api/media/episodes/{$type}/{$id}")->assertOk()->json();
    }

    /** ⚠️ მთავარი: მონიშვნა ჩემია და სხვას არ ჩანს */
    public function test_a_mark_is_mine_and_invisible_to_another_account(): void
    {
        $this->seedEpisodes();
        $episode = TvEpisode::firstOrFail();

        $this->actingAs($this->me)
            ->patchJson("/api/media/episodes/series/{$this->series->id}", [
                'watched' => true,
                'episode_ids' => [$episode->id],
            ])
            ->assertOk()
            ->assertJsonPath('watched', 1);

        // იმავე TMDB-ის სერიალი მეორე ანგარიშზე — ეპიზოდები საერთოა, მონიშვნა არა
        $theirs = Series::create(['user_id' => $this->other->id, 'tmdb_id' => 1396]);

        $this->assertSame(0, $this->overview($this->other, 'series', $theirs->id)['watched']);
        $this->assertSame(1, $this->overview($this->me)['watched']);
    }

    /** ⚠️ სეზონის სრულად მონიშვნა → ამ სეზონის პროგრესი 100% */
    public function test_finishing_a_season_puts_it_at_a_hundred_percent(): void
    {
        $this->seedEpisodes();

        $payload = $this->actingAs($this->me)
            ->patchJson("/api/media/episodes/series/{$this->series->id}", ['watched' => true, 'season' => 1])
            ->assertOk()
            ->json();

        $first = collect($payload['seasons'])->firstWhere('season', 1);
        $second = collect($payload['seasons'])->firstWhere('season', 2);

        $this->assertSame($first['total'], $first['watched']);
        $this->assertSame(0, $second['watched']);
        // მთლიანი პროგრესი კი ჯერ ნახევარია
        $this->assertSame(50, $payload['percent']);
    }

    /**
     * სტატუსი პროგრესიდან — **მხოლოდ წინ**.
     *
     * ⚠️ `done`-იდან უკან დაბრუნება განზრახ არ ხდება: „დავასრულე და
     * თავიდან ვუყურებ" კანონიერი მდგომარეობაა და ავტომატური დაწევა მას
     * ჩუმად გააუქმებდა.
     */
    public function test_the_status_moves_forward_only(): void
    {
        $this->seedEpisodes();
        Status::ensureDefaults($this->me->id, 'series');

        $one = TvEpisode::firstOrFail();

        $this->actingAs($this->me)->patchJson("/api/media/episodes/series/{$this->series->id}", [
            'watched' => true, 'episode_ids' => [$one->id],
        ])->assertOk()->assertJsonPath('status_role', 'doing');

        $this->actingAs($this->me)->patchJson("/api/media/episodes/series/{$this->series->id}", [
            'watched' => true,
            'episode_ids' => TvEpisode::pluck('id')->all(),
        ])->assertOk()->assertJsonPath('status_role', 'done');

        // ყველაფრის მოხსნა სტატუსს **არ** აბრუნებს უკან
        $this->actingAs($this->me)->patchJson("/api/media/episodes/series/{$this->series->id}", [
            'watched' => false,
            'episode_ids' => TvEpisode::pluck('id')->all(),
        ])->assertOk()->assertJsonPath('status_role', null);

        $this->assertSame('done', $this->series->refresh()->status_role);
    }

    /**
     * ⚠️ „შემდეგი" პირველი **უნახავია** და არა ბოლო ნანახის მომდევნო —
     * შუაში გამოტოვებული ეპიზოდი სხვაგვარად სამუდამოდ დაიმარხებოდა.
     */
    public function test_next_is_the_first_unwatched_even_with_a_gap(): void
    {
        $this->seedEpisodes();
        $second = TvEpisode::where('season_number', 1)->where('episode_number', 2)->firstOrFail();

        $this->actingAs($this->me)->patchJson("/api/media/episodes/series/{$this->series->id}", [
            'watched' => true, 'episode_ids' => [$second->id],
        ])->assertOk();

        $next = $this->overview($this->me)['next'];

        $this->assertSame(1, $next['season']);
        $this->assertSame(1, $next['episode']);
    }

    /** სხვა სერიალის ეპიზოდის მონიშვნა ერთი რექვესთით შეუძლებელია */
    public function test_an_episode_of_another_series_cannot_be_marked(): void
    {
        $this->seedEpisodes();
        $this->seedEpisodes(999);

        $foreign = TvEpisode::where('tmdb_series_id', 999)->firstOrFail();

        $this->actingAs($this->me)
            ->patchJson("/api/media/episodes/series/{$this->series->id}", [
                'watched' => true, 'episode_ids' => [$foreign->id],
            ])
            ->assertOk()
            ->assertJsonPath('changed', 0)
            ->assertJsonPath('watched', 0);
    }

    /** ანიმე იმავე endpoint-ზე გადის — ორი თითქმის იდენტური მარშრუტი არ არსებობს */
    public function test_anime_uses_the_same_endpoint(): void
    {
        $anime = Anime::create(['user_id' => $this->me->id, 'tmdb_id' => 31910, 'year' => 2009]);
        $this->seedEpisodes(31910);

        $this->assertSame(4, $this->overview($this->me, 'anime', $anime->id)['total']);

        // ⚠️ ფილმს სეზონი არ აქვს — მარშრუტი მას საერთოდ არ იღებს
        $this->actingAs($this->me)->getJson('/api/media/episodes/movie/1')->assertStatus(404);
    }

    /** TMDB-იდან ჩამოტანა — ერთი სეზონი, ორი ეპიზოდი */
    public function test_episodes_are_fetched_from_tmdb(): void
    {
        Http::fake([
            'api.themoviedb.org/3/tv/1396/season/1*' => Http::response([
                'episodes' => [
                    ['episode_number' => 1, 'name' => 'Pilot', 'air_date' => '2008-01-20', 'runtime' => 58],
                    // ⚠️ TMDB უცნობ თარიღზე **ცარიელ სტრიქონს** წერს და არა `null`-ს
                    ['episode_number' => 2, 'name' => 'Cat in the Bag', 'air_date' => '', 'runtime' => 48],
                ],
            ]),
            'api.themoviedb.org/3/tv/1396*' => Http::response([
                'id' => 1396,
                'seasons' => [['season_number' => 0], ['season_number' => 1]],
            ]),
            '*' => Http::response([], 404),
        ]);

        $payload = $this->actingAs($this->me)
            ->postJson("/api/media/episodes/series/{$this->series->id}")
            ->assertOk()
            ->json();

        // ⚠️ „სპეციალური გამოშვებების" სეზონი (0) არ ჩამოიტვირთება
        $this->assertSame(1, $payload['synced']['seasons']);
        $this->assertSame(2, $payload['synced']['episodes']);
        $this->assertNull(TvEpisode::where('episode_number', 2)->firstOrFail()->air_date);

        // ხელახალი გაშვება დუბლს არ ბადებს
        $this->actingAs($this->me)->postJson("/api/media/episodes/series/{$this->series->id}")->assertOk();
        $this->assertSame(2, TvEpisode::count());
    }

    /** ხელით შექმნილ სერიალს TMDB-ზე წყარო არ აქვს — 422 და არა 500 */
    public function test_a_record_without_a_tmdb_id_is_a_422(): void
    {
        $manual = Series::create(['user_id' => $this->me->id, 'year' => 2020]);

        $this->actingAs($this->me)
            ->postJson("/api/media/episodes/series/{$manual->id}")
            ->assertStatus(422)
            ->assertJsonPath('message', 'no_tmdb_id');
    }

    /** ეპიზოდების გარეშე პროგრესი 0-ია და არა 100 */
    public function test_a_record_without_episodes_is_zero_percent(): void
    {
        $payload = $this->overview($this->me);

        $this->assertSame(0, $payload['total']);
        $this->assertSame(0, $payload['percent']);
        $this->assertNull($payload['next']);
    }
}
