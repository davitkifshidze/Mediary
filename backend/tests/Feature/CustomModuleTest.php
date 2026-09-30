<?php

namespace Tests\Feature;

use App\Models\CustomCategory;
use App\Models\CustomRecord;
use App\Models\Module;
use App\Models\Status;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use App\Support\CustomModules;
use App\Support\NotificationType;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **ინტერფეისიდან შექმნილი მოდული (Tasks §37.1–37.2).**
 *
 * ⚠️ ყველაზე მნიშვნელოვანი აქ **ის, რაც არ ჩანს**: სხვისი პირადი მოდული
 * 404-ია ყველა კარზე — მარშრუტზე, სტატუსებზე, ველებზე — სუპერადმინისთვისაც
 * (Q28/Q41). ამიტომ თითქმის ყოველი ტესტი „მფლობელი ხედავს — სხვა არა"
 * წყვილია.
 */
class CustomModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $stranger;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        Storage::fake('public');
        Storage::fake('private');

        $this->owner = User::factory()->create(['username' => 'owner']);
        $this->stranger = User::factory()->create(['username' => 'stranger']);
        $this->admin = User::factory()->create(['username' => 'boss']);
        $this->admin->assignRole('super_admin')->save();

        // ⚠️ ქარხანა კვოტას არ წერს — მეხსიერებაში `null`-ია და ატვირთვა 413
        $this->owner->refresh();
        $this->stranger->refresh();
        $this->admin->refresh();
    }

    /** მოდულის შექმნა API-ით — ტესტების საერთო გზა */
    private function createModule(User $user, array $extra = []): array
    {
        $response = $this->actingAs($user)->postJson('/api/modules', [
            'name_ka' => 'რეცეპტები',
            'name_en' => 'Recipes',
            'icon' => 'Utensils',
            'color' => '#22c55e',
            'classification' => 'category',
            'statuses' => 'default',
            'categories' => ['სადილი', 'დესერტი'],
            ...$extra,
        ]);

        $response->assertCreated();

        return $response->json('data');
    }

    private function categoryId(string $key, string $name = 'სადილი'): int
    {
        return (int) CustomCategory::withoutGlobalScopes()->where('module', $key)->where('name_ka', $name)->value('id');
    }

    /* ---------- შექმნა (37.2) ---------- */

    public function test_a_user_creates_a_private_module_for_themselves(): void
    {
        $module = $this->createModule($this->owner);

        $this->assertMatchesRegularExpression('/^c'.$this->owner->id.'-recipes$/', $module['key']);
        $this->assertTrue($module['is_custom']);
        $this->assertSame('/c/'.$module['key'], $module['route_base']);
        $this->assertSame(['classification' => 'category', 'statuses' => 'default'], $module['definition']);

        $row = Module::where('key', $module['key'])->firstOrFail();
        $this->assertSame($this->owner->id, (int) $row->owner_id);

        // მფლობელს წვდომა აქვს, უფლება კი როლში **არ** ჩაწერილა
        $this->assertTrue(DB::table('module_user')->where('user_id', $this->owner->id)->where('module_id', $row->id)->exists());
        $this->assertTrue($this->owner->fresh()->hasModule($module['key']));
        $this->assertArrayNotHasKey($module['key'], $this->owner->fresh()->effectiveRole()->permissions);

        // ნაგულისხმევი სამი სტატუსი + ორი კატეგორია
        $this->assertSame(['planned', 'in_progress', 'done'], Status::keysFor($this->owner->id, $module['key']));
        $this->assertSame(2, CustomCategory::withoutGlobalScopes()->where('module', $module['key'])->count());
    }

    public function test_an_empty_status_set_seeds_nothing(): void
    {
        $module = $this->createModule($this->owner, ['statuses' => 'none', 'classification' => null, 'categories' => []]);

        $this->assertSame([], Status::keysFor($this->owner->id, $module['key']));
        $this->assertSame(0, CustomCategory::withoutGlobalScopes()->where('module', $module['key'])->count());
    }

    public function test_two_users_get_distinct_keys_for_the_same_name(): void
    {
        $a = $this->createModule($this->owner);
        $b = $this->createModule($this->stranger);
        $c = $this->createModule($this->owner);

        $this->assertNotSame($a['key'], $b['key']);
        $this->assertSame('c'.$this->owner->id.'-recipes-2', $c['key']);
    }

    public function test_the_key_never_exceeds_the_status_column(): void
    {
        $module = $this->createModule($this->owner, ['name_en' => 'An extraordinarily long module name here']);

        $this->assertLessThanOrEqual(CustomModules::MAX_KEY, strlen($module['key']));
        $this->assertTrue(CustomModules::isKey($module['key']));
    }

    public function test_the_number_of_modules_per_user_is_capped(): void
    {
        for ($i = 0; $i < CustomModules::MAX_PER_USER; $i++) {
            (new Module)->forceFill([
                'owner_id' => $this->owner->id,
                'key' => 'c'.$this->owner->id.'-m'.$i,
                'name_ka' => 'm', 'name_en' => 'm', 'icon' => 'Boxes',
                'route_base' => '/c/x', 'api_base' => '/custom/x',
            ])->save();
        }

        $this->actingAs($this->owner)->postJson('/api/modules', [
            'name_en' => 'One more', 'icon' => 'Boxes', 'statuses' => 'default',
        ])->assertStatus(422)->assertJsonPath('message', 'custom_module_limit');
    }

    public function test_super_admins_are_notified_except_the_creator(): void
    {
        $second = User::factory()->create();
        $second->assignRole('super_admin')->save();

        $this->createModule($this->owner);

        $this->assertSame(1, $this->admin->notifications()->where('type', NotificationType::MODULE_CREATED)->count());
        $this->assertSame(1, $second->notifications()->where('type', NotificationType::MODULE_CREATED)->count());
        $this->assertSame(0, $this->owner->notifications()->count());

        $data = $this->admin->notifications()->first()->data;
        $this->assertSame('Recipes', $data['module_name_en']);
        $this->assertSame($this->owner->id, $data['owner_id']);

        // სუპერადმინი თვითონ ქმნის — საკუთარ თავს არ აცნობებს
        $this->createModule($this->admin);
        $this->assertSame(1, $this->admin->notifications()->where('type', NotificationType::MODULE_CREATED)->count());
        $this->assertSame(2, $second->notifications()->where('type', NotificationType::MODULE_CREATED)->count());
    }

    /* ---------- სხვისთვის უხილავი (Q28/Q41) ---------- */

    public function test_a_private_module_is_invisible_to_everyone_else(): void
    {
        $key = $this->createModule($this->owner)['key'];

        $mine = collect($this->actingAs($this->owner)->getJson('/api/modules')->json('data'))->pluck('key');
        $this->assertContains($key, $mine);

        foreach ([$this->stranger, $this->admin] as $other) {
            $keys = collect($this->actingAs($other)->getJson('/api/modules')->json('data'))->pluck('key');
            $this->assertNotContains($key, $keys);

            $this->actingAs($other)->getJson("/api/custom/{$key}")->assertNotFound();
            $this->actingAs($other)->getJson("/api/statuses/{$key}")->assertNotFound();
            $this->actingAs($other)->getJson("/api/modules/{$key}/fields")->assertNotFound();
            $this->actingAs($other)->getJson("/api/modules/{$key}/custom-fields")->assertNotFound();
            $this->actingAs($other)->putJson("/api/modules/{$key}/details", ['name_en' => 'x'])->assertNotFound();
        }

        // ⚠️ სუპერადმინი ყველა აქტიურ მოდულს ავტომატურად იღებს — სხვის პირადს არა
        $this->assertFalse($this->admin->fresh()->hasModule($key));
        $this->assertFalse($this->admin->fresh()->hasPermission($key, 'view'));
        $this->assertFalse($this->admin->fresh()->enabledModules()->pluck('key')->contains($key));
    }

    public function test_an_unknown_private_key_answers_like_a_foreign_one(): void
    {
        // ⚠️ არსებული და არარსებული ერთნაირად — სხვაობა გასაღებს გაამხელდა
        $this->actingAs($this->stranger)->getJson('/api/custom/c999-nothing')->assertNotFound();
    }

    public function test_the_owner_gets_full_crud_in_the_permission_map(): void
    {
        $key = $this->createModule($this->owner)['key'];

        $permissions = $this->actingAs($this->owner)->getJson('/api/auth/me')->json('data.permissions')
            ?? $this->actingAs($this->owner)->getJson('/api/auth/me')->json('permissions');

        $this->assertSame(['view', 'create', 'update', 'delete'], $permissions[$key] ?? null);
    }

    /* ---------- ჩანაწერები (37.1/37.3) ---------- */

    public function test_the_owner_creates_and_edits_records(): void
    {
        $key = $this->createModule($this->owner)['key'];
        $this->actingAs($this->owner);

        $created = $this->postJson("/api/custom/{$key}", [
            'title' => 'ხაჭაპური',
            'description' => 'აჭარული',
            'status' => 'planned',
            'category_id' => $this->categoryId($key),
            'tags' => ['ცხელი', 'ცხელი ', 'ყველი'],
        ])->assertCreated()->json('data');

        $this->assertSame($key, $created['module']);
        $this->assertSame('planned', $created['status']['key']);
        $this->assertSame(['ცხელი', 'ყველი'], $created['tags']);

        $id = $created['id'];

        $this->patchJson("/api/custom/{$key}/{$id}/status", ['status' => 'done'])
            ->assertOk()->assertJsonPath('data.status.key', 'done');
        // ⚠️ `done` როლი დასრულების თარიღს წერს (FEAT-21-ის წესი)
        $this->assertNotNull(CustomRecord::find($id)->finished_at);

        $this->patchJson("/api/custom/{$key}/{$id}/favorite")->assertOk()->assertJsonPath('data.is_favorite', true);
        $this->putJson("/api/custom/{$key}/{$id}", ['title' => 'ლობიანი'])->assertOk()->assertJsonPath('data.title', 'ლობიანი');

        $list = $this->getJson("/api/custom/{$key}?favorite=1")->assertOk()->json('data');
        $this->assertCount(1, $list);
    }

    public function test_status_and_classification_are_mandatory_when_they_exist(): void
    {
        $key = $this->createModule($this->owner)['key'];
        $this->actingAs($this->owner);

        $this->postJson("/api/custom/{$key}", ['title' => 'x'])
            ->assertStatus(422)->assertJsonValidationErrors(['status', 'category_id']);

        // ⚠️ ცარიელი სტატუსებით/კლასიფიკაციის გარეშე მოდული ჩანაწერს მაინც იღებს
        $bare = $this->createModule($this->owner, ['statuses' => 'none', 'classification' => null, 'categories' => []])['key'];
        $this->postJson("/api/custom/{$bare}", ['title' => 'x'])->assertCreated();

        // კლასიფიკაციის გარეშე მოდულზე ველი საერთოდ არ მიიღება
        $this->postJson("/api/custom/{$bare}", ['title' => 'y', 'category_id' => $this->categoryId($key)])
            ->assertStatus(422)->assertJsonValidationErrors(['category_id']);
    }

    public function test_a_record_is_scoped_to_its_own_module(): void
    {
        $a = $this->createModule($this->owner)['key'];
        $b = $this->createModule($this->owner, ['name_en' => 'Books to buy'])['key'];
        $this->actingAs($this->owner);

        $id = $this->postJson("/api/custom/{$a}", [
            'title' => 'A', 'status' => 'planned', 'category_id' => $this->categoryId($a),
        ])->json('data.id');

        // ⚠️ იგივე მფლობელი, სხვა მოდული — `owner` scope ამას ვერ ჭრის
        $this->getJson("/api/custom/{$b}/{$id}")->assertNotFound();
        $this->deleteJson("/api/custom/{$b}/{$id}")->assertNotFound();
        $this->assertSame([], $this->getJson("/api/custom/{$b}")->json('data'));

        // კატეგორია მეორე მოდულიდან — 422
        $this->postJson("/api/custom/{$b}", ['title' => 'B', 'status' => 'planned', 'category_id' => $this->categoryId($a)])
            ->assertStatus(422)->assertJsonValidationErrors(['category_id']);
    }

    public function test_another_users_record_is_not_found(): void
    {
        $key = $this->createModule($this->owner)['key'];

        $id = $this->actingAs($this->owner)->postJson("/api/custom/{$key}", [
            'title' => 'A', 'status' => 'planned', 'category_id' => $this->categoryId($key),
        ])->json('data.id');

        $this->actingAs($this->stranger)->getJson("/api/custom/{$key}/{$id}")->assertNotFound();
        $this->actingAs($this->admin)->getJson("/api/custom/{$key}/{$id}")->assertNotFound();
    }

    public function test_a_link_fills_empty_fields_and_is_recognised_for_playback(): void
    {
        $key = $this->createModule($this->owner, ['statuses' => 'none', 'classification' => null])['key'];

        $record = $this->actingAs($this->owner)->postJson("/api/custom/{$key}", [
            'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'autofill' => 0,
        ])->assertCreated()->json('data');

        // სათაურის გარეშე — ბმულის ჰოსტი მაინც სჯობს უსახელო ჩანაწერს
        $this->assertSame('youtube.com', $record['title']);
        $this->assertSame('youtube', $record['platform']);
        $this->assertStringStartsWith('https://www.youtube-nocookie.com/embed/', $record['embed_url']);

        $plain = $this->postJson("/api/custom/{$key}", [
            'title' => 'site', 'url' => 'https://example.com/page', 'autofill' => 0,
        ])->json('data');
        $this->assertNull($plain['platform']);
        $this->assertNull($plain['embed_url']);
    }

    public function test_deleting_moves_the_record_to_the_trash_under_its_module(): void
    {
        $key = $this->createModule($this->owner)['key'];
        $this->actingAs($this->owner);

        $id = $this->postJson("/api/custom/{$key}", [
            'title' => 'ტრაში', 'status' => 'planned', 'category_id' => $this->categoryId($key),
        ])->json('data.id');

        $this->deleteJson("/api/custom/{$key}/{$id}")->assertNoContent();
        $this->getJson("/api/custom/{$key}/{$id}")->assertNotFound();

        $groups = collect($this->getJson('/api/trash')->assertOk()->json('data'));
        $group = $groups->firstWhere('kind', $key);

        $this->assertNotNull($group, 'პირადი მოდული ურნაში თავისი ჯგუფით');
        $this->assertSame('record', $group['category']);
        $this->assertSame('Recipes', $group['name_en']);
        $this->assertSame('ტრაში', $group['items'][0]['title']);

        $this->postJson("/api/trash/{$key}/{$id}/restore")->assertOk();
        $this->getJson("/api/custom/{$key}/{$id}")->assertOk();
    }

    public function test_a_photo_counts_against_the_owners_quota_under_the_module(): void
    {
        $key = $this->createModule($this->owner, ['statuses' => 'none', 'classification' => null])['key'];

        $record = $this->actingAs($this->owner)->post("/api/custom/{$key}", [
            'title' => 'ფოტოთი',
            'photo' => UploadedFile::fake()->image('dish.jpg', 400, 300),
        ], ['Accept' => 'application/json'])->assertCreated()->json('data');

        $this->assertStringStartsWith("custom/{$key}/photos/", $record['photo_path']);

        $meter = app(StorageMeter::class);
        $this->assertGreaterThan(0, $meter->usedByModule($this->owner->fresh(), $key));
        $this->assertGreaterThan(0, (int) $this->owner->fresh()->storage_used_bytes);

        // ⚠️ ჩანაწერის საბოლოო წაშლა ფოტოს მოდელით შლის და კვოტას ათავისუფლებს
        CustomRecord::find($record['id'])->delete();
        Storage::disk('public')->assertMissing($record['photo_path']);
        $this->assertSame(0, (int) $this->owner->fresh()->storage_used_bytes);
    }

    /* ---------- სტატუსები და კლასიფიკატორი ---------- */

    public function test_the_status_dictionary_is_the_owners(): void
    {
        $key = $this->createModule($this->owner)['key'];

        $statuses = $this->actingAs($this->owner)->getJson("/api/statuses/{$key}")->assertOk()->json('data');
        $this->assertSame(['planned', 'in_progress', 'done'], array_column($statuses, 'key'));

        $this->postJson("/api/statuses/{$key}", ['name_ka' => 'გადადებული', 'name_en' => 'Postponed', 'role' => 'todo'])
            ->assertCreated();
        $this->assertCount(4, $this->getJson("/api/statuses/{$key}")->json('data'));
    }

    public function test_the_classifier_is_managed_per_module(): void
    {
        $key = $this->createModule($this->owner)['key'];
        $this->actingAs($this->owner);

        $this->getJson("/api/custom/{$key}/categories")->assertOk()->assertJsonCount(2, 'data');

        $new = $this->postJson("/api/custom/{$key}/categories", ['name_ka' => 'საუზმე', 'name_en' => 'Breakfast'])
            ->assertCreated()->json('data');

        $recordId = $this->postJson("/api/custom/{$key}", [
            'title' => 'ომლეტი', 'status' => 'planned', 'category_id' => $new['id'],
        ])->json('data.id');

        // წაშლა გადატანით — ჩანაწერი სხვა კატეგორიაზე, რიგი ურნაში
        $target = $this->categoryId($key);
        $this->deleteJson("/api/custom/{$key}/categories/{$new['id']}", ['move_to' => $target])
            ->assertOk()->assertJsonPath('moved', 1);

        $this->assertSame($target, (int) CustomRecord::find($recordId)->category_id);
        $this->assertNotNull(CustomCategory::withoutGlobalScopes()->find($new['id'])->trashed_at);

        // კლასიფიკაციის გარეშე მოდულს კლასიფიკატორი არ აქვს
        $bare = $this->createModule($this->owner, ['classification' => null, 'categories' => []])['key'];
        $this->getJson("/api/custom/{$bare}/categories")->assertNotFound();
    }

    /* ---------- ველები (Q30 + §6) ---------- */

    public function test_the_built_in_fields_follow_the_classification(): void
    {
        $with = $this->createModule($this->owner)['key'];
        $without = $this->createModule($this->owner, ['classification' => null, 'categories' => []])['key'];
        $this->actingAs($this->owner);

        $keys = array_column($this->getJson("/api/modules/{$with}/fields")->assertOk()->json('fields'), 'key');
        $this->assertSame(['title', 'url', 'status', 'category', 'photo', 'description', 'tags'], $keys);

        // ⚠️ გადამრთველი, რომელიც არაფერს ცვლის, ტყუილია
        $keys = array_column($this->getJson("/api/modules/{$without}/fields")->json('fields'), 'key');
        $this->assertNotContains('category', $keys);

        // კლასიფიკაციის სახელი ველების კონსტრუქტორის ლეიბლია (Q30)
        $this->putJson("/api/modules/{$with}/fields", ['fields' => ['category' => ['label_ka' => 'კერძის სახე']]])->assertOk();
        $category = collect($this->getJson("/api/modules/{$with}/fields")->json('fields'))->firstWhere('key', 'category');
        $this->assertSame('კერძის სახე', $category['label_ka']);
    }

    public function test_custom_fields_are_created_with_the_module_and_scoped_per_module(): void
    {
        $fields = [['type' => 'number', 'label_ka' => 'ფასი', 'label_en' => 'Price']];

        $a = $this->createModule($this->owner, ['statuses' => 'none', 'classification' => null, 'fields' => $fields])['key'];
        $b = $this->createModule($this->owner, ['name_en' => 'Gadgets', 'statuses' => 'none', 'classification' => null, 'fields' => $fields])['key'];
        $this->actingAs($this->owner);

        $this->assertSame('price', $this->getJson("/api/modules/{$a}/custom-fields")->json('fields.0.key'));

        $ra = $this->postJson("/api/custom/{$a}", ['title' => 'A'])->json('data.id');
        $rb = $this->postJson("/api/custom/{$b}", ['title' => 'B'])->json('data.id');

        $this->putJson("/api/custom-fields/{$a}/{$ra}", ['values' => ['price' => 12]])->assertOk();
        $this->putJson("/api/custom-fields/{$b}/{$rb}", ['values' => ['price' => 99]])->assertOk();

        // ⚠️ სხვა მოდულის ჩანაწერი ამ მოდულის ველებით — 404
        $this->getJson("/api/custom-fields/{$a}/{$rb}")->assertNotFound();

        /* ⚠️ **ველის წაშლა `field_key`-ით შლის** — საერთო ცხრილში მოდულის
           გარეშე B-ს იმავე სახელის ველიც წავიდოდა. */
        $this->putJson("/api/modules/{$a}/custom-fields", ['fields' => []])->assertOk();

        $this->assertSame([], $this->getJson("/api/custom-fields/{$a}/{$ra}")->json('values'));
        $this->assertEquals(99, $this->getJson("/api/custom-fields/{$b}/{$rb}")->json('values.price'));
    }

    /* ---------- ექსპორტი · ძებნა · მთავარი გვერდი (37.3) ---------- */

    public function test_records_are_exported_searched_and_counted_per_module(): void
    {
        $a = $this->createModule($this->owner)['key'];
        $b = $this->createModule($this->owner, ['name_en' => 'Gadgets', 'statuses' => 'none', 'classification' => null])['key'];
        $this->actingAs($this->owner);

        $this->postJson("/api/custom/{$a}", [
            'title' => 'ხაჭაპური', 'description' => 'ყველიანი ცომეული',
            'status' => 'planned', 'category_id' => $this->categoryId($a),
        ])->assertCreated();
        $this->postJson("/api/custom/{$b}", ['title' => 'ტელეფონი'])->assertCreated();
        $this->postJson("/api/custom/{$b}", ['title' => 'ლეპტოპი'])->assertCreated();

        // ⚠️ მთვლელი **მოდულით** — ორივე ბარათი ყველა პირადი ჩანაწერის ჯამს არ აჩვენებს
        $cards = collect($this->getJson('/api/dashboard')->assertOk()->json('data'))->keyBy('key');
        $this->assertSame(1, $cards[$a]['count']);
        $this->assertSame(2, $cards[$b]['count']);

        $exports = collect($this->getJson('/api/export')->assertOk()->json('data'))->keyBy('key');
        $this->assertSame(1, $exports[$a]['count']);
        $this->assertSame(2, $exports[$b]['count']);

        $json = $this->get("/api/export/{$a}?format=json")->assertOk()->streamedContent();
        $this->assertStringContainsString('ხაჭაპური', $json);
        $this->assertStringNotContainsString('ტელეფონი', $json);
        $this->assertSame('planned', json_decode($json, true)['records'][0]['status']);

        $groups = collect($this->getJson('/api/search?q=ყველ')->assertOk()->json('groups'));
        $this->assertSame([$a], $groups->pluck('key')->all());
        $this->assertSame('ხაჭაპური', $groups[0]['items'][0]['title']);

        // სხვა ანგარიშს — არც ექსპორტი, არც ძებნა
        $this->actingAs($this->stranger)->get("/api/export/{$a}?format=json")->assertNotFound();
        $this->assertSame([], $this->actingAs($this->stranger)->getJson('/api/search?q=ყველ')->json('groups'));
    }

    /* ---------- რედაქტირება ---------- */

    public function test_the_owner_edits_the_module_details(): void
    {
        $key = $this->createModule($this->owner)['key'];

        $this->actingAs($this->owner)->putJson("/api/modules/{$key}/details", [
            'name_ka' => 'კერძები',
            'icon' => 'ChefHat',
            'classification' => 'type',
        ])->assertOk()
            ->assertJsonPath('data.name_ka', 'კერძები')
            ->assertJsonPath('data.definition.classification', 'type')
            // ⚠️ გასაღები არასდროს იცვლება
            ->assertJsonPath('data.key', $key);

        // საბაზისო მოდულის სახელი აქედან არ იცვლება
        $this->putJson('/api/modules/movie/details', ['name_ka' => 'x'])->assertNotFound();
    }
}
