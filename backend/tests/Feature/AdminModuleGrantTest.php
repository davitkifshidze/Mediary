<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * **მოდულის მინიჭება ადმინიდან არ უნდა შლიდეს მომხმარებლის პარამეტრებს**
 * (Tasks §4.2).
 *
 * ⚠️ ხარვეზი **`enabled_at`-ში იყო და არა `settings`-ში**: `sync($ids)`
 * უკვე მიბმულ რიგზე `updateExistingPivot`-ს იძახებს, ე.ი. ადმინი, რომელიც
 * მომხმარებელს **ერთ** მოდულს ამატებდა, ყველა დანარჩენს „ახლა ჩაირთოო"
 * აწერდა. `settings` კი არასდროს იშლებოდა — ეს აქ ცხადად იწერება, თორემ
 * მომდევნო გავლაზე ისევ „მონაცემის დაკარგვად" ჩაითვლებოდა.
 *
 * ⚠️ ტესტი **პივოტს პირდაპირ კითხულობს** (`DB::table`) და არა მოდელით:
 * `module_user.settings` JSON-სტრინგია, რომელსაც Eloquent არ cast-ავს
 * (პროექტის ცნობილი წესი) — მოდელით კითხვა ხარვეზს ჩამალავდა.
 */
class AdminModuleGrantTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $member;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->admin = User::factory()->create([
            'role_id' => Role::where('key', 'super_admin')->value('id'),
        ]);

        $this->member = User::factory()->create();
        $this->member->modules()->sync(Module::whereIn('key', ['video', 'note'])->pluck('id')->all());
    }

    private function settings(string $module): ?array
    {
        $json = DB::table('module_user')
            ->where('user_id', $this->member->id)
            ->where('module_id', Module::where('key', $module)->value('id'))
            ->value('settings');

        return json_decode((string) $json, true);
    }

    public function test_granting_a_module_keeps_the_settings_of_the_others(): void
    {
        $this->actingAs($this->member)
            ->putJson('/api/modules/video/settings', ['settings' => ['gallery' => ['limit' => 12]]])
            ->assertOk();

        $this->actingAs($this->member)
            ->putJson('/api/modules/note/fields', ['fields' => ['tags' => ['enabled' => false]]])
            ->assertOk();

        // ადმინი ერთ მოდულს **ამატებს** — დანარჩენებს ხელი არ უნდა ახლოს
        $this->actingAs($this->admin)
            ->putJson("/api/admin/users/{$this->member->id}/modules", [
                'module_keys' => ['video', 'note', 'song'],
            ])
            ->assertOk();

        $this->assertSame(12, data_get($this->settings('video'), 'gallery.limit'));
        $this->assertFalse(data_get($this->settings('note'), 'fields.tags.enabled'));
    }

    public function test_an_unchanged_module_keeps_its_original_enabled_at(): void
    {
        $when = DB::table('module_user')
            ->where('user_id', $this->member->id)
            ->where('module_id', Module::where('key', 'video')->value('id'))
            ->value('enabled_at');

        $this->actingAs($this->admin)
            ->putJson("/api/admin/users/{$this->member->id}/modules", [
                'module_keys' => ['video', 'note', 'song'],
            ])
            ->assertOk();

        // ⚠️ ხელახალი `enabled_at` თვითონაც ტყუილი იქნებოდა: მოდული მაშინ არ ჩართულა
        $this->assertSame($when, DB::table('module_user')
            ->where('user_id', $this->member->id)
            ->where('module_id', Module::where('key', 'video')->value('id'))
            ->value('enabled_at'));
    }

    public function test_a_removed_module_is_still_detached(): void
    {
        $this->actingAs($this->admin)
            ->putJson("/api/admin/users/{$this->member->id}/modules", ['module_keys' => ['video']])
            ->assertOk();

        $this->assertNull($this->settings('note'));
        $this->assertSame(['video'], $this->member->fresh()->modules()->pluck('key')->all());
    }
}
