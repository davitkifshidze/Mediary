<?php

namespace Tests\Feature;

use App\Models\CustomCategory;
use App\Models\CustomRecord;
use App\Models\CustomRecordFile;
use App\Models\CustomRecordNote;
use App\Models\Module;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **პირადი მოდულის შიგთავსი (Tasks §37.5)** — ჩანაწერის საკუთარი ფაილები
 * და ჩანიშვნები, სტატისტიკა და წლის მიზანი, მასობრივი სტატუსი და წაშლა.
 *
 * ⚠️ ერთი ცხრილი ყველა პირად მოდულს ემსახურება, ამიტომ თითქმის ყოველი
 * ტესტი „ამ მოდულის ჩანაწერი — კი, მეზობლისა — არა" წყვილია.
 */
class CustomModuleContentTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $stranger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        Storage::fake('public');
        Storage::fake('private');

        $this->owner = $this->makeUser('owner');
        $this->stranger = $this->makeUser('stranger');
    }

    private function makeUser(string $name): User
    {
        $user = User::factory()->create(['username' => $name]);
        $user->modules()->syncWithoutDetaching([
            Module::where('key', 'gallery')->value('id') => ['enabled_at' => now()],
        ]);

        // ⚠️ ქარხანა კვოტას არ წერს — მეხსიერებაში `null`-ია და ატვირთვა 413
        return $user->refresh();
    }

    private function createModule(User $user, string $name = 'Recipes', array $extra = []): string
    {
        return $this->actingAs($user)->postJson('/api/modules', [
            'name_en' => $name,
            'icon' => 'Utensils',
            'classification' => null,
            'statuses' => 'default',
            ...$extra,
        ])->assertCreated()->json('data.key');
    }

    private function record(User $user, string $key, array $attrs = []): CustomRecord
    {
        $id = $this->actingAs($user)->post("/api/custom/{$key}", [
            'title' => 'Pasta',
            'status' => 'planned',
            ...$attrs,
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.id');

        return CustomRecord::withoutGlobalScopes()->findOrFail($id);
    }

    /* ---------- ფაილები ---------- */

    public function test_files_upload_under_the_module_folder_and_count_against_its_limit(): void
    {
        $key = $this->createModule($this->owner);
        $pasta = $this->record($this->owner, $key);

        $photos = $this->post("/api/custom/{$key}/{$pasta->id}/files", [
            'kind' => 'image',
            'files' => [UploadedFile::fake()->image('a.jpg', 40, 40), UploadedFile::fake()->image('b.jpg', 40, 40)],
        ], ['Accept' => 'application/json'])->assertCreated()->json('data');

        $this->assertCount(2, $photos);
        $this->assertStringStartsWith("custom/{$key}/files/images/", $photos[0]['path']);

        $this->post("/api/custom/{$key}/{$pasta->id}/files", [
            'kind' => 'doc',
            'files' => [UploadedFile::fake()->create('menu.pdf', 12, 'application/pdf')],
        ], ['Accept' => 'application/json'])->assertCreated();

        $this->assertCount(2, $this->getJson("/api/custom/{$key}/{$pasta->id}/files?kind=image")->assertOk()->json('data'));
        $this->assertCount(3, $this->getJson("/api/custom/{$key}/{$pasta->id}/files")->json('data'));

        // ⚠️ საცავი ფაილს **მოდულს** აწერს — §17.2-ის ლიმიტი სწორედ ამას კითხულობს
        $meter = app(StorageMeter::class);
        $this->assertSame(3, $meter->files($this->owner->fresh(), $key)->where('owner_type', 'custom_record_file')->count());
        $this->assertGreaterThan(0, $meter->usedByModule($this->owner->fresh(), $key));
    }

    public function test_a_file_of_another_module_or_account_is_not_found(): void
    {
        $recipes = $this->createModule($this->owner);
        $gadgets = $this->createModule($this->owner, 'Gadgets');
        $pasta = $this->record($this->owner, $recipes);

        // ⚠️ ერთი ცხრილი, ორი მოდული — სხვა მოდულის მისამართით ჩანაწერი 404-ია
        $this->post("/api/custom/{$gadgets}/{$pasta->id}/files", [
            'kind' => 'image', 'files' => [UploadedFile::fake()->image('a.jpg', 40, 40)],
        ], ['Accept' => 'application/json'])->assertNotFound();

        $file = $this->post("/api/custom/{$recipes}/{$pasta->id}/files", [
            'kind' => 'image', 'files' => [UploadedFile::fake()->image('a.jpg', 40, 40)],
        ], ['Accept' => 'application/json'])->json('data.0.id');

        $this->deleteJson("/api/custom/{$gadgets}/files/{$file}")->assertNotFound();

        $this->actingAs($this->stranger)->getJson("/api/custom/{$recipes}/{$pasta->id}/files")->assertNotFound();
        $this->deleteJson("/api/custom/{$recipes}/files/{$file}")->assertNotFound();
        $this->assertNull(CustomRecordFile::withoutGlobalScopes()->find($file)->trashed_at);
    }

    public function test_a_deleted_file_goes_to_the_trash_under_its_record_and_restores(): void
    {
        $key = $this->createModule($this->owner);
        $pasta = $this->record($this->owner, $key);

        $file = $this->post("/api/custom/{$key}/{$pasta->id}/files", [
            'kind' => 'doc', 'files' => [UploadedFile::fake()->create('menu.pdf', 12, 'application/pdf')],
        ], ['Accept' => 'application/json'])->json('data.0');

        $this->deleteJson("/api/custom/{$key}/files/{$file['id']}")->assertNoContent();
        Storage::disk('public')->assertExists($file['path']);

        $group = collect($this->getJson('/api/trash')->assertOk()->json('data'))->firstWhere('kind', 'custom_record_file');
        $this->assertNotNull($group);
        $item = $group['items'][0];
        // ⚠️ მშობელი **მოდულის გასაღებით** — სახის `null` მოდულით ვერ იპოვიდა
        $this->assertSame($key, $item['parent']['kind']);
        $this->assertSame('Pasta', $item['parent']['title']);

        $this->postJson("/api/trash/custom_record_file/{$file['id']}/restore")->assertOk();
        $this->assertCount(1, $this->getJson("/api/custom/{$key}/{$pasta->id}/files")->json('data'));
    }

    public function test_deleting_the_record_for_good_removes_its_files_and_notes(): void
    {
        $key = $this->createModule($this->owner);
        $pasta = $this->record($this->owner, $key);

        $file = $this->post("/api/custom/{$key}/{$pasta->id}/files", [
            'kind' => 'image', 'files' => [UploadedFile::fake()->image('a.jpg', 40, 40)],
        ], ['Accept' => 'application/json'])->json('data.0');
        $this->postJson("/api/custom/{$key}/{$pasta->id}/notes", ['body' => 'Salt first'])->assertCreated();

        // ⚠️ ურნაში მყოფიც — `trash` scope-ით ის დისკზე ობლად დარჩებოდა
        $this->deleteJson("/api/custom/{$key}/files/{$file['id']}")->assertNoContent();

        CustomRecord::withoutGlobalScopes()->findOrFail($pasta->id)->delete();

        Storage::disk('public')->assertMissing($file['path']);
        $this->assertSame(0, CustomRecordFile::withoutGlobalScopes()->count());
        $this->assertSame(0, CustomRecordNote::withoutGlobalScopes()->count());
        $this->assertSame(0, (int) $this->owner->fresh()->storage_used_bytes);
    }

    public function test_the_modules_cut_shows_uploaded_photos(): void
    {
        $key = $this->createModule($this->owner);
        $pasta = $this->record($this->owner, $key);
        $this->post("/api/custom/{$key}/{$pasta->id}/files", [
            'kind' => 'image', 'files' => [UploadedFile::fake()->image('a.jpg', 40, 40)],
        ], ['Accept' => 'application/json'])->assertCreated();

        $photos = $this->getJson("/api/gallery/module-photos?module={$key}")->assertOk();
        $this->assertSame(1, $photos->json('meta.total'));
        $this->assertSame('Pasta', $photos->json('data.0.owner.title'));
    }

    /* ---------- ჩანიშვნები ---------- */

    public function test_notes_are_written_edited_and_trashed_per_module(): void
    {
        $recipes = $this->createModule($this->owner);
        $gadgets = $this->createModule($this->owner, 'Gadgets');
        $pasta = $this->record($this->owner, $recipes);

        $note = $this->postJson("/api/custom/{$recipes}/{$pasta->id}/notes", ['body' => 'Salt first'])
            ->assertCreated()->json('data');

        $this->putJson("/api/custom/{$recipes}/notes/{$note['id']}", ['body' => 'Salt the water'])->assertOk();
        $this->assertSame(['Salt the water'], array_column($this->getJson("/api/custom/{$recipes}/{$pasta->id}/notes")->json('data'), 'body'));

        $this->putJson("/api/custom/{$gadgets}/notes/{$note['id']}", ['body' => 'x'])->assertNotFound();
        $this->actingAs($this->stranger)->putJson("/api/custom/{$recipes}/notes/{$note['id']}", ['body' => 'x'])->assertNotFound();

        $this->actingAs($this->owner)->deleteJson("/api/custom/{$recipes}/notes/{$note['id']}")->assertNoContent();
        $this->assertSame([], $this->getJson("/api/custom/{$recipes}/{$pasta->id}/notes")->json('data'));
        $this->assertNotNull(collect($this->getJson('/api/trash')->json('data'))->firstWhere('kind', 'custom_record_note'));
    }

    /* ---------- სტატისტიკა და წლის მიზანი ---------- */

    public function test_the_stats_page_counts_a_private_module_on_its_own(): void
    {
        $key = $this->createModule($this->owner, 'Recipes', [
            'classification' => 'category',
            'categories' => ['სადილი', 'დესერტი'],
        ]);
        $other = $this->createModule($this->owner, 'Gadgets');
        $dinner = (int) CustomCategory::withoutGlobalScopes()->where('module', $key)->where('name_ka', 'სადილი')->value('id');

        $this->record($this->owner, $key, ['status' => 'done', 'category_id' => $dinner]);
        $this->record($this->owner, $key, ['title' => 'Soup', 'status' => 'planned', 'category_id' => $dinner]);
        $this->record($this->owner, $other, ['title' => 'Phone', 'status' => 'done']);

        $row = collect($this->getJson('/api/stats')->assertOk()->json('data'))->firstWhere('key', $key);

        $this->assertNotNull($row, 'პირადი მოდული სტატისტიკის ჩანართად უნდა ჩანდეს');
        $this->assertSame('Recipes', $row['name_en']);
        // ⚠️ ერთი ცხრილი, ორი მოდული — მეზობლის ჩანაწერი აქ არ ითვლება
        $this->assertSame(2, $row['total']);
        // სტატუსი ლექსიკონის რიგით (`sort_order`): „დაგეგმილი" → „დასრულებული"
        $this->assertSame(['planned' => 1, 'done' => 1], collect($row['status'])->pluck('count', 'key')->all());
        $this->assertSame([2], array_column($row['genres'], 'count'));
        $this->assertTrue($row['has_months']);
        $this->assertSame(1, $row['this_year']);

        // მიზანი: დასრულების თარიღი აქვს, ე.ი. მიზნის მოდულია
        $summary = $this->getJson('/api/stats/summary')->assertOk();
        $this->assertContains($key, $summary->json('goal_modules'));
        $this->assertSame(1, $summary->json("done_by_module.{$key}"));
        $this->assertSame(1, $summary->json("done_by_module.{$other}"));

        // სხვა ანგარიშის სტატისტიკაში ეს მოდული არ არსებობს
        $this->assertNull(collect($this->actingAs($this->stranger)->getJson('/api/stats')->json('data'))->firstWhere('key', $key));
    }

    /* ---------- მასობრივი სტატუსი ---------- */

    public function test_the_status_changes_in_bulk_within_the_module(): void
    {
        $key = $this->createModule($this->owner);
        $other = $this->createModule($this->owner, 'Gadgets');
        $a = $this->record($this->owner, $key);
        $b = $this->record($this->owner, $key, ['title' => 'Soup']);
        $foreign = $this->record($this->owner, $other, ['title' => 'Phone']);

        // ⚠️ ცარიელი სკოუპი არასდროს ნიშნავს „ყველას"
        $this->postJson("/api/custom/{$key}/bulk-status", ['status' => 'done'])->assertUnprocessable();

        $this->postJson("/api/custom/{$key}/bulk-status", ['status' => 'done', 'ids' => [$a->id, $foreign->id]])
            ->assertOk()->assertJsonPath('updated', 1);

        // ⚠️ მოდელით — `finished_at` მხოლოდ `applyStatus()`-ით იწერება
        $this->assertNotNull($a->fresh()->finished_at);
        $this->assertSame('planned', $foreign->fresh()->status->key, 'მეზობელი მოდულის ჩანაწერი ხელუხლებელია');

        $this->postJson("/api/custom/{$key}/bulk-status", ['status' => 'in_progress', 'from_status' => 'planned'])
            ->assertOk()->assertJsonPath('updated', 1);
        $this->assertSame('in_progress', $b->fresh()->status->key);

        $this->actingAs($this->stranger)
            ->postJson("/api/custom/{$key}/bulk-status", ['status' => 'done', 'ids' => [$b->id]])
            ->assertNotFound();
    }

    /* ---------- მასობრივი წაშლა (`/purge`) ---------- */

    private function superAdmin(): User
    {
        $admin = $this->makeUser('boss');
        $admin->assignRole('super_admin')->save();

        return $admin->refresh();
    }

    public function test_a_super_admin_purges_a_private_module_into_the_owners_trash(): void
    {
        $key = $this->createModule($this->owner, 'Recipes', ['classification' => 'category', 'categories' => ['სადილი']]);
        $other = $this->createModule($this->owner, 'Gadgets');
        $dinner = (int) CustomCategory::withoutGlobalScopes()->where('module', $key)->value('id');

        $pasta = $this->record($this->owner, $key, ['category_id' => $dinner]);
        $pasta->forceFill(['is_favorite' => true])->save();
        $soup = $this->record($this->owner, $key, ['title' => 'Soup', 'category_id' => $dinner]);
        $phone = $this->record($this->owner, $other, ['title' => 'Phone']);

        $this->post("/api/custom/{$key}/{$soup->id}/files", [
            'kind' => 'image', 'files' => [UploadedFile::fake()->image('a.jpg', 40, 40)],
        ], ['Accept' => 'application/json'])->assertCreated();

        $admin = $this->superAdmin();
        $this->actingAs($admin);

        // სამიზნე ანგარიშის პირადი მოდულები — სახელით და სკოუპებით, შიგთავსის გარეშე
        $targets = collect($this->getJson("/api/admin/purge/targets?user_id={$this->owner->id}")->assertOk()->json('items'));
        $this->assertSame([$key, $other], $targets->pluck('key')->all());
        $this->assertSame(['ids', 'type', 'tag', 'status', 'all'], $targets->firstWhere('key', $key)['modes']);
        $this->assertSame(['ids', 'tag', 'status', 'all'], $targets->firstWhere('key', $other)['modes']);
        $this->assertSame(['სადილი'], array_column($targets->firstWhere('key', $key)['categories'], 'name_ka'));

        $scope = ['target' => $key, 'mode' => 'type', 'type_ids' => [$dinner], 'keep_favorites' => true, 'user_id' => $this->owner->id];

        $plan = $this->postJson('/api/admin/purge/plan', $scope)->assertOk();
        $this->assertSame(1, $plan->json('plan.records'), 'რჩეული დაცულია, მეზობელი მოდული ხელუხლებელი');
        $this->assertSame('Soup', $plan->json('plan.items.0.title'));
        $this->assertSame(1, $plan->json('plan.attachments'));

        $this->postJson('/api/admin/purge/item', [
            'target' => $key, 'id' => $soup->id, 'user_id' => $this->owner->id, 'confirm' => 'DELETE',
        ])->assertOk()->assertJsonPath('result.records', 1);

        // ⚠️ ურნაში (Tasks §29.8) — მფლობელი თვითონ აღადგენს
        $this->assertNotNull($soup->fresh()->trashed_at);
        $this->assertNull($pasta->fresh()->trashed_at);
        $this->assertNull($phone->fresh()->trashed_at);

        // სტატუსის სკოუპი — **სამიზნის** ლექსიკონიდან
        $this->getJson("/api/statuses/{$key}?user_id={$this->owner->id}")->assertOk();
        $this->postJson('/api/admin/purge/plan', [
            'target' => $other, 'mode' => 'status', 'status' => 'planned', 'user_id' => $this->owner->id,
        ])->assertOk()->assertJsonPath('plan.records', 1);
    }

    public function test_another_accounts_private_module_is_not_a_purge_target(): void
    {
        $key = $this->createModule($this->owner);
        $this->record($this->owner, $key);
        $admin = $this->superAdmin();

        // ⚠️ გასაღები სხვა ანგარიშზე — 422, ისევე როგორც უცნობ სამიზნეზე
        $this->actingAs($admin)
            ->postJson('/api/admin/purge/plan', ['target' => $key, 'mode' => 'all', 'user_id' => $this->stranger->id])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'invalid_target');

        $this->postJson('/api/admin/purge/item', [
            'target' => $key, 'id' => 1, 'user_id' => $this->stranger->id, 'confirm' => 'DELETE',
        ])->assertUnprocessable();

        // სტატუსები მხოლოდ მფლობელის სახელით — სხვის `user_id`-ზე 404
        $this->getJson("/api/statuses/{$key}?user_id={$this->stranger->id}")->assertNotFound();

        // ⚠️ რიგითი მომხმარებლისთვის `/admin/purge` ისედაც დაკეტილია
        $this->actingAs($this->stranger)->getJson("/api/admin/purge/targets?user_id={$this->owner->id}")->assertForbidden();
    }

    public function test_notes_are_found_by_the_global_search(): void
    {
        $key = $this->createModule($this->owner);
        $pasta = $this->record($this->owner, $key);
        $this->postJson("/api/custom/{$key}/{$pasta->id}/notes", ['body' => 'Use saffron threads'])->assertCreated();

        $group = collect($this->getJson('/api/search?q=saffron')->assertOk()->json('groups'))->firstWhere('key', $key);
        $this->assertNotNull($group, 'ჩანიშვნაში ნაპოვნი ჩანაწერი მოდულის ჯგუფში უნდა ჩანდეს');
        $this->assertSame($pasta->id, $group['items'][0]['id']);
    }
}
