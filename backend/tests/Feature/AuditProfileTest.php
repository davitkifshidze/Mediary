<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * **ვინ შევიდა ვის პროფილში და რა გადმოიტანა** — ჟურნალი მხოლოდ სუპერადმინისთვის.
 *
 * ⚠️ ანონიმიც იწერება, მფლობელი თავის პროფილს არ ითვლის, იგივე სტუმარი წუთში
 * ერთხელ; `admin_access:audit` როლი ამ რიგებს ვერც სიაში ხედავს და ვერც ხედში.
 */
class AuditProfileTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $visitor;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        Cache::flush();

        $this->owner = $this->makeUser('davit');
        $this->owner->forceFill(['profile_visibility' => 'public'])->save();
        $this->owner->modules()->syncWithoutDetaching([Module::where('key', 'movie')->value('id') => ['is_public' => true]]);

        $this->visitor = $this->makeUser('nato');
        $this->admin = $this->makeUser('root');
        $this->admin->assignRole('super_admin')->save();
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name, 'username' => $name,
            'email' => "{$name}@example.com", 'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', ['movie'])->pluck('id')->all());

        return $user->refresh();
    }

    private function visits()
    {
        return AuditLog::where('action', AuditLog::ACTION_PROFILE_VISIT)->orderBy('id')->get();
    }

    public function test_a_visit_is_logged_for_a_stranger_and_an_anonymous_guest_but_not_the_owner(): void
    {
        $this->getJson('/api/public/profiles/davit')->assertOk();
        $this->actingAs($this->visitor)->getJson('/api/public/profiles/davit')->assertOk();
        $this->actingAs($this->owner)->getJson('/api/public/profiles/davit')->assertOk();

        $rows = $this->visits();
        $this->assertCount(2, $rows);
        $this->assertNull($rows[0]->user_id);
        $this->assertSame($this->visitor->id, (int) $rows[1]->user_id);
        $this->assertSame('u/davit', $rows[1]->route);
        $this->assertSame(['owner' => 'davit', 'owner_id' => $this->owner->id], $rows[1]->context);
    }

    public function test_the_same_visitor_counts_once_a_minute(): void
    {
        $this->actingAs($this->visitor)->getJson('/api/public/profiles/davit')->assertOk();
        $this->actingAs($this->visitor)->getJson('/api/public/profiles/davit')->assertOk();
        $this->assertCount(1, $this->visits());

        $this->travel(2)->minutes();
        $this->actingAs($this->visitor)->getJson('/api/public/profiles/davit')->assertOk();
        $this->assertCount(2, $this->visits());
    }

    public function test_the_super_admin_sees_visits_and_imports_grouped_by_visitor_and_owner(): void
    {
        $movie = Movie::create(['user_id' => $this->owner->id]);
        $movie->forceFill(['visibility' => 'public'])->save();
        $movie->translations()->create(['locale' => 'en', 'title' => 'Dune']);

        $this->actingAs($this->visitor)->getJson('/api/public/profiles/davit')->assertOk();
        $this->actingAs($this->visitor)->postJson('/api/public-profiles/davit/item', ['domain' => 'movie', 'id' => $movie->id])
            ->assertOk()
            ->assertJson(['result' => 'added']);
        Auth::forgetGuards();
        $this->getJson('/api/public/profiles/davit')->assertOk();

        $rows = collect($this->actingAs($this->admin)->getJson('/api/admin/audit/profiles')->assertOk()->json('data'));

        $nato = $rows->firstWhere('user_id', $this->visitor->id);
        $this->assertSame(['davit', 1, 1], [$nato['owner'], $nato['visits'], $nato['imports']]);
        $this->assertSame('nato', $nato['user']['username']);

        $anon = $rows->firstWhere('user_id', null);
        $this->assertSame([1, 0], [$anon['visits'], $anon['imports']]);

        // ჩაღრმავება — რა გადმოიტანა ამ პროფილიდან
        $imports = $this->actingAs($this->admin)
            ->getJson('/api/admin/audit?action=import&user_id='.$this->visitor->id.'&owner=davit')
            ->assertOk()
            ->json('data');
        $this->assertSame(['Dune'], array_column(array_column($imports, 'subject'), 'label'));
    }

    public function test_an_audit_role_sees_neither_the_view_nor_the_visit_rows(): void
    {
        Role::create([
            'key' => 'auditor', 'name_ka' => 'აუდიტორი', 'name_en' => 'Auditor',
            'permissions' => ['admin:audit' => ['view']],
        ]);
        $auditor = $this->makeUser('auditor');
        $auditor->assignRole('auditor')->save();

        $this->actingAs($this->visitor)->getJson('/api/public/profiles/davit')->assertOk();
        AuditLog::create(['action' => AuditLog::ACTION_UPDATE, 'module' => 'movie', 'created_at' => now()]);

        $this->actingAs($auditor->refresh())->getJson('/api/admin/audit/profiles')->assertForbidden();

        $actions = array_column($this->actingAs($auditor)->getJson('/api/admin/audit')->assertOk()->json('data'), 'action');
        $this->assertNotContains(AuditLog::ACTION_PROFILE_VISIT, $actions);
        $this->assertContains(AuditLog::ACTION_UPDATE, $actions);
        $this->assertNotContains(AuditLog::ACTION_PROFILE_VISIT, $this->getJson('/api/admin/audit/meta')->json('actions'));

        // სუპერადმინი კი ხედავს
        $this->assertContains(
            AuditLog::ACTION_PROFILE_VISIT,
            array_column($this->actingAs($this->admin)->getJson('/api/admin/audit')->json('data'), 'action'),
        );
    }

    public function test_the_switch_turns_profile_visits_off(): void
    {
        $this->actingAs($this->admin)
            ->putJson('/api/admin/audit/settings', ['off' => ['profile_visit']])
            ->assertOk();

        $this->actingAs($this->visitor)->getJson('/api/public/profiles/davit')->assertOk();
        $this->assertCount(0, $this->visits());
    }
}
