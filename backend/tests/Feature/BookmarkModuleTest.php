<?php

namespace Tests\Feature;

use App\Models\Bookmark;
use App\Models\BookmarkCategory;
use App\Models\Module;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * ბუკმარკების მოდული (`bookmark`, Tasks §18 — `DECISIONS.md` §10-ის არჩევანი).
 *
 * ამოწმებს იმას, რაც მოდულს მოდულად აქცევს: gate, per-user ლექსიკონი,
 * მფლობელობა, ატვირთვის კვოტა და `domain`-ის ერთადერთი წყარო.
 */
class BookmarkModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('bela', ['bookmark']);
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

    /** მოდულის gate + ველების ნაკრები */
    public function test_module_gate_and_field_set(): void
    {
        $outsider = $this->makeUser('nomodule', []);
        $this->actingAs($outsider)->getJson('/api/bookmarks')->assertStatus(403);

        $categoryId = $this->actingAs($this->user)
            ->getJson('/api/bookmark-categories')->json('data.0.id');

        $this->actingAs($this->user)
            ->postJson('/api/bookmarks', [
                'title' => 'Laravel-ის დოკუმენტაცია',
                'url' => 'https://laravel.com/docs/13.x/eloquent',
                'description' => 'ORM-ის სახელმძღვანელო',
                'category_id' => $categoryId,
                'tags' => ['php', 'php', ' Laravel '],
                'autofill' => 0,
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.title', 'Laravel-ის დოკუმენტაცია')
            ->assertJsonPath('data.category_id', $categoryId)
            // ⚠️ `domain` მხოლოდ `applyUrl()`-იდან მოდის (www. იჭრება)
            ->assertJsonPath('data.domain', 'laravel.com')
            ->assertJsonPath('data.status.key', 'to_read')
            // 16.5 — ხილვადობა default-ად პირადია
            ->assertJsonPath('data.visibility', 'private')
            // ტეგების დუბლი რეგისტრისა და სივრცის მიუხედავად იჭრება
            ->assertJsonPath('data.tags', ['php', 'Laravel']);
    }

    /** `www.` იჭრება — „example.com" და „www.example.com" ერთი ჯგუფია */
    public function test_domain_strips_www_and_lowercases(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/bookmarks', [
                'title' => 'X',
                'url' => 'https://WWW.Example.COM/a/b?c=1',
                'autofill' => 0,
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.domain', 'example.com');
    }

    /** სტატუსი სიის გარეთ არ გადის */
    public function test_status_is_bounded(): void
    {
        $id = $this->actingAs($this->user)
            ->postJson('/api/bookmarks', ['title' => 'X', 'url' => 'https://a.com', 'autofill' => 0])
            ->json('data.id');

        $this->actingAs($this->user)
            ->patchJson("/api/bookmarks/{$id}/status", ['status' => 'nonsense'])
            ->assertStatus(422);

        $this->actingAs($this->user)
            ->patchJson("/api/bookmarks/{$id}/status", ['status' => 'read'])
            ->assertOk()
            ->assertJsonPath('data.status.key', 'read');
    }

    /** „გავხსენი" — მთვლელი და თარიღი (POST, მაგრამ **update**-ის უფლებით) */
    public function test_visit_counter(): void
    {
        $id = $this->actingAs($this->user)
            ->postJson('/api/bookmarks', ['title' => 'X', 'url' => 'https://a.com', 'autofill' => 0])
            ->json('data.id');

        $this->actingAs($this->user)->postJson("/api/bookmarks/{$id}/visited")->assertOk();
        $this->actingAs($this->user)
            ->postJson("/api/bookmarks/{$id}/visited")
            ->assertOk()
            ->assertJsonPath('data.visit_count', 2);

        $this->assertNotNull(Bookmark::withoutGlobalScope('owner')->find($id)->visited_at);
    }

    /** კატეგორია **per-user** ლექსიკონია — სხვისი id 422-ია */
    public function test_category_dictionary_is_per_user(): void
    {
        $other = $this->makeUser('otto', ['bookmark']);

        $this->actingAs($this->user)->getJson('/api/bookmark-categories')->assertOk();
        $theirs = $this->actingAs($other)->getJson('/api/bookmark-categories')->json('data.0.id');

        // ლენივი დეფაულტები ორივე ანგარიშზე ცალკე შეიქმნა
        $this->assertSame(
            count(BookmarkCategory::DEFAULTS) * 2,
            BookmarkCategory::withoutGlobalScope('owner')->count(),
        );

        $this->actingAs($this->user)
            ->postJson('/api/bookmarks', [
                'title' => 'X',
                'url' => 'https://a.com',
                'category_id' => $theirs,
                'autofill' => 0,
            ])
            ->assertStatus(422);
    }

    /** კატეგორიის წაშლა ბუკმარკს არ შლის — გადააქვს ან უკატეგოროდ ტოვებს */
    public function test_deleting_a_category_moves_its_bookmarks(): void
    {
        $categories = $this->actingAs($this->user)->getJson('/api/bookmark-categories')->json('data');
        [$from, $to] = [$categories[0]['id'], $categories[1]['id']];

        $id = $this->actingAs($this->user)
            ->postJson('/api/bookmarks', [
                'title' => 'X',
                'url' => 'https://a.com',
                'category_id' => $from,
                'autofill' => 0,
            ])
            ->json('data.id');

        $this->actingAs($this->user)
            ->deleteJson("/api/bookmark-categories/{$from}", ['move_to' => $to])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $this->actingAs($this->user)
            ->getJson("/api/bookmarks/{$id}")
            ->assertJsonPath('data.category_id', $to);
    }

    /** ფილტრები: კატეგორია (OR — სვეტია) და ტეგი (AND) */
    public function test_filters(): void
    {
        $categories = $this->actingAs($this->user)->getJson('/api/bookmark-categories')->json('data');
        [$work, $tools] = [$categories[0]['id'], $categories[1]['id']];

        $this->actingAs($this->user)->postJson('/api/bookmarks', [
            'title' => 'A', 'url' => 'https://a.com', 'category_id' => $work,
            'tags' => ['php', 'docs'], 'autofill' => 0,
        ]);
        $this->actingAs($this->user)->postJson('/api/bookmarks', [
            'title' => 'B', 'url' => 'https://b.com', 'category_id' => $tools,
            'tags' => ['docs'], 'autofill' => 0,
        ]);

        // ⚠️ კატეგორია **სვეტია**, ე.ი. მძიმით გამოყოფილი სია OR-ია
        $this->actingAs($this->user)
            ->getJson("/api/bookmarks?category_id={$work},{$tools}")
            ->assertJsonCount(2, 'data');

        $this->actingAs($this->user)
            ->getJson("/api/bookmarks?category_id={$work}")
            ->assertJsonCount(1, 'data');

        // ტეგები კი AND-ია (5.2-ის წესი)
        $this->actingAs($this->user)->getJson('/api/bookmarks?tag=docs')->assertJsonCount(2, 'data');
        $this->actingAs($this->user)->getJson('/api/bookmarks?tag=php,docs')->assertJsonCount(1, 'data');
    }

    /** სხვისი ბუკმარკი 404-ია (`BelongsToUser`-ის `owner` scope) */
    public function test_another_users_bookmark_is_not_found(): void
    {
        $other = $this->makeUser('otto', ['bookmark']);

        $id = $this->actingAs($other)
            ->postJson('/api/bookmarks', ['title' => 'Theirs', 'url' => 'https://a.com', 'autofill' => 0])
            ->json('data.id');

        $this->actingAs($this->user)->getJson("/api/bookmarks/{$id}")->assertStatus(404);
        $this->actingAs($this->user)->deleteJson("/api/bookmarks/{$id}")->assertStatus(404);
    }

    /**
     * ატვირთული ფოტო კვოტაში ითვლება და **წაშლისას თავისუფლდება**.
     * ⚠️ წაშლა **მოდელზე** ხდება და არა endpoint-ით — `PurgeService` ასე შლის.
     */
    public function test_thumbnail_is_metered_and_released_at_model_level(): void
    {
        Storage::fake('public');

        $this->actingAs($this->user)->postJson('/api/bookmark-categories', [
            'name_ka' => 'X', 'name_en' => 'X',
        ]);

        $id = $this->actingAs($this->user)
            ->post('/api/bookmarks', [
                'title' => 'Shot',
                'url' => 'https://a.com',
                'autofill' => 0,
                'thumbnail' => UploadedFile::fake()->image('shot.jpg', 40, 40),
            ])
            ->assertStatus(201)
            ->json('data.id');

        $used = $this->user->refresh()->storage_used_bytes;
        $this->assertGreaterThan(0, $used);

        Bookmark::withoutGlobalScope('owner')->find($id)->delete();

        $this->assertSame(0, (int) $this->user->refresh()->storage_used_bytes);
    }
}
