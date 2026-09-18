<?php

namespace Tests\Feature;

use App\Models\Anime;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Series;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **TMDB-ზე დამოკიდებული endpoint-ები** (Tasks DEBT-14).
 *
 * ⚠️ ესენი აპის **მთავარი გზებია** — „დაამატე discover-იდან", „განაახლე
 * TMDB-დან", „ფრანჩაიზის ნაწილები" — და აუდიტამდე მათ **არცერთი ტესტი**
 * არ ეხებოდა. BUG-16-იც და BUG-19-იც სწორედ დაუტესტავ ბრანჩებში იჯდა.
 *
 * ⚠️ ნამდვილი TMDB აქ არ იძახება: `Http::fake()` ყველაფერს იჭერს და
 * **გასაღების არქონაც** ცალკე მოწმდება — „წყარო არ არის" და „ვერაფერი
 * ვიპოვე" ამ აპში ორი სხვადასხვა პასუხია (503 vs 404/ცარიელი სია).
 */
class TmdbEndpointsTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private User $other;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        config()->set('services.tmdb.key', 'test-key');

        $this->user = $this->makeUser('ana');
        $this->other = $this->makeUser('gio');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'series', 'anime'])->pluck('id')->all());

        return $user->refresh();
    }

    /** ერთი ფილმის დეტალები + credits + videos; ქართული პასუხიც იმავე ფორმისაა */
    private function fakeTmdb(array $extra = []): void
    {
        Http::fake($extra + [
            'api.themoviedb.org/3/movie/*/credits*' => Http::response(['cast' => []]),
            'api.themoviedb.org/3/tv/*/credits*' => Http::response(['cast' => []]),
            'api.themoviedb.org/3/movie/*/videos*' => Http::response(['results' => []]),
            'api.themoviedb.org/3/tv/*/videos*' => Http::response(['results' => []]),
            'api.themoviedb.org/3/movie/*' => Http::response([
                'id' => 603,
                'title' => 'The Matrix',
                'overview' => 'A hacker learns the truth.',
                'release_date' => '1999-03-30',
                'vote_average' => 8.2,
                'genres' => [],
            ]),
            'api.themoviedb.org/3/tv/*' => Http::response([
                'id' => 1396,
                'name' => 'Breaking Bad',
                'overview' => 'A teacher turns to crime.',
                'first_air_date' => '2008-01-20',
                'vote_average' => 8.9,
                'genres' => [],
                'number_of_seasons' => 5,
                'number_of_episodes' => 62,
            ]),
        ]);
    }

    /* ============================================================
       `GET /movies/{movie}/collection`
       ============================================================ */

    public function test_the_collection_lists_the_parts_and_marks_the_owned_ones(): void
    {
        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 603]);
        $owned = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 604]);

        Http::fake([
            'api.themoviedb.org/3/collection/*' => Http::response([
                'name' => 'The Matrix Collection',
                'parts' => [
                    ['id' => 604, 'title' => 'Reloaded', 'release_date' => '2003-05-15', 'poster_path' => '/b.jpg'],
                    ['id' => 603, 'title' => 'The Matrix', 'release_date' => '1999-03-30', 'poster_path' => '/a.jpg'],
                    // ⚠️ პოსტერის გარეშე ნაწილი განზრახ ეცემა — ბარათი მას ვერ დახატავდა
                    ['id' => 605, 'title' => 'Revolutions', 'release_date' => '2003-11-05'],
                ],
            ]),
            'api.themoviedb.org/3/movie/*' => Http::response([
                'id' => 603,
                'belongs_to_collection' => ['id' => 2344, 'name' => 'The Matrix Collection'],
            ]),
        ]);

        $res = $this->actingAs($this->user)->getJson("/api/movies/{$movie->id}/collection")->assertOk();

        $res->assertJsonPath('name', 'The Matrix Collection');
        // ⚠️ თანმიმდევრობა ყურებისაა (გამოსვლის თარიღი), და არა TMDB-ის
        $res->assertJsonPath('parts.0.title', 'The Matrix');
        $res->assertJsonCount(2, 'parts');
        $res->assertJsonPath('parts.1.owned', true);
        $res->assertJsonPath('parts.1.movie_id', $owned->id);
    }

    /** ⚠️ კოლექციის არქონა **ცარიელი სიაა და არა შეცდომა** */
    public function test_a_movie_without_a_collection_answers_an_empty_list(): void
    {
        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 603]);

        Http::fake(['api.themoviedb.org/3/movie/*' => Http::response(['id' => 603])]);

        $this->actingAs($this->user)->getJson("/api/movies/{$movie->id}/collection")
            ->assertOk()
            ->assertJsonPath('name', null)
            ->assertJsonPath('parts', []);
    }

    public function test_another_users_collection_is_a_404(): void
    {
        $movie = Movie::create(['user_id' => $this->other->id, 'tmdb_id' => 603]);

        $this->actingAs($this->user)->getJson("/api/movies/{$movie->id}/collection")->assertNotFound();
    }

    /* ============================================================
       `POST /{domain}/{id}/resync` — სამივე დომენი
       ============================================================ */

    public function test_resync_fills_a_movie_from_tmdb(): void
    {
        $this->fakeTmdb();
        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 603]);

        $this->actingAs($this->user)->postJson("/api/movies/{$movie->id}/resync")
            ->assertOk()
            ->assertJsonPath('data.title_en', 'The Matrix');

        $this->assertSame(1999, $movie->fresh()->year);
    }

    public function test_resync_fills_a_series_and_an_anime_from_tmdb(): void
    {
        $this->fakeTmdb();
        $series = Series::create(['user_id' => $this->user->id, 'tmdb_id' => 1396]);
        $anime = Anime::create(['user_id' => $this->user->id, 'tmdb_id' => 1396]);

        $this->actingAs($this->user)->postJson("/api/series/{$series->id}/resync")
            ->assertOk()
            ->assertJsonPath('data.title_en', 'Breaking Bad');

        $this->actingAs($this->user)->postJson("/api/anime/{$anime->id}/resync")
            ->assertOk()
            ->assertJsonPath('data.title_en', 'Breaking Bad');

        $this->assertSame(5, $series->fresh()->seasons);
    }

    /** ⚠️ „წყარო არ არის" 503-ია და არა 500 — `bgg_unavailable`-ის იგივე წესი */
    public function test_resync_without_a_key_is_a_503(): void
    {
        config()->set('services.tmdb.key', '');
        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 603]);

        $this->actingAs($this->user)->postJson("/api/movies/{$movie->id}/resync")
            ->assertStatus(503)
            ->assertJson(['message' => 'tmdb_not_configured']);
    }

    public function test_another_users_resync_is_a_404(): void
    {
        $this->fakeTmdb();
        $movie = Movie::create(['user_id' => $this->other->id, 'tmdb_id' => 603]);

        $this->actingAs($this->user)->postJson("/api/movies/{$movie->id}/resync")->assertNotFound();
    }

    /* ============================================================
       `POST /media/sync/{type}/{id}` — ბულკ-სინქრონის ერთი ბიჯი
       ============================================================ */

    public function test_the_sync_step_updates_only_the_requested_fields(): void
    {
        $this->fakeTmdb();
        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 603, 'rating' => 1.0]);

        $this->actingAs($this->user)
            ->postJson("/api/media/sync/movie/{$movie->id}", ['fields' => ['year'], 'overwrite' => true])
            ->assertOk()
            ->assertJsonPath('ok', true);

        $movie->refresh();
        $this->assertSame(1999, $movie->year);
        // ⚠️ რეიტინგი არ მოითხოვეს — ე.ი. ხელით დაწერილი მნიშვნელობა რჩება
        $this->assertSame(1.0, (float) $movie->rating);
    }

    public function test_the_sync_step_never_touches_another_users_record(): void
    {
        $this->fakeTmdb();
        $movie = Movie::create(['user_id' => $this->other->id, 'tmdb_id' => 603]);

        $this->actingAs($this->user)
            ->postJson("/api/media/sync/movie/{$movie->id}", ['fields' => ['year']])
            ->assertNotFound();

        $this->assertNull($movie->fresh()->year);
    }

    /**
     * ⚠️ **404 და არა 422**: მარშრუტის `whereIn('type', MediaDomain::TYPES)`
     * უცნობ დომენს კონტროლერამდე საერთოდ არ უშვებს, ე.ი. `item()`-ის
     * `invalid_type` 422 HTTP-ით მიუწვდომელია — ის მხოლოდ კოდის
     * შიგნიდან გამოცდაობა. ეს ფაქტი თავისთავად ღირს დამაგრებას.
     */
    public function test_the_sync_step_refuses_an_unknown_domain(): void
    {
        $this->fakeTmdb();

        $this->actingAs($this->user)
            ->postJson('/api/media/sync/song/1', ['fields' => ['year']])
            ->assertNotFound();
    }

    /* ============================================================
       `POST /lookup[/candidates]`
       ============================================================ */

    public function test_lookup_candidates_returns_the_pick_list(): void
    {
        Http::fake([
            'api.themoviedb.org/3/search/movie*' => Http::response([
                'results' => [
                    ['id' => 603, 'title' => 'The Matrix', 'release_date' => '1999-03-30', 'poster_path' => '/a.jpg'],
                ],
            ]),
        ]);

        $this->actingAs($this->user)
            ->postJson('/api/lookup/candidates', ['type' => 'movie', 'query' => 'matrix'])
            ->assertOk()
            ->assertJsonPath('data.0.tmdb_id', 603);
    }

    /** ⚠️ ცარიელი მოთხოვნა **მანქანური კოდია** და არა ცარიელი სია */
    public function test_lookup_without_a_query_is_a_422(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/lookup/candidates', ['type' => 'movie'])
            ->assertStatus(422)
            ->assertJson(['message' => 'lookup_query_required']);
    }

    public function test_lookup_builds_a_draft_by_tmdb_id(): void
    {
        $this->fakeTmdb();

        $this->actingAs($this->user)
            ->postJson('/api/lookup', ['type' => 'movie', 'tmdb_id' => 603])
            ->assertOk()
            ->assertJsonPath('data.title_en', 'The Matrix')
            ->assertJsonPath('data.year', 1999);
    }

    public function test_lookup_without_a_key_is_a_503(): void
    {
        config()->set('services.tmdb.key', '');

        $this->actingAs($this->user)
            ->postJson('/api/lookup', ['type' => 'movie', 'tmdb_id' => 603])
            ->assertStatus(503)
            ->assertJson(['message' => 'tmdb_not_configured']);
    }

    /* ============================================================
       `GET /discover`
       ============================================================ */

    public function test_discover_lists_results_and_marks_the_owned_ones(): void
    {
        Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 603]);

        Http::fake([
            'api.themoviedb.org/3/genre/*' => Http::response(['genres' => []]),
            'api.themoviedb.org/3/discover/*' => Http::response([
                'page' => 1,
                'total_pages' => 1,
                'results' => [
                    ['id' => 603, 'title' => 'The Matrix', 'release_date' => '1999-03-30', 'poster_path' => '/a.jpg', 'vote_average' => 8.2, 'genre_ids' => []],
                    ['id' => 604, 'title' => 'Reloaded', 'release_date' => '2003-05-15', 'poster_path' => '/b.jpg', 'vote_average' => 7.0, 'genre_ids' => []],
                ],
            ]),
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/discover?type=movie')->assertOk();

        $ids = collect($res->json('results'))->pluck('tmdb_id')->all();
        $this->assertContains(603, $ids);

        $owned = collect($res->json('results'))->firstWhere('tmdb_id', 603);
        // ⚠️ `owned` **ჩემი** ბიბლიოთეკიდან მოდის: სხვისი ჩანაწერი აქ არ ითვლება
        $this->assertTrue($owned['owned']);
    }

    public function test_discover_without_a_key_is_a_503(): void
    {
        config()->set('services.tmdb.key', '');

        $this->actingAs($this->user)->getJson('/api/discover?type=movie')
            ->assertStatus(503)
            ->assertJson(['message' => 'tmdb_not_configured']);
    }
}
