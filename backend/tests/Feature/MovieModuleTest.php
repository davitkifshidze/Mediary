<?php

namespace Tests\Feature;

use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Status;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **ფილმების მოდული (აუდიტი 2026-09-14, §D).**
 *
 * ⚠️ **ცხრავე ახალ მოდულს თავისი `*ModuleTest` ჰქონდა — უძველეს ორს არა.**
 * ფილმები მხოლოდ სხვისი ტესტების გვერდით ჩნდებოდა (`GalleryTest`,
 * `TranslationTest`, `OwnershipTest`), მაშინ როცა `MovieController` 320
 * ხაზია და მასზე ყველაზე მეტი ჯვარედინი ფენა გადის.
 *
 * ⚠️ **ამ ტესტმა მაშინვე იპოვა ნამდვილი ბაგი:** `imdb_id`-ის უნიკალურობა
 * **გლობალური** იყო და არა user-ის ფარგლებში (იხ.
 * `test_two_accounts_can_add_the_same_film`).
 */
class MovieModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    private User $bob;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        $this->alice = $this->makeUser('alice');
        $this->bob = $this->makeUser('bob');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::where('key', 'movie')->pluck('id')->all());

        return $user->refresh();
    }

    private function makeMovie(User $owner, string $title, array $extra = []): Movie
    {
        $movie = Movie::create(['user_id' => $owner->id, ...$extra]);
        $movie->setTranslation('en', ['title' => $title]);

        return $movie->refresh();
    }

    /* ================= CRUD ================= */

    public function test_a_movie_can_be_created_with_both_languages(): void
    {
        $res = $this->actingAs($this->alice)->postJson('/api/movies', [
            'title_ka' => 'მატრიცა',
            'title_en' => 'The Matrix',
            'year' => 1999,
            'rating' => 8.7,
        ])->assertStatus(201);

        $res->assertJsonPath('data.title_ka', 'მატრიცა')
            ->assertJsonPath('data.title_en', 'The Matrix')
            ->assertJsonPath('data.year', 1999);

        // ⚠️ მფლობელი თვითონ ივსება (`BelongsToUser`) და არა request-იდან
        $this->assertSame($this->alice->id, Movie::withoutGlobalScope('owner')->first()->user_id);
    }

    public function test_a_movie_can_be_updated_and_deleted(): void
    {
        $movie = $this->makeMovie($this->alice, 'Matrix', ['year' => 1999]);

        $this->actingAs($this->alice)
            ->putJson("/api/movies/{$movie->id}", ['title_en' => 'The Matrix', 'year' => 2000])
            ->assertOk()
            ->assertJsonPath('data.title_en', 'The Matrix')
            ->assertJsonPath('data.year', 2000);

        $this->actingAs($this->alice)->deleteJson("/api/movies/{$movie->id}")->assertNoContent();

        $this->assertSame(0, Movie::withoutGlobalScope('owner')->count());
    }

    /**
     * **ორ ანგარიშს ერთი და იგივე ფილმი უნდა შეეძლოს დაამატოს.**
     *
     * ⚠️ **ეს ტესტი ჩავარდნილი დაიწერა.** `StoreMovieRequest`-ს
     * `unique:movies,imdb_id` ჰქონდა — **გლობალური**, მაშინ როცა ბაზის
     * ინდექსი 2026-08-28-იდან `unique(user_id, imdb_id)`-ია. შედეგად მეორე
     * ანგარიში 422-ს იღებდა („ეს ფილმი უკვე დამატებულია") და, რაც უარესია,
     * ამ პასუხით **სხვისი ბიბლიოთეკის შიგთავსს იგებდა**. `anime` მოდული
     * იმავე წესს სწორად იცავდა — ორი უძველესი დომენი გამორჩა.
     */
    public function test_two_accounts_can_add_the_same_film(): void
    {
        $this->actingAs($this->alice)->postJson('/api/movies', [
            'title_en' => 'The Matrix',
            'imdb_id' => 'tt0133093',
        ])->assertStatus(201);

        $this->actingAs($this->bob)->postJson('/api/movies', [
            'title_en' => 'The Matrix',
            'imdb_id' => 'tt0133093',
        ])->assertStatus(201);

        $this->assertSame(2, Movie::withoutGlobalScope('owner')->count());
    }

    /** ⚠️ **საკუთარ ბიბლიოთეკაში კი დუბლი აკრძალულია** — წესი მხოლოდ იწევს */
    public function test_the_same_imdb_id_twice_in_one_library_is_refused(): void
    {
        $this->actingAs($this->alice)->postJson('/api/movies', [
            'title_en' => 'The Matrix',
            'imdb_id' => 'tt0133093',
        ])->assertStatus(201);

        $this->actingAs($this->alice)->postJson('/api/movies', [
            'title_en' => 'The Matrix Again',
            'imdb_id' => 'tt0133093',
        ])->assertStatus(422)->assertJsonValidationErrors(['imdb_id']);
    }

    /** რედაქტირებაზეც: საკუთარი `imdb_id`-ის შენახვა კონფლიქტი არ არის */
    public function test_keeping_your_own_imdb_id_on_update_is_fine(): void
    {
        $movie = $this->makeMovie($this->alice, 'Matrix', ['imdb_id' => 'tt0133093']);
        $this->makeMovie($this->bob, 'Matrix', ['imdb_id' => 'tt0133093']);

        $this->actingAs($this->alice)
            // ⚠️ სათაური სავალდებულოა (`UpdateMovieRequest::withValidator`) — ერთი
            // ენა მაინც; მის გარეშე პასუხი 422-ია და არა `imdb_id`-ის კონფლიქტი
            ->putJson("/api/movies/{$movie->id}", [
                'title_en' => 'Matrix',
                'imdb_id' => 'tt0133093',
                'year' => 1999,
            ])
            ->assertOk();
    }

    public function test_a_malformed_imdb_id_is_refused(): void
    {
        $this->actingAs($this->alice)
            ->postJson('/api/movies', ['title_en' => 'X', 'imdb_id' => '0133093'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['imdb_id']);
    }

    public function test_the_year_and_rating_are_range_checked(): void
    {
        $this->actingAs($this->alice)
            ->postJson('/api/movies', ['title_en' => 'X', 'year' => 1500, 'rating' => 42])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['year', 'rating']);
    }

    /* ================= ფილტრები ================= */

    public function test_the_list_filters_by_year_range(): void
    {
        $this->makeMovie($this->alice, 'Old', ['year' => 1995]);
        $this->makeMovie($this->alice, 'New', ['year' => 2020]);

        $this->actingAs($this->alice)->getJson('/api/movies?year_min=2000')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title_en', 'New');

        $this->actingAs($this->alice)->getJson('/api/movies?year_max=2000')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title_en', 'Old');
    }

    public function test_the_list_filters_by_favorite(): void
    {
        $this->makeMovie($this->alice, 'Plain');
        $this->makeMovie($this->alice, 'Loved', ['is_favorite' => true]);

        $this->actingAs($this->alice)->getJson('/api/movies?favorite=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title_en', 'Loved');
    }

    /**
     * ⚠️ **მძიმით გამოყოფილი ჟანრები AND-ით იჭრება** და არა OR-ით — სწორედ
     * ამას აგზავნის მარჯვენა პანელი (`Controller::slugList()`).
     */
    public function test_multiple_genres_narrow_the_list(): void
    {
        $action = Genre::create(['slug' => 'action']);
        $drama = Genre::create(['slug' => 'drama']);

        $both = $this->makeMovie($this->alice, 'Both');
        $both->genres()->sync([$action->id, $drama->id]);

        $one = $this->makeMovie($this->alice, 'One');
        $one->genres()->sync([$action->id]);

        $this->actingAs($this->alice)->getJson('/api/movies?genre=action')
            ->assertOk()->assertJsonCount(2, 'data');

        $this->actingAs($this->alice)->getJson('/api/movies?genre=action,drama')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title_en', 'Both');
    }

    public function test_the_list_searches_the_title(): void
    {
        $this->makeMovie($this->alice, 'The Matrix');
        $this->makeMovie($this->alice, 'Inception');

        $this->actingAs($this->alice)->getJson('/api/movies?q=matri')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title_en', 'The Matrix');
    }

    public function test_sorting_by_year_works_both_ways(): void
    {
        $this->makeMovie($this->alice, 'Old', ['year' => 1995]);
        $this->makeMovie($this->alice, 'New', ['year' => 2020]);

        $this->actingAs($this->alice)->getJson('/api/movies?sort=year_asc')
            ->assertJsonPath('data.0.title_en', 'Old');

        $this->actingAs($this->alice)->getJson('/api/movies?sort=year_desc')
            ->assertJsonPath('data.0.title_en', 'New');
    }

    /* ================= ფრანჩაიზა ================= */

    /**
     * **კოლექციის ნაწილები გვერდიგვერდ დგება.**
     *
     * ⚠️ კლასტერი **გვერდის შიგნით** იკრიბება (ფრონტი ყოველთვის პრეფიქსს
     * ითხოვს), ე.ი. აქაც ჩატვირთულ სიაზე უნდა მუშაობდეს.
     */
    public function test_franchise_parts_are_clustered_together(): void
    {
        $this->makeMovie($this->alice, 'Part 1', ['year' => 1999, 'tmdb_collection_id' => 2344]);
        $this->makeMovie($this->alice, 'Unrelated', ['year' => 2005]);
        $this->makeMovie($this->alice, 'Part 2', ['year' => 2003, 'tmdb_collection_id' => 2344]);

        $titles = $this->actingAs($this->alice)->getJson('/api/movies?sort=year_asc')
            ->assertOk()
            ->json('data.*.title_en');

        // ორი ნაწილი ერთმანეთის გვერდითაა და შუაში უცხო არ ჩერდება
        $this->assertSame(1, abs(array_search('Part 2', $titles, true) - array_search('Part 1', $titles, true)));
    }

    /** ⚠️ `group=0` კლასტერს **თიშავს** — სუფთა დალაგება (Tasks D1) */
    public function test_grouping_can_be_switched_off(): void
    {
        $this->makeMovie($this->alice, 'Part 1', ['year' => 1999, 'tmdb_collection_id' => 2344]);
        $this->makeMovie($this->alice, 'Unrelated', ['year' => 2005]);
        $this->makeMovie($this->alice, 'Part 2', ['year' => 2020, 'tmdb_collection_id' => 2344]);

        $titles = $this->actingAs($this->alice)->getJson('/api/movies?sort=year_asc&group=0')
            ->assertOk()
            ->json('data.*.title_en');

        $this->assertSame(['Part 1', 'Unrelated', 'Part 2'], $titles);
    }

    /* ================= სტატუსი და რჩეული ================= */

    public function test_the_status_can_be_changed_by_key(): void
    {
        $movie = $this->makeMovie($this->alice, 'Matrix');

        // ლექსიკონი ლენივად იქმნება — სია ჯერ იკითხება
        $this->actingAs($this->alice)->getJson('/api/statuses/movie')->assertOk();
        $watched = Status::withoutGlobalScope('owner')
            ->where('user_id', $this->alice->id)->where('module', 'movie')
            ->where('role', 'done')->firstOrFail();

        $this->actingAs($this->alice)
            ->patchJson("/api/movies/{$movie->id}/status", ['status' => $watched->key])
            ->assertOk()
            ->assertJsonPath('data.status.key', $watched->key);

        // ⚠️ `watched_at` **როლიდან** ივსება და არა სახელიდან (`HasStatus`)
        $this->assertNotNull($movie->refresh()->watched_at);
    }

    public function test_an_unknown_status_key_is_refused(): void
    {
        $movie = $this->makeMovie($this->alice, 'Matrix');

        $this->actingAs($this->alice)
            ->patchJson("/api/movies/{$movie->id}/status", ['status' => 'no-such-status'])
            ->assertStatus(422);
    }

    public function test_favorite_toggles(): void
    {
        $movie = $this->makeMovie($this->alice, 'Matrix');

        $this->actingAs($this->alice)
            ->patchJson("/api/movies/{$movie->id}/favorite", ['is_favorite' => true])
            ->assertOk()
            ->assertJsonPath('data.is_favorite', true);

        $this->assertTrue($movie->refresh()->is_favorite);
    }

    /* ================= მფლობელობა და მოდული ================= */

    public function test_another_users_movie_is_a_404_on_every_verb(): void
    {
        $movie = $this->makeMovie($this->alice, 'Matrix');

        $this->actingAs($this->bob)->getJson("/api/movies/{$movie->id}")->assertStatus(404);
        $this->actingAs($this->bob)->putJson("/api/movies/{$movie->id}", ['year' => 2000])->assertStatus(404);
        $this->actingAs($this->bob)->deleteJson("/api/movies/{$movie->id}")->assertStatus(404);
        $this->actingAs($this->bob)->patchJson("/api/movies/{$movie->id}/favorite", ['is_favorite' => true])
            ->assertStatus(404);
    }

    /** მოდულის გარეშე დარჩენილი ანგარიშს სექცია საერთოდ არ უჩანს */
    public function test_the_module_must_be_enabled(): void
    {
        $this->alice->modules()->detach();

        $this->actingAs($this->alice->refresh())->getJson('/api/movies')
            ->assertStatus(403)
            ->assertJson(['message' => 'module_not_enabled']);
    }

    /** ⚠️ TMDB-ის გასაღების გარეშე **503 და არა 500** (`bgg_unavailable`-ის წესი) */
    public function test_adding_from_tmdb_without_a_key_is_a_503(): void
    {
        config(['services.tmdb.key' => null]);

        $this->actingAs($this->alice)
            ->postJson('/api/movies/from-tmdb', ['tmdb_id' => 603])
            ->assertStatus(503);
    }
}
