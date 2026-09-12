<?php

namespace Tests\Feature;

use App\Models\Anime;
use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Series;
use App\Models\User;
use App\Services\Purge\PurgeService;
use App\Support\MediaDomain;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **ანიმეების მოდული (Tasks §7.1).**
 *
 * ტესტი იმას იჭერს, რაც მესამე მედია-დომენის დამატებისას **ჩუმად ტყდება**:
 * gate, მფლობელობა, საკუთარი ცხრილი (და არა სერიალის), გლობალური ჟანრები
 * morph alias-ით, და გაზიარებული `type`-პარამეტრიანი endpoint-ები, რომლებიც
 * ადრე მხოლოდ `movie|series`-ს იცნობდნენ.
 */
class AnimeModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('aiko', ['anime', 'movie', 'series']);
    }

    private function makeUser(string $name, array $modules): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', $modules)->pluck('id')->all());

        return $user->refresh();
    }

    /** მოდულის gate + CRUD + ორენოვანი სათაური */
    public function test_module_gate_and_crud(): void
    {
        $outsider = $this->makeUser('nomodule', []);
        $this->actingAs($outsider)->getJson('/api/anime')->assertStatus(403);

        $id = $this->actingAs($this->user)
            ->postJson('/api/anime', [
                'title_en' => 'Cowboy Bebop',
                'title_ka' => 'კაუბოი ბიბოპი',
                'year' => 1998,
                'seasons' => 1,
                'episodes' => 26,
                'genres' => ['Action', 'Sci-Fi'],
            ])
            ->assertCreated()
            ->assertJsonPath('data.title_ka', 'კაუბოი ბიბოპი')
            ->assertJsonPath('data.seasons', 1)
            ->json('data.id');

        // ⚠️ საკუთარ ცხრილში ჯდება და არა სერიალებში
        $this->assertSame(1, Anime::withoutGlobalScope('owner')->count());
        $this->assertSame(0, Series::withoutGlobalScope('owner')->count());

        $this->actingAs($this->user)
            ->patchJson("/api/anime/{$id}/status", ['status' => 'watched'])
            ->assertOk()
            ->assertJsonPath('data.status.key', 'watched');

        $this->actingAs($this->user)
            ->patchJson("/api/anime/{$id}/favorite")
            ->assertOk()
            ->assertJsonPath('data.is_favorite', true);

        $this->actingAs($this->user)->deleteJson("/api/anime/{$id}")->assertNoContent();
        $this->assertSame(0, Anime::withoutGlobalScope('owner')->count());
    }

    /** სხვისი ანიმე **404**-ია (`owner` global scope) */
    public function test_another_users_record_is_not_found(): void
    {
        $other = $this->makeUser('otto', ['anime']);
        $theirs = Anime::create(['user_id' => $other->id, 'year' => 2001]);

        $this->actingAs($this->user)->getJson("/api/anime/{$theirs->id}")->assertNotFound();
    }

    /**
     * ⚠️ **ჟანრი გლობალურია** (`genres` + polymorphic `genreables`, alias `anime`):
     * ფილმისა და ანიმეს ერთი და იგივე ჟანრი **ერთი რიგია**, თორემ ჟანრების
     * პიქერი ორად გაიყოფოდა („Action" ორჯერ).
     */
    public function test_genres_are_shared_with_the_other_media_domains(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/anime', ['title_en' => 'Naruto', 'genres' => ['Action']])
            ->assertCreated();
        $this->actingAs($this->user)
            ->postJson('/api/movies', ['title_en' => 'Heat', 'genres' => ['Action']])
            ->assertCreated();

        $this->assertSame(1, Genre::where('slug', 'action')->count());

        $genre = Genre::where('slug', 'action')->first();
        $items = $this->actingAs($this->user)
            ->getJson("/api/genres/{$genre->id}/items")
            ->assertOk()
            ->json();

        // ⚠️ სამივე bucket პასუხშია — მესამე დომენის გამორჩენა აქ ჩუმი იქნებოდა
        $this->assertSame(1, $items['animes_count']);
        $this->assertSame(1, $items['movies_count']);
        $this->assertSame(0, $items['series_count']);
        $this->assertSame('Naruto', $items['animes'][0]['title_en']);
    }

    /**
     * გაზიარებული `type`-პარამეტრიანი endpoint-ები ანიმეს **ცნობენ**.
     *
     * ⚠️ სწორედ ესენი იყო ის თოთხმეტი ადგილი, სადაც `['movie', 'series']`
     * ლიტერალად ეწერა — ახლა ყველა `MediaDomain::TYPES`-ს კითხულობს.
     */
    public function test_shared_type_endpoints_accept_anime(): void
    {
        $anime = Anime::create(['user_id' => $this->user->id, 'tmdb_id' => 42]);

        // ხილვადობა — ცხრა დომენს ერთი endpoint
        $this->actingAs($this->user)
            ->patchJson("/api/visibility/anime/{$anime->id}", ['visibility' => 'public'])
            ->assertOk()
            ->assertJsonPath('visibility', 'public');

        // მედია-სინქრონის გეგმა (TMDB-ის გასაღების გარეშეც აბრუნებს რიგს)
        $this->actingAs($this->user)
            ->postJson('/api/media/sync/plan', ['types' => ['anime']])
            ->assertOk();

        // ⚠️ უცნობი დომენი ისევ 422-ია — რუკამ ვალიდაცია არ უნდა გააფართოვოს
        $this->actingAs($this->user)
            ->postJson('/api/media/sync/plan', ['types' => ['manga']])
            ->assertStatus(422);
    }

    /** მასობრივი წაშლის რეგისტრები — `anime` სრულფასოვანი სამიზნეა */
    public function test_purge_target_is_registered(): void
    {
        $this->assertContains('anime', PurgeService::TARGETS);
        $this->assertContains('anime', MediaDomain::TYPES);
        // ანიმე TMDB-ის `/tv/*`-ზე ზის, ფილმი — არა
        $this->assertTrue(MediaDomain::isTv('anime'));
        $this->assertFalse(MediaDomain::isTv('movie'));
        $this->assertSame('anime', MediaDomain::typeOf(new Anime));
        $this->assertSame('movie', MediaDomain::typeOf(new Movie));
    }
}
