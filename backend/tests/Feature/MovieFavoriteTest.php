<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Movie;
use App\Models\Status;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **რჩეული და ფრანჩაიზი** (Tasks §18).
 *
 * ⚠️ ჩუმი გავრცელება აღარ არის: რჩეულში ჩასმა მხოლოდ ამ ფილმს ეხება, დანარჩენი
 * ნაწილები ცხადი `parts[]`-ით მოდის (პოპაპი); ახალი ნაწილი `from-tmdb`-ით
 * არჩეული სტატუსით და რჩეულად ემატება.
 */
class MovieFavoriteTest extends TestCase
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

    /** §18.2 — რჩეულში ჩასმა იმავე კოლექციის სხვა ნაწილს **აღარ** ეხება */
    public function test_favouriting_no_longer_spreads_over_the_franchise(): void
    {
        $a = $this->makeMovie($this->alice, 'Part 1', ['tmdb_collection_id' => 2344]);
        $b = $this->makeMovie($this->alice, 'Part 2', ['tmdb_collection_id' => 2344]);

        $this->actingAs($this->alice)->patchJson("/api/movies/{$a->id}/favorite")
            ->assertOk()
            ->assertJsonPath('data.is_favorite', true);

        $this->assertFalse($b->fresh()->is_favorite);
    }

    /** §18.2 — `parts[]` მხოლოდ ჩამოთვლილ, იმავე კოლექციის, საკუთარ ნაწილებს აფერადებს */
    public function test_listed_parts_of_the_same_collection_become_favourite_too(): void
    {
        $a = $this->makeMovie($this->alice, 'Part 1', ['tmdb_collection_id' => 2344]);
        $b = $this->makeMovie($this->alice, 'Part 2', ['tmdb_collection_id' => 2344]);
        $c = $this->makeMovie($this->alice, 'Part 3', ['tmdb_collection_id' => 2344]);
        $other = $this->makeMovie($this->alice, 'Stranger', ['tmdb_collection_id' => 99]);
        $bobs = $this->makeMovie($this->bob, 'Bob part', ['tmdb_collection_id' => 2344]);

        $this->actingAs($this->alice)
            ->patchJson("/api/movies/{$a->id}/favorite", ['is_favorite' => true, 'parts' => [$b->id, $other->id, $bobs->id]])
            ->assertOk()
            ->assertJsonPath('data.is_favorite', true);

        $this->assertTrue($b->fresh()->is_favorite);
        $this->assertFalse($c->fresh()->is_favorite, 'ჩამოუთვლელი ნაწილი არ უნდა შეიცვალოს');
        $this->assertFalse($other->fresh()->is_favorite, 'სხვა კოლექცია არ უნდა შეიცვალოს');
        $this->assertFalse(Movie::withoutGlobalScopes()->find($bobs->id)->is_favorite, 'სხვისი ჩანაწერი არ უნდა შეიცვალოს');
    }

    /** §18.3 — მოხსნა მხოლოდ ამ ფილმს ეხება, `parts` იგნორირდება */
    public function test_unfavouriting_touches_only_this_film(): void
    {
        $a = $this->makeMovie($this->alice, 'Part 1', ['tmdb_collection_id' => 2344, 'is_favorite' => true]);
        $b = $this->makeMovie($this->alice, 'Part 2', ['tmdb_collection_id' => 2344, 'is_favorite' => true]);

        $this->actingAs($this->alice)
            ->patchJson("/api/movies/{$a->id}/favorite", ['is_favorite' => false, 'parts' => [$b->id]])
            ->assertOk()
            ->assertJsonPath('data.is_favorite', false);

        $this->assertTrue($b->fresh()->is_favorite);
    }

    /** ვალიდაცია — `parts` მასივია */
    public function test_parts_must_be_a_list_of_ids(): void
    {
        $a = $this->makeMovie($this->alice, 'Part 1', ['tmdb_collection_id' => 2344]);

        $this->actingAs($this->alice)
            ->patchJson("/api/movies/{$a->id}/favorite", ['parts' => 'nope'])
            ->assertStatus(422);
    }

    /** §18.3 — `from-tmdb` არჩეული სტატუსით და რჩეულად; უცნობი სტატუსი ჩუმად ვარდება */
    public function test_a_part_added_from_tmdb_takes_the_chosen_status_and_favourite(): void
    {
        $this->giveCredential($this->alice, 'tmdb');
        Status::ensureDefaults($this->alice->id, 'movie');
        Http::fake([
            'api.themoviedb.org/3/*/credits*' => Http::response(['cast' => []]),
            'api.themoviedb.org/3/*/videos*' => Http::response(['results' => []]),
            // ⚠️ ცალკე stub 604-ზე — ერთი imdb_id ორ ფილმზე დუბლიკატად ჩაითვლებოდა
            'api.themoviedb.org/3/movie/604*' => Http::response([
                'id' => 604, 'title' => 'The Matrix Reloaded', 'imdb_id' => 'tt0234215', 'genres' => [],
            ]),
            'api.themoviedb.org/3/movie/*' => Http::response([
                'id' => 603, 'title' => 'The Matrix', 'imdb_id' => 'tt0133093', 'genres' => [],
            ]),
            '*' => Http::response([], 404),
        ]);

        $this->actingAs($this->alice)
            ->postJson('/api/movies/from-tmdb', ['tmdb_id' => 603, 'status' => 'watching', 'is_favorite' => true])
            ->assertCreated()
            ->assertJsonPath('data.is_favorite', true)
            ->assertJsonPath('data.status.key', 'watching');

        $second = $this->actingAs($this->alice)
            ->postJson('/api/movies/from-tmdb', ['tmdb_id' => 604, 'status' => 'no_such_status'])
            ->assertCreated()
            ->assertJsonPath('data.status.role', 'todo');
        $this->assertNotTrue($second->json('data.is_favorite'));
    }
}
