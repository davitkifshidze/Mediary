<?php

namespace Tests\Feature;

use App\Models\CustomCategory;
use App\Models\Module;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use App\Support\NotificationType;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **„მომხმარებლების მოდულები" — სუპერადმინის ზედამხედველობა (Tasks §37.8, Q41).**
 *
 * ⚠️ ორი მხარე და ორივე ერთნაირად მნიშვნელოვანია. **სუპერადმინი** ხედავს
 * აგრეგატებს (სახელი, მფლობელი, რაოდენობა, ადგილი) და ერთადერთი მოქმედება
 * გამორთვაა — შიგთავსი, სახელის შეცვლა და წაშლა მისთვის არ არსებობს.
 * **მფლობელი** გამორთულ მოდულს „ადმინმა გამორთო"-თი ხედავს და თვითონ ვეღარ
 * ჩართავს, მონაცემები კი ხელუხლებელია — და შეტყობინებაც მიდის, თორემ
 * მენიუდან ჩუმად გამქრალი მოდული მონაცემების დაკარგვად წაიკითხებოდა.
 */
class CustomModuleOversightTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $stranger;

    private User $admin;

    private string $key;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        Storage::fake('public');
        Storage::fake('private');

        $this->owner = User::factory()->create(['username' => 'owner'])->refresh();
        $this->stranger = User::factory()->create(['username' => 'stranger'])->refresh();
        $this->admin = User::factory()->create(['username' => 'boss']);
        $this->admin->assignRole('super_admin')->save();
        $this->admin->refresh();

        $this->key = $this->createModule($this->owner, 'Recipes');

        foreach (['Pasta', 'Soup'] as $title) {
            $this->actingAs($this->owner)->post("/api/custom/{$this->key}", [
                'title' => $title,
                'status' => 'planned',
                'category_id' => (int) CustomCategory::withoutGlobalScopes()->where('module', $this->key)->value('id'),
                'photo' => UploadedFile::fake()->image("{$title}.jpg", 60, 60),
            ], ['Accept' => 'application/json'])->assertCreated();
        }
    }

    private function createModule(User $user, string $name): string
    {
        return $this->actingAs($user)->postJson('/api/modules', [
            'name_ka' => $name,
            'name_en' => $name,
            'icon' => 'Utensils',
            'classification' => 'category',
            'statuses' => 'default',
            'categories' => ['სადილი'],
        ])->assertCreated()->json('data.key');
    }

    private function moduleId(string $key): int
    {
        return (int) Module::where('key', $key)->value('id');
    }

    private function overview(): array
    {
        return collect($this->actingAs($this->admin)->getJson('/api/admin/modules/custom')->assertOk()->json('data'))
            ->keyBy('key')
            ->all();
    }

    /* ---------- სუპერადმინი ---------- */

    public function test_the_super_admin_sees_every_private_module_as_aggregates(): void
    {
        $gadgets = $this->createModule($this->stranger, 'Gadgets');

        // ⚠️ ურნაში მყოფი ჩანაწერი რაოდენობაში არ ითვლება (ის მფლობელის ურნაშია)
        $gone = $this->actingAs($this->owner)->postJson("/api/custom/{$this->key}", [
            'title' => 'Gone', 'status' => 'planned',
            'category_id' => (int) CustomCategory::withoutGlobalScopes()->where('module', $this->key)->value('id'),
        ])->assertCreated()->json('data.id');
        $this->deleteJson("/api/custom/{$this->key}/{$gone}")->assertNoContent();

        $response = $this->actingAs($this->admin)->getJson('/api/admin/modules/custom')->assertOk();
        $rows = collect($response->json('data'))->keyBy('key');

        $this->assertEqualsCanonicalizing([$this->key, $gadgets], $rows->keys()->all());
        $this->assertSame('owner', $rows[$this->key]['owner']['username']);
        $this->assertSame(2, $rows[$this->key]['records']);
        $this->assertSame(0, $rows[$gadgets]['records']);
        $this->assertSame(
            app(StorageMeter::class)->usedByModule($this->owner->fresh(), $this->key),
            $rows[$this->key]['bytes'],
        );
        $this->assertGreaterThan(0, $rows[$this->key]['bytes']);
        $this->assertTrue($rows[$this->key]['is_active']);

        // ⚠️ აგრეგატები და არა შიგთავსი — ჩანაწერის სათაური პასუხში არსად წერია
        $this->assertStringNotContainsString('Pasta', $response->getContent());
        $this->assertStringNotContainsString('Soup', $response->getContent());
    }

    public function test_only_a_super_admin_reaches_the_oversight(): void
    {
        $this->actingAs($this->owner)->getJson('/api/admin/modules/custom')->assertForbidden();
        $this->actingAs($this->owner)
            ->patchJson('/api/admin/modules/custom/'.$this->moduleId($this->key), ['is_active' => false])
            ->assertForbidden();
    }

    public function test_the_super_admin_cannot_rename_open_or_delete_someone_elses_module(): void
    {
        $id = $this->moduleId($this->key);
        $this->actingAs($this->admin);

        // ⚠️ საბაზისო კარი პირად მოდულს არ ეხება — სახელი და იერსახე მფლობელისაა
        $this->patchJson("/api/admin/modules/{$id}", ['name_en' => 'Hacked', 'enabled_by_default' => true])->assertNotFound();
        $this->assertSame('Recipes', Module::find($id)->name_en);
        $this->assertFalse((bool) Module::find($id)->enabled_by_default);

        // შიგთავსი სუპერადმინისთვისაც 404-ია, წაშლა — მხოლოდ მფლობელისაა
        $this->getJson("/api/custom/{$this->key}")->assertNotFound();
        $this->deleteJson("/api/modules/{$this->key}")->assertNotFound();

        // ზედამხედველობის კარი საბაზისო მოდულს არ ეხება
        $this->patchJson('/api/admin/modules/custom/'.$this->moduleId('movie'), ['is_active' => false])->assertNotFound();
        $this->assertTrue((bool) Module::where('key', 'movie')->value('is_active'));
    }

    /* ---------- გამორთვა ---------- */

    public function test_disabling_hides_the_module_from_its_owner_and_tells_them(): void
    {
        $this->actingAs($this->admin)
            ->patchJson('/api/admin/modules/custom/'.$this->moduleId($this->key), ['is_active' => false])
            ->assertOk()
            ->assertJsonPath('data.is_active', false)
            ->assertJsonPath('data.records', 2);

        // მფლობელი მოდულს „ადმინმა გამორთო"-თი ხედავს — ჩუმად არ ქრება
        $mine = collect($this->actingAs($this->owner->fresh())->getJson('/api/modules')->json('data'))->firstWhere('key', $this->key);
        $this->assertNotNull($mine);
        $this->assertTrue($mine['disabled_by_admin']);
        $this->assertFalse($mine['enabled']);

        // ჩანაწერები მიუწვდომელია (403 — მფლობელმა იცის, რომ არსებობს), თვითონ ვეღარ ჩართავს
        $this->getJson("/api/custom/{$this->key}")->assertForbidden();
        $this->patchJson("/api/modules/{$this->key}", ['enabled' => true])->assertNotFound();

        // შეტყობინება მფლობელს — მოდულის სახელით
        $notice = $this->owner->notifications()->where('type', NotificationType::MODULE_DISABLED)->first();
        $this->assertNotNull($notice);
        $this->assertSame($this->key, $notice->data['module_key']);
        $this->assertSame(0, $this->stranger->notifications()->count());

        // ⚠️ მონაცემები ხელუხლებელია
        $this->assertSame(2, $this->overview()[$this->key]['records']);
    }

    public function test_enabling_again_brings_it_back_without_a_second_notice(): void
    {
        $id = $this->moduleId($this->key);
        $this->actingAs($this->admin)->patchJson("/api/admin/modules/custom/{$id}", ['is_active' => false])->assertOk();
        $this->actingAs($this->admin)->patchJson("/api/admin/modules/custom/{$id}", ['is_active' => true])->assertOk();

        $this->actingAs($this->owner->fresh())->getJson("/api/custom/{$this->key}")->assertOk()->assertJsonPath('meta.total', 2);
        $this->assertSame(1, $this->owner->notifications()->where('type', NotificationType::MODULE_DISABLED)->count());
    }

    public function test_disabling_your_own_module_sends_no_notice(): void
    {
        $mine = $this->createModule($this->admin, 'Admin notes');

        $this->actingAs($this->admin)
            ->patchJson('/api/admin/modules/custom/'.$this->moduleId($mine), ['is_active' => false])
            ->assertOk();

        $this->assertSame(0, $this->admin->notifications()->where('type', NotificationType::MODULE_DISABLED)->count());
    }

    public function test_a_trashed_module_is_left_to_its_owner(): void
    {
        $this->actingAs($this->owner)->deleteJson("/api/modules/{$this->key}")->assertOk();

        $this->assertArrayNotHasKey($this->key, $this->overview());
        $this->actingAs($this->admin)
            ->patchJson('/api/admin/modules/custom/'.Module::withoutGlobalScopes()->where('key', $this->key)->value('id'), ['is_active' => false])
            ->assertNotFound();
    }
}
