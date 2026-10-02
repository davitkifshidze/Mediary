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
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * **ურნაში მყოფი ჩანაწერის ხელახლა დამატება (Tasks §40.1ა).**
 *
 * ⚠️ დუბლიკატის ძებნა `trash` scope-ის ქვეშ იყო და ურნაში მყოფს ვერ ხედავდა,
 * `unique(user_id, imdb_id)` კი ხედავდა: ფილმი „აღმოჩენიდან" → ურნაში →
 * ისევ „აღმოჩენიდან" ⇒ **500** ნედლი SQL-ით და ნახევრად შექმნილი მეორე რიგი.
 * ახლა — 409 `record_in_trash` + id და მეორე რიგი არ ჩნდება; იგივე იმპორტზე
 * და ჩატის „დამიმატეზეც".
 */
class TrashDuplicateTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('dup');
        $this->giveCredential($this->user, 'tmdb');
        $this->fakeTmdb();
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name, 'username' => $name,
            'email' => "{$name}@example.com", 'password' => 'password',
        ]);
        $user->forceFill(['profile_visibility' => 'public'])->save();
        $user->modules()->sync(Module::pluck('id')->all());

        return $user->refresh();
    }

    /** ⚠️ ერთი stub ფილმსაც და სერიალსაც — ორივე იმავე `imdb_id`-ს აბრუნებს */
    private function fakeTmdb(): void
    {
        Http::fake([
            'api.themoviedb.org/3/search/movie*' => Http::response(['results' => [['id' => 603]]]),
            'api.themoviedb.org/3/find/*' => Http::response(['movie_results' => [['id' => 603]]]),
            'api.themoviedb.org/3/*/credits*' => Http::response(['cast' => []]),
            'api.themoviedb.org/3/*/aggregate_credits*' => Http::response(['cast' => []]),
            'api.themoviedb.org/3/*/videos*' => Http::response(['results' => []]),
            'api.themoviedb.org/3/movie/*' => Http::response([
                'id' => 603, 'title' => 'The Matrix', 'imdb_id' => 'tt0133093', 'genres' => [],
            ]),
            'api.themoviedb.org/3/tv/*' => Http::response([
                'id' => 1399, 'name' => 'Game of Thrones', 'genres' => [],
                'external_ids' => ['imdb_id' => 'tt0944947'],
            ]),
            '*' => Http::response([], 404),
        ]);
    }

    /** @return list<array{0: string, 1: class-string, 2: int}> */
    public static function domains(): array
    {
        return [
            'movie' => ['movies', Movie::class, 603],
            'series' => ['series', Series::class, 1399],
            'anime' => ['anime', Anime::class, 1399],
        ];
    }

    #[DataProvider('domains')]
    public function test_re_adding_a_trashed_record_is_a_409_and_creates_nothing(string $base, string $model, int $tmdbId): void
    {
        $id = $this->actingAs($this->user)
            ->postJson("/api/{$base}/from-tmdb", ['tmdb_id' => $tmdbId])
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($this->user)->deleteJson("/api/{$base}/{$id}")->assertSuccessful();

        $this->actingAs($this->user)
            ->postJson("/api/{$base}/from-tmdb", ['tmdb_id' => $tmdbId])
            ->assertStatus(409)
            ->assertJson(['message' => 'record_in_trash', 'id' => $id]);

        $this->assertSame(1, $model::withoutGlobalScopes()->count(), 'ნახევრად შექმნილი მეორე რიგი დარჩა');
    }

    /**
     * ⚠️ იგივე ფილმი სხვა `tmdb_id`-ით (ან ხელით, `tmdb_id`-ის გარეშე) — `imdb_id`
     * მხოლოდ გამდიდრების შემდეგ ჩნდება და შენახვა უნიკალურობაზე ვარდებოდა.
     */
    public function test_an_imdb_clash_after_enrichment_returns_the_existing_record(): void
    {
        $manual = Movie::create(['user_id' => $this->user->id, 'imdb_id' => 'tt0133093']);

        $this->actingAs($this->user)
            ->postJson('/api/movies/from-tmdb', ['tmdb_id' => 603])
            ->assertOk()
            ->assertJsonPath('data.id', $manual->id);

        $this->assertSame(1, Movie::withoutGlobalScopes()->count());
    }

    public function test_an_imdb_clash_with_a_trashed_record_is_a_409(): void
    {
        $manual = Movie::create(['user_id' => $this->user->id, 'imdb_id' => 'tt0133093']);
        $this->actingAs($this->user);
        $manual->moveToTrash();

        $this->postJson('/api/movies/from-tmdb', ['tmdb_id' => 603])
            ->assertStatus(409)
            ->assertJson(['message' => 'record_in_trash', 'id' => $manual->id]);

        $this->assertSame(1, Movie::withoutGlobalScopes()->count());
    }

    /** იმპორტი იმავე ბრმა წერტილზე იდგა — `imdb_id`-იანი რიგი პირველივე `save()`-ზე ვარდებოდა */
    public function test_import_names_a_trashed_duplicate(): void
    {
        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 603, 'imdb_id' => 'tt0133093']);
        $this->actingAs($this->user);
        $movie->moveToTrash();

        $this->postJson('/api/import/item', [
            'source' => 'imdb',
            'row' => ['title' => 'The Matrix', 'imdb_id' => 'tt0133093'],
        ])
            ->assertOk()
            ->assertJson(['ok' => false, 'error' => 'record_in_trash', 'id' => $movie->id]);

        $this->assertSame(1, Movie::withoutGlobalScopes()->count());
    }

    /** ჩატის „დამიმატე" — მიმღებს იგივე ფილმი ურნაში აქვს */
    public function test_saving_a_shared_record_that_is_in_my_trash_is_a_409(): void
    {
        $friend = $this->makeUser('friend');
        $theirs = Movie::create(['user_id' => $friend->id, 'tmdb_id' => 603, 'year' => 1999]);
        $theirs->translations()->create(['locale' => 'en', 'title' => 'The Matrix']);

        $mine = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 603]);
        $this->actingAs($this->user);
        $mine->moveToTrash();

        $conversation = $this->actingAs($friend)
            ->postJson("/api/chat/with/{$this->user->username}")->assertOk()->json('id');
        $message = $this->actingAs($friend)
            ->postJson("/api/chat/{$conversation}", ['domain' => 'movie', 'record_id' => $theirs->id])
            ->assertCreated()->json('data');

        $this->actingAs($this->user)
            ->postJson("/api/chat/messages/{$message['id']}/save")
            ->assertStatus(409)
            ->assertJson(['message' => 'record_in_trash', 'id' => $mine->id]);

        $this->assertSame(1, Movie::withoutGlobalScopes()->where('user_id', $this->user->id)->count());
    }
}
