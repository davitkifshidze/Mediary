<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **როლების API** (Tasks 1.6 → 2026-09-15).
 *
 * ⚠️ **ეს ფაილი იმიტომ დაიბადა, რომ არსებული ტესტები `permissions`-ს
 * მოდელზე პირდაპირ წერდნენ** (`Role::create([...])`), ე.ი. `PUT
 * /api/admin/roles/{id}`-ის გზა — და მასში მჯდომი `cleanPermissions()` —
 * საერთოდ არავის შეუმოწმებია. სწორედ იქ იმალებოდა ცოცხალი შეცდომა:
 * ადმინის სექციის გასაღები ჩუმად ცვივდებოდა.
 */
class RoleApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create();
        $this->admin->assignRole('super_admin');
        $this->admin->save();

        Module::updateOrCreate(['key' => 'movie'], [
            'name_ka' => 'ფილმები', 'name_en' => 'Movies', 'route_base' => '/movies',
            'api_base' => '/movies', 'morph_alias' => 'movie', 'is_active' => true,
        ]);
    }

    private function role(): Role
    {
        return Role::create([
            'key' => 'editor',
            'name_ka' => 'რედაქტორი',
            'name_en' => 'Editor',
            'permissions' => [],
        ]);
    }

    /**
     * ⚠️ **ცოცხალი შეცდომა (გასწორდა 2026-09-15).** `cleanPermissions()`
     * დაშვებულ გასაღებებად მხოლოდ **მოდულებს** თვლიდა, ე.ი. მატრიცაში
     * მონიშნული „მომხმარებლები"/„აუდიტ-ლოგი" შენახვისას ჩუმად ცვივდებოდა:
     * ღილაკი ინიშნებოდა, „შენახულია" იწერებოდა და უფლება არ ჩნდებოდა.
     */
    public function test_admin_section_permissions_survive_a_save(): void
    {
        $role = $this->role();

        $this->actingAs($this->admin)
            ->putJson("/api/admin/roles/{$role->id}", [
                'name_ka' => 'რედაქტორი',
                'name_en' => 'Editor',
                'permissions' => [
                    'movie' => ['view', 'update'],
                    'admin:users' => ['view'],
                    'admin:audit' => ['view', 'delete'],
                ],
            ])
            ->assertOk();

        $saved = $role->refresh()->permissions;

        $this->assertSame(['view'], $saved['admin:users'] ?? null);
        $this->assertSame(['view', 'delete'], $saved['admin:audit'] ?? null);
        $this->assertSame(['view', 'update'], $saved['movie'] ?? null);
    }

    /**
     * ⚠️ **„ყველა მოდულის" ნიღაბი აღარ არსებობს** (2026-09-15, შენი
     * მითითება). ძველი კლიენტის გამოგზავნილი `*` ჩუმად უნდა ჩამოცვივდეს
     * და **არ** შეინახოს — თორემ მატრიცაში უხილავი უფლება დარჩებოდა.
     */
    public function test_the_wildcard_key_is_no_longer_stored(): void
    {
        $role = $this->role();

        $this->actingAs($this->admin)
            ->putJson("/api/admin/roles/{$role->id}", [
                'name_ka' => 'რედაქტორი',
                'name_en' => 'Editor',
                'permissions' => ['*' => ['view'], 'movie' => ['view']],
            ])
            ->assertOk();

        $this->assertArrayNotHasKey('*', $role->refresh()->permissions);
        $this->assertSame(['view'], $role->permissions['movie'] ?? null);
    }

    /** უცნობი მოდული და უცნობი მოქმედება ისევ ცვივდება */
    public function test_unknown_keys_are_dropped(): void
    {
        $role = $this->role();

        $this->actingAs($this->admin)
            ->putJson("/api/admin/roles/{$role->id}", [
                'name_ka' => 'რედაქტორი',
                'name_en' => 'Editor',
                'permissions' => ['no-such-module' => ['view'], 'admin:nope' => ['view']],
            ])
            ->assertOk();

        $this->assertSame([], $role->refresh()->permissions);
    }

    /**
     * ⚠️ **ნიღბის მოხსნის შემდეგ უფლება მხოლოდ ცხადად ჩაწერილია**: ერთ
     * მოდულზე მიცემული უფლება მეორეზე არ ვრცელდება.
     */
    public function test_a_module_permission_does_not_leak_to_another_module(): void
    {
        $role = $this->role();
        $role->forceFill(['permissions' => ['movie' => ['view', 'delete']]])->save();

        $user = User::factory()->create();
        $user->forceFill(['role_id' => $role->id])->save();

        $this->assertTrue($user->hasPermission('movie', 'delete'));
        $this->assertFalse($user->hasPermission('series', 'view'));
    }
}
