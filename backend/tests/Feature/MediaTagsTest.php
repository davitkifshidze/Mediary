<?php

namespace Tests\Feature;

use App\Models\Movie;
use App\Models\Status;
use App\Models\User;
use App\Services\Purge\PurgeService;
use Database\Seeders\GenresSeeder;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **პირადი ტეგები მედია-დომენებზე (FEAT-18).**
 *
 * ⚠️ ტესტი **ჟანრსაც** ამოწმებს ყოველ ჯერზე: ორი ღერძი ერთმანეთს არ უნდა
 * ერეოდეს — სწორედ ეს არის ტეგის არსებობის მიზეზი.
 */
class MediaTagsTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        $this->seed(GenresSeeder::class);

        $this->user = User::factory()->create();
        $this->user->assignRole('super_admin')->save();
        $this->actingAs($this->user);

        Status::ensureDefaults($this->user->id, 'movie');
    }

    private function payload(array $extra = []): array
    {
        return [
            'title_en' => 'A film',
            'status' => 'to_watch',
            'genres' => ['Drama'],
            ...$extra,
        ];
    }

    public function test_a_film_keeps_its_tags(): void
    {
        $this->postJson('/api/movies', $this->payload([
            'title_en' => 'Home Alone',
            'tags' => ['საახალწლო', 'ოჯახთან სანახავი'],
        ]))
            ->assertStatus(201)
            ->assertJsonPath('data.tags', ['საახალწლო', 'ოჯახთან სანახავი']);
    }

    /** დუბლი იჭრება იმავე წესით, რაც ვიდეოზე (`Video::normalizeTags()`) */
    public function test_duplicate_tags_are_cut_the_same_way_as_everywhere_else(): void
    {
        $this->postJson('/api/movies', $this->payload([
            'tags' => ['კომედია', ' კომედია ', 'Комедия'],
        ]))
            ->assertStatus(201)
            ->assertJsonCount(2, 'data.tags');
    }

    /** ცარიელი სია ტეგებს შლის — უამისოდ ბოლო ტეგის მოხსნა შეუძლებელი იქნებოდა */
    public function test_an_empty_list_clears_the_tags(): void
    {
        $id = $this->postJson('/api/movies', $this->payload(['tags' => ['ერთი']]))->json('data.id');

        $this->putJson("/api/movies/{$id}", $this->payload(['tags' => []]))
            ->assertOk()
            ->assertJsonPath('data.tags', []);
    }

    /**
     * **ფილტრი AND-ია და ჟანრს არ ერევა.**
     *
     * ⚠️ ორი ტეგი ერთად — მხოლოდ ორივეს მქონე; ტეგი + ჟანრი — ორივე
     * პირობა ერთდროულად. სწორედ ეს ორი ღერძი ვერ არსებობდა ერთი
     * `genre`-ის პირობებში.
     */
    public function test_the_tag_filter_ands_and_combines_with_the_genre(): void
    {
        $this->postJson('/api/movies', $this->payload([
            'title_en' => 'Both', 'tags' => ['საახალწლო', 'ოჯახური'], 'genres' => ['Drama'],
        ]))->assertStatus(201);
        $this->postJson('/api/movies', $this->payload([
            'title_en' => 'One', 'tags' => ['საახალწლო'], 'genres' => ['Comedy'],
        ]))->assertStatus(201);
        $this->postJson('/api/movies', $this->payload([
            'title_en' => 'None', 'tags' => [], 'genres' => ['Drama'],
        ]))->assertStatus(201);

        $this->getJson('/api/movies?tag=საახალწლო')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/movies?tag=საახალწლო,ოჯახური')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/movies?tag=საახალწლო&genre=comedy')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/movies?tag=არარსებული')->assertOk()->assertJsonCount(0, 'data');
    }

    /**
     * **ძებნა ტეგშიც პოულობს — ქართულ ესკეიპზეც.**
     *
     * ⚠️ JSON სვეტში ქართული **ესკეიპირებულია** (`ს…`), ე.ი. უბრალო
     * `LIKE '%საახ%'` ვერასდროს დაემთხვეოდა; `GlobalSearch::jsonLike()`
     * სწორედ ამიტომ ორივე ფორმას ეძებს.
     */
    public function test_the_global_search_finds_a_georgian_tag(): void
    {
        $this->postJson('/api/movies', $this->payload([
            'title_en' => 'Home Alone', 'tags' => ['საახალწლო'],
        ]))->assertStatus(201);

        $groups = $this->getJson('/api/search?q=საახალწლო')->assertOk()->json('groups');
        // ⚠️ ჯგუფის გასაღები `key`-ია და არა `domain` (`domain` ერთეულზეა)
        $movie = collect($groups)->firstWhere('key', 'movie');

        $this->assertNotNull($movie, 'the film group is missing from the results');
        $this->assertSame(1, $movie['total']);
        $this->assertSame('tags', $movie['items'][0]['matches'][0]['field']);
    }

    /** `/purge`-ის `tag` სკოუპი ავტომატურად გაჩნდა (`TARGET_MODES`-იდან) */
    public function test_the_purge_tag_scope_is_available_for_media(): void
    {
        foreach (['movie', 'series', 'anime'] as $target) {
            $this->assertTrue(
                PurgeService::supportsTag($target),
                "{$target} should support the tag scope",
            );
        }
    }

    public function test_the_purge_tag_scope_only_touches_the_tagged_records(): void
    {
        $keep = $this->postJson('/api/movies', $this->payload([
            'title_en' => 'Keep', 'tags' => ['სხვა'],
        ]))->json('data.id');
        $this->postJson('/api/movies', $this->payload([
            'title_en' => 'Drop', 'tags' => ['საახალწლო'],
        ]))->assertStatus(201);

        $plan = $this->postJson('/api/admin/purge/plan', [
            'user_id' => $this->user->id,
            'target' => 'movie',
            'mode' => 'tag',
            'tags' => ['საახალწლო'],
        ])->assertOk();

        $this->assertSame(1, $plan->json('plan.records'));

        $this->postJson('/api/admin/purge', [
            'user_id' => $this->user->id,
            'target' => 'movie',
            'mode' => 'tag',
            'tags' => ['საახალწლო'],
            'confirm' => 'DELETE',
        ])->assertOk();

        $this->assertSame([$keep], Movie::pluck('id')->all());
    }

    /** შემოთავაზების სია სვეტიდან გროვდება და სიხშირით ლაგდება */
    public function test_the_tag_suggestions_come_from_the_column(): void
    {
        $this->postJson('/api/movies', $this->payload(['title_en' => 'A', 'tags' => ['საახალწლო', 'ოჯახური']]))->assertStatus(201);
        $this->postJson('/api/movies', $this->payload(['title_en' => 'B', 'tags' => ['საახალწლო']]))->assertStatus(201);

        $this->getJson('/api/media/tags?type=movie')
            ->assertOk()
            ->assertJsonPath('data.0.tag', 'საახალწლო')
            ->assertJsonPath('data.0.count', 2)
            ->assertJsonPath('data.1.tag', 'ოჯახური');

        /* ⚠️ უცნობი დომენი **403-ია და არა 422**: `module:@type` ვალიდაციაზე
           ადრე მუშაობს და „ასეთი მოდული არ არსებობს"-ს პასუხობს. იგივე
           ქცევა აქვს `/lookup`-სა და `/discover`-ს, ე.ი. ცალკე გამონაკლისი
           აქ ახალ მექანიზმს დაბადებდა. */
        $this->getJson('/api/media/tags?type=nonsense')->assertStatus(403);
    }
}
