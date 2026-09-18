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
     * SEC-02 — `admin:users`-ის (ნახვა · რედაქტირება · წაშლა) მქონე, ოღონდ
     * `super_admin` არა. ⚠️ მოდულების უფლება მას განზრახ **არ** აქვს:
     * ტესტები ისიც ამოწმებენ, რომ ჩვეულებრივ მომხმარებლებს (ყველა მოდულზე
     * CRUD-ით) მაინც მართავს.
     */
    private function usersAdmin(): User
    {
        $role = Role::create([
            'key' => 'users-admin',
            'name_ka' => 'მომხმარებლების ადმინი',
            'name_en' => 'Users admin',
            'permissions' => ['admin:users' => ['view', 'update', 'delete']],
        ]);

        $user = User::factory()->create();
        $user->forceFill(['role_id' => $role->id])->save();

        return $user;
    }

    private function superAdminRoleId(): int
    {
        return (int) Role::where('key', 'super_admin')->value('id');
    }

    /**
     * ⚠️ **SEC-02 (Critical, 2026-09-17).** `PATCH /admin/users/{self}`
     * `role_id = super_admin`-ით ერთ მოთხოვნაში `/admin/purge`-ს და
     * `/admin/backups`-ს აძლევდა. ⚠️ პასუხი **403 `role_escalation`**-ია და
     * **არა** 422 `cannot_change_own_role` — ესკალაცია ჯერ მოწმდება.
     */
    public function test_a_users_admin_cannot_make_themselves_super_admin(): void
    {
        $actor = $this->usersAdmin();

        $this->actingAs($actor)
            ->patchJson("/api/admin/users/{$actor->id}", ['role_id' => $this->superAdminRoleId()])
            ->assertForbidden()
            ->assertJson(['message' => 'role_escalation']);

        $this->assertFalse($actor->refresh()->isSuperAdmin());
    }

    /** SEC-02 — სხვის დაწინაურება `super_admin`-ად: მხოლოდ `super_admin`-ს შეუძლია */
    public function test_only_a_super_admin_can_promote_someone_to_super_admin(): void
    {
        $target = User::factory()->create();

        $this->actingAs($this->usersAdmin())
            ->patchJson("/api/admin/users/{$target->id}", ['role_id' => $this->superAdminRoleId()])
            ->assertForbidden()
            ->assertJson(['message' => 'role_escalation']);

        $this->assertFalse($target->refresh()->isSuperAdmin());

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/users/{$target->id}", ['role_id' => $this->superAdminRoleId()])
            ->assertOk();

        $this->assertTrue($target->refresh()->isSuperAdmin());
    }

    /**
     * SEC-02 — ⚠️ ესკალაცია `super_admin`-ით არ ამოიწურება: `admin:audit`-ის
     * მიცემა `admin:users`-ის მქონეს ისეთ ძალაუფლებას მისცემდა, რაც
     * თვითონ **არ** აქვს. ⚠️ მოდულების CRUD-ი კი ითვლება **არ** — `user`
     * როლს ყველა მოდულზე CRUD აქვს და მისი მინიჭება ჩვეულებრივ საქმეა.
     */
    public function test_a_users_admin_cannot_hand_out_admin_power_they_lack(): void
    {
        $actor = $this->usersAdmin();
        $target = User::factory()->create();

        $auditor = Role::create([
            'key' => 'auditor', 'name_ka' => 'აუდიტორი', 'name_en' => 'Auditor',
            'permissions' => ['admin:audit' => ['view']],
        ]);
        $viewer = Role::create([
            'key' => 'users-viewer', 'name_ka' => 'ნახვა', 'name_en' => 'Viewer',
            'permissions' => ['admin:users' => ['view']],
        ]);

        $this->actingAs($actor)
            ->patchJson("/api/admin/users/{$target->id}", ['role_id' => $auditor->id])
            ->assertForbidden()
            ->assertJson(['message' => 'role_escalation']);

        $this->actingAs($actor)
            ->patchJson("/api/admin/users/{$target->id}", ['role_id' => $viewer->id])
            ->assertOk();

        $userRole = Role::where('key', 'user')->firstOrFail();
        $userRole->forceFill(['permissions' => ['movie' => Role::ACTIONS]])->save();

        $this->actingAs($actor)
            ->patchJson("/api/admin/users/{$target->id}", ['role_id' => $userRole->id])
            ->assertOk();

        $this->assertSame($userRole->id, $target->refresh()->role_id);
    }

    /**
     * SEC-02 — **საკუთარ როლს არავინ ცვლის, `super_admin`-ც** (422
     * `cannot_change_own_role`), მაშინაც, როცა მეორე სუპერ-ადმინი არსებობს და
     * `last_super_admin` არ შეაჩერებდა. იგივე მნიშვნელობის გამოგზავნა ცვლილება არაა.
     */
    public function test_nobody_changes_their_own_role(): void
    {
        $second = User::factory()->create();
        $second->assignRole('super_admin')->save();

        $userRoleId = (int) Role::where('key', 'user')->value('id');

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/users/{$this->admin->id}", ['role_id' => $userRoleId])
            ->assertUnprocessable()
            ->assertJson(['message' => 'cannot_change_own_role']);

        $this->assertTrue($this->admin->refresh()->isSuperAdmin());

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/users/{$this->admin->id}", ['role_id' => $this->superAdminRoleId()])
            ->assertOk();
    }

    /**
     * SEC-02 — ⚠️ **მაღლა მდგომ ანგარიშს არ ეხება**: `admin:users.delete`-ით
     * სუპერ-ადმინის მთელი ბიბლიოთეკის წაშლა, მისი გათიშვა ან მოდულების
     * შეცვლა ისეთივე ესკალაციაა, როგორც დაწინაურება.
     */
    public function test_a_users_admin_cannot_touch_a_super_admin_account(): void
    {
        $actor = $this->usersAdmin();
        $target = $this->admin;

        $this->actingAs($actor)
            ->patchJson("/api/admin/users/{$target->id}", ['is_active' => false])
            ->assertForbidden()
            ->assertJson(['message' => 'role_escalation']);

        $this->actingAs($actor)
            ->putJson("/api/admin/users/{$target->id}/modules", ['module_keys' => []])
            ->assertForbidden();

        $this->actingAs($actor)
            ->deleteJson("/api/admin/users/{$target->id}")
            ->assertForbidden()
            ->assertJson(['message' => 'role_escalation']);

        $this->assertTrue($target->refresh()->is_active);
        $this->assertTrue($target->isSuperAdmin());
    }

    /** SEC-02 — ⚠️ დაცვა ჩვეულებრივ მართვას **არ** ხურავს */
    public function test_a_users_admin_still_manages_ordinary_users(): void
    {
        $actor = $this->usersAdmin();
        $target = User::factory()->create();

        $this->actingAs($actor)
            ->patchJson("/api/admin/users/{$target->id}", ['is_active' => false])
            ->assertOk();

        $this->assertFalse($target->refresh()->is_active);

        $this->actingAs($actor)
            ->deleteJson("/api/admin/users/{$target->id}")
            ->assertNoContent();
    }

    /** SEC-03 — `admin:roles`-ის (ყველა მოქმედება) მქონე, ოღონდ `super_admin` არა */
    private function rolesAdmin(): User
    {
        $role = Role::create([
            'key' => 'roles-admin',
            'name_ka' => 'როლების ადმინი',
            'name_en' => 'Roles admin',
            'permissions' => ['admin:roles' => Role::ACTIONS],
        ]);

        $user = User::factory()->create();
        $user->forceFill(['role_id' => $role->id])->save();

        return $user;
    }

    /**
     * ⚠️ **SEC-03 (High, 2026-09-17).** `PUT /admin/roles/{საკუთარი}`-ით
     * `admin:users`-ის დამატება SEC-02-ის ჯაჭვის პირველი რგოლი იყო. ⚠️ პასუხი
     * **403 `role_escalation`**-ია, და **არა** 422 — ესკალაცია ჯერ მოწმდება.
     */
    public function test_a_roles_admin_cannot_add_admin_sections_to_their_own_role(): void
    {
        $actor = $this->rolesAdmin();
        $role = $actor->role;

        $this->actingAs($actor)
            ->putJson("/api/admin/roles/{$role->id}", [
                'name_ka' => $role->name_ka,
                'name_en' => $role->name_en,
                'permissions' => ['admin:roles' => Role::ACTIONS, 'admin:users' => ['view', 'update']],
            ])
            ->assertForbidden()
            ->assertJson(['message' => 'role_escalation']);

        $this->assertArrayNotHasKey('admin:users', $role->refresh()->permissions);
        $this->assertFalse($actor->refresh()->hasAdminAccess('users', 'update'));
    }

    /**
     * SEC-03 — საკუთარი როლის **უფლებებს** არ ცვლის (422
     * `cannot_edit_own_role`), მოდულის უფლებაზეც; სახელის გადარქმევა და
     * უცვლელი მატრიცის ხელახლა გამოგზავნა კი ჩვეულებრივ გადის.
     */
    public function test_a_roles_admin_cannot_edit_the_permissions_of_their_own_role(): void
    {
        $actor = $this->rolesAdmin();
        $role = $actor->role;

        $this->actingAs($actor)
            ->putJson("/api/admin/roles/{$role->id}", [
                'name_ka' => $role->name_ka,
                'name_en' => $role->name_en,
                'permissions' => ['admin:roles' => Role::ACTIONS, 'movie' => ['view', 'delete']],
            ])
            ->assertUnprocessable()
            ->assertJson(['message' => 'cannot_edit_own_role']);

        $this->assertArrayNotHasKey('movie', $role->refresh()->permissions);

        $this->actingAs($actor)
            ->putJson("/api/admin/roles/{$role->id}", [
                'name_ka' => 'ახალი სახელი',
                'name_en' => 'Renamed',
                'permissions' => ['admin:roles' => ['delete', 'view', 'update', 'create']],
            ])
            ->assertOk();

        $this->assertSame('Renamed', $role->refresh()->name_en);
    }

    /** SEC-03 — `admin:*` გასაღებიანი ახალი როლი: მხოლოდ `super_admin`-ს */
    public function test_only_a_super_admin_creates_a_role_with_admin_sections(): void
    {
        $payload = [
            'name_ka' => 'აუდიტორი',
            'name_en' => 'Auditor',
            'permissions' => ['admin:audit' => ['view'], 'movie' => ['view']],
        ];

        $actor = $this->rolesAdmin();

        $this->actingAs($actor)
            ->postJson('/api/admin/roles', $payload)
            ->assertForbidden()
            ->assertJson(['message' => 'role_escalation']);

        $this->assertDatabaseMissing('roles', ['name_en' => 'Auditor']);

        $this->actingAs($actor)
            ->postJson('/api/admin/roles', [...$payload, 'permissions' => ['movie' => ['view']]])
            ->assertCreated();

        $this->actingAs($this->admin)
            ->postJson('/api/admin/roles', [...$payload, 'name_en' => 'Auditor 2'])
            ->assertCreated();

        $this->assertSame(['view'], Role::where('name_en', 'Auditor 2')->value('permissions')['admin:audit'] ?? null);
    }

    /**
     * SEC-03 — ⚠️ ადმინ-ზონის შემადგენლობა `super_admin`-ისაა **ორივე
     * მიმართულებით**: სხვის როლიდან `admin:*`-ის მოხსნაც 403-ია; ამ
     * როლის **მოდულების** რედაქტირება კი (უცვლელი `admin:*` ნაწილით) გადის.
     */
    public function test_a_roles_admin_cannot_strip_admin_sections_from_another_role(): void
    {
        $actor = $this->rolesAdmin();
        $auditor = Role::create([
            'key' => 'auditor', 'name_ka' => 'აუდიტორი', 'name_en' => 'Auditor',
            'permissions' => ['admin:audit' => ['view']],
        ]);

        $this->actingAs($actor)
            ->putJson("/api/admin/roles/{$auditor->id}", [
                'name_ka' => 'აუდიტორი', 'name_en' => 'Auditor', 'permissions' => [],
            ])
            ->assertForbidden()
            ->assertJson(['message' => 'role_escalation']);

        $this->assertSame(['view'], $auditor->refresh()->permissions['admin:audit'] ?? null);

        $this->actingAs($actor)
            ->putJson("/api/admin/roles/{$auditor->id}", [
                'name_ka' => 'აუდიტორი', 'name_en' => 'Auditor',
                'permissions' => ['admin:audit' => ['view'], 'movie' => ['view']],
            ])
            ->assertOk();

        $this->assertSame(['view'], $auditor->refresh()->permissions['movie'] ?? null);
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

    /* ---------- მისანიჭებელი როლების სია (Tasks GAP-10) ---------- */

    /**
     * **`admin:users`-ის მქონე ადმინი როლების სახელებს ხედავს.**
     *
     * ⚠️ `GET /admin/roles` `admin_access:roles`-ის უკანაა, ე.ი. მან 403-ს
     * იღებდა და `/users/{id}`-ზე როლის სელექტი **ჩუმად ცარიელი** რჩებოდა —
     * ე.ი. სექცია, რომელსაც მართვის უფლება აქვს, გამოუსადეგარი იყო.
     */
    public function test_a_users_admin_can_list_assignable_roles(): void
    {
        $actor = $this->usersAdmin();

        // ძველი გზა მისთვის დახურულია და ასეც უნდა დარჩეს
        $this->actingAs($actor)->getJson('/api/admin/roles')->assertForbidden();

        $rows = $this->actingAs($actor)->getJson('/api/admin/assignable-roles')->assertOk()->json('data');

        $this->assertNotEmpty($rows);
        // ⚠️ ვიწრო ფორმა: სელექტს მხოლოდ სახელი სჭირდება, უფლებების მატრიცა — არა
        $this->assertSame(['id', 'key', 'name_ka', 'name_en'], array_keys($rows[0]));
        $this->assertStringNotContainsString('permissions', json_encode($rows));
    }

    /** ⚠️ სექციის უფლების გარეშე — 403, ისევე როგორც სექციის სხვა endpoint-ები */
    public function test_the_assignable_roles_list_needs_the_users_section(): void
    {
        $actor = $this->rolesAdmin();

        $this->actingAs($actor)
            ->getJson('/api/admin/assignable-roles')
            ->assertForbidden()
            ->assertJson(['message' => 'forbidden_permission', 'permission' => 'admin:users.view']);
    }

    /* ================= SEC-10: `permissions = null` ================= */

    /**
     * **ცარიელი `permissions` „უფლების არქონას" ნიშნავს და არა „ყველაფერს"**
     * (Tasks SEC-10).
     *
     * ⚠️ ასეთი რიგი API-დან არ იბადება (`cleanPermissions()` ყოველთვის
     * მასივს აბრუნებს), მაგრამ სვეტი `nullable` იყო და
     * `PartialRestore::table()` მას **ნებისმიერი ატვირთული dump-იდან**
     * შემოიტანდა — ე.ი. ჩვეულებრივი ანგარიში ყველა მოდულსა და ოთხივე
     * ადმინის სექციას იღებდა. ამიტომ ტესტი მდგომარეობას **ცხადად** აწყობს
     * (`forceFill` მოდელზე), და არა endpoint-ით: სწორედ ის გზაა
     * მოსაწესრიგებელი, რომელიც კონტროლერს გვერდს უვლის.
     */
    public function test_null_permissions_grant_nothing(): void
    {
        $role = $this->role();
        $role->forceFill(['permissions' => null])->save();

        $user = User::factory()->create(['role_id' => $role->id]);
        $fresh = $user->fresh()->load('role');

        $this->assertFalse($fresh->hasPermission('movie', 'view'));
        $this->assertFalse($fresh->hasPermission('movie', 'delete'));

        foreach (Role::ADMIN_RESOURCES as $resource) {
            $this->assertFalse(
                $fresh->role->allowsAdmin($resource, 'view'),
                "ცარიელმა `permissions`-მა admin:{$resource} გახსნა",
            );
        }
    }

    /**
     * **სუპერ-ადმინის შეუზღუდაობა გასაღებზე დგას და არა ცარიელ სვეტზე.**
     *
     * ⚠️ სწორედ ამიტომ შეიძლებოდა მიგრაციას `super_admin`-ის `permissions`
     * `{}`-ად გადაექცია: „ყველაფერი" `isSuperAdmin()`-იდან მოდის.
     * ⚠️ API-ს ფორმა კი უცვლელია — `RoleResource` მასზე კვლავ `null`-ს
     * აგზავნის, რადგან ფრონტის `roleScope()` მას კითხულობს როგორც
     * „მატრიცა ჩაკეტილია"; სვეტის მნიშვნელობა და API-ს მნიშვნელობა
     * განზრახ გაიყარა.
     */
    public function test_a_super_admin_keeps_everything_with_an_empty_matrix(): void
    {
        $super = Role::where('key', 'super_admin')->firstOrFail();
        $super->forceFill(['permissions' => []])->save();

        $this->assertTrue($super->allows('movie', 'delete'));
        $this->assertTrue($super->allowsAdmin('users', 'view'));
        $this->assertTrue($this->admin->fresh()->load('role')->hasPermission('movie', 'delete'));

        $permissions = $this->actingAs($this->admin)
            ->getJson('/api/admin/roles')
            ->assertOk()
            ->json('data');

        $row = collect($permissions)->firstWhere('key', 'super_admin');
        $this->assertNull($row['permissions'], 'API-ს ფორმა უნდა დარჩეს `null` = შეზღუდვის გარეშე');
    }

    /**
     * მიგრაციამ ერთი ცარიელი მნიშვნელობაც არ უნდა დატოვოს.
     *
     * ⚠️ `RefreshDatabase` ყოველ ტესტში მიგრაციებს ატარებს, ე.ი. ეს
     * ზუსტად იმ მდგომარეობას ამოწმებს, რომელსაც სუფთა ინსტალაცია იღებს.
     */
    public function test_no_role_is_born_with_an_empty_permission_column(): void
    {
        $this->assertSame(0, Role::query()->whereNull('permissions')->count());
    }
}
