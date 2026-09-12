<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * I7 — მფლობელობა, მოდულების gate და ადმინის დადასტურებები.
 */
class OwnershipTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    private User $bob;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->alice = $this->makeUser('alice', ['movie', 'series']);
        $this->bob = $this->makeUser('bob', ['movie', 'series']);
        $this->admin = $this->makeUser('admin', []);
        $this->admin->assignRole('super_admin')->save();
    }

    private function makeUser(string $name, array $modules): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);

        // `enabled_at`-ით — ისე, როგორც `AdminUserController::syncModules` ანიჭებს
        $ids = Module::whereIn('key', $modules)
            ->pluck('id')
            ->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now()]])
            ->all();
        $user->modules()->sync($ids);

        return $user->refresh();
    }

    private function makeMovie(User $owner, string $title): Movie
    {
        $movie = Movie::create(['user_id' => $owner->id, 'year' => 2020]);
        $movie->setTranslation('en', ['title' => $title]);

        return $movie;
    }

    public function test_api_requires_authentication(): void
    {
        $this->getJson('/api/movies')->assertStatus(401);
    }

    public function test_user_sees_only_own_records(): void
    {
        $this->makeMovie($this->alice, 'Alice movie');
        $this->makeMovie($this->bob, 'Bob movie 1');
        $this->makeMovie($this->bob, 'Bob movie 2');

        $this->actingAs($this->alice)->getJson('/api/movies')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->actingAs($this->bob)->getJson('/api/movies')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_other_users_record_is_not_found(): void
    {
        $movie = $this->makeMovie($this->alice, 'Alice movie');

        $this->actingAs($this->bob)->getJson("/api/movies/{$movie->id}")->assertStatus(404);
        $this->actingAs($this->bob)->deleteJson("/api/movies/{$movie->id}")->assertStatus(404);
        $this->actingAs($this->bob)->patchJson("/api/movies/{$movie->id}/status", ['status' => 'watched'])
            ->assertStatus(404);
    }

    public function test_created_record_belongs_to_current_user(): void
    {
        $this->actingAs($this->alice)
            ->postJson('/api/movies', ['title_en' => 'Fresh', 'year' => 2024])
            ->assertStatus(201);

        $this->assertSame($this->alice->id, Movie::withoutGlobalScope('owner')->first()->user_id);
    }

    public function test_genre_counts_are_per_user(): void
    {
        $genre = Genre::create(['slug' => 'drama']);
        $genre->setTranslation('en', 'Drama');

        $this->makeMovie($this->alice, 'A')->genres()->attach($genre->id);
        $this->makeMovie($this->alice, 'B')->genres()->attach($genre->id);
        $this->makeMovie($this->bob, 'C')->genres()->attach($genre->id);

        $this->actingAs($this->alice)->getJson('/api/genres')
            ->assertOk()
            ->assertJsonPath('data.0.movies_count', 2);

        $this->actingAs($this->bob)->getJson('/api/genres')
            ->assertOk()
            ->assertJsonPath('data.0.movies_count', 1);
    }

    public function test_module_gate_blocks_disabled_domain(): void
    {
        $carol = $this->makeUser('carol', ['movie']);

        $this->actingAs($carol)->getJson('/api/movies')->assertOk();
        $this->actingAs($carol)->getJson('/api/series')->assertStatus(403);
        $this->actingAs($carol)->getJson('/api/discover?type=series')->assertStatus(403);
    }

    public function test_module_request_flow(): void
    {
        $dave = $this->makeUser('dave', []);

        $this->actingAs($dave)->getJson('/api/movies')->assertStatus(403);

        $this->actingAs($dave)->postJson('/api/requests/module', ['module_key' => 'movie'])
            ->assertStatus(201)
            ->assertJsonPath('data.status', 'pending');

        $request = ApprovalRequest::first();

        $this->actingAs($this->admin)->postJson("/api/admin/requests/{$request->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $this->actingAs($dave->refresh())->getJson('/api/movies')->assertOk();
    }

    public function test_genre_delete_needs_admin_approval_for_regular_user(): void
    {
        $genre = Genre::create(['slug' => 'noir']);
        $genre->setTranslation('en', 'Noir');

        $this->actingAs($this->alice)->deleteJson("/api/genres/{$genre->id}")
            ->assertStatus(202)
            ->assertJsonPath('message', 'approval_required');

        $this->assertDatabaseHas('genres', ['id' => $genre->id]);

        $request = ApprovalRequest::where('type', ApprovalRequest::TYPE_GENRE_DELETE)->firstOrFail();

        $this->actingAs($this->admin)->postJson("/api/admin/requests/{$request->id}/approve")->assertOk();

        $this->assertDatabaseMissing('genres', ['id' => $genre->id]);
    }

    public function test_admin_deletes_genre_directly_and_sees_global_usage(): void
    {
        $genre = Genre::create(['slug' => 'western']);
        $genre->setTranslation('en', 'Western');
        $this->makeMovie($this->bob, 'Bob western')->genres()->attach($genre->id);

        // ჟანრი გლობალურია: ადმინის საკუთარ ბიბლიოთეკაში 0 ჩანაწერია, მაგრამ
        // სხვისი მიბმა მაინც უნდა დაითვალოს — თორემ წაშლა ჩუმად წაშლიდა bob-ის ჟანრს
        $this->actingAs($this->admin)->deleteJson("/api/genres/{$genre->id}")
            ->assertStatus(409)
            ->assertJsonPath('movies_count', 1);

        $this->actingAs($this->admin)->deleteJson("/api/genres/{$genre->id}", ['force' => true])
            ->assertNoContent();
    }

    /** K13 — მომხმარებელი თვითონ რთავს/თიშავს მინიჭებულ მოდულს */
    public function test_user_can_disable_and_reenable_own_module(): void
    {
        $this->actingAs($this->alice)->getJson('/api/movies')->assertOk();

        $this->actingAs($this->alice)->patchJson('/api/modules/movie', ['enabled' => false])->assertOk();
        $this->actingAs($this->alice->refresh())->getJson('/api/movies')->assertStatus(403);

        // უფლება რჩება — ადმინის ხელახალი დადასტურება არ სჭირდება
        $this->actingAs($this->alice)->getJson('/api/modules')
            ->assertOk()
            ->assertJsonPath('data.0.enabled', false)
            ->assertJsonPath('data.0.granted', true);

        $this->actingAs($this->alice)->patchJson('/api/modules/movie', ['enabled' => true])->assertOk();
        $this->actingAs($this->alice->refresh())->getJson('/api/movies')->assertOk();
    }

    /** მინიჭების გარეშე ჩართვა არ შეიძლება — ჯერ მოთხოვნა ადმინთან */
    public function test_user_cannot_enable_module_without_grant(): void
    {
        $dave = $this->makeUser('dave2', []);

        $this->actingAs($dave)->patchJson('/api/modules/movie', ['enabled' => true])->assertStatus(403);
    }

    public function test_regular_user_cannot_reach_admin_endpoints(): void
    {
        $this->actingAs($this->alice)->getJson('/api/admin/users')->assertStatus(403);
        $this->actingAs($this->admin)->getJson('/api/admin/users')->assertOk();
    }

    /* ---------- Tasks 1.6 — ადმინის სექციები როლის უფლებით ---------- */

    /** როლს შეიძლება მიეცეს ცალკეული სექცია, მთელი super_admin-ის გარეშე */
    public function test_role_can_grant_a_single_admin_section(): void
    {
        $role = Role::create([
            'key' => 'moderator',
            'name_ka' => 'მოდერატორი',
            'name_en' => 'Moderator',
            'permissions' => ['admin:requests' => ['view', 'update']],
        ]);
        $this->alice->forceFill(['role_id' => $role->id])->save();
        $alice = $this->alice->refresh();

        // მიცემული სექცია იხსნება…
        $this->actingAs($alice)->getJson('/api/admin/requests')->assertOk();
        // …დანარჩენი კი არა
        $this->actingAs($alice)->getJson('/api/admin/users')->assertStatus(403);
        $this->actingAs($alice)->getJson('/api/admin/roles')->assertStatus(403);

        $this->assertSame(['requests'], $alice->adminResources());
    }

    /**
     * ⚠️ **მთავარი უსაფრთხოების წესი:** `"*"` („ყველა მოდული") ადმინის
     * სექციას **არ** ხსნის. სხვაგვარად ჩვეულებრივი როლი, რომელსაც ყველა
     * მოდულზე უფლება აქვს, ჩუმად მიიღებდა მომხმარებლების მართვას.
     */
    public function test_wildcard_module_permission_never_opens_the_admin_zone(): void
    {
        $role = Role::create([
            'key' => 'power-user',
            'name_ka' => 'გაძლიერებული',
            'name_en' => 'Power user',
            'permissions' => ['*' => ['view', 'create', 'update', 'delete']],
        ]);
        $this->alice->forceFill(['role_id' => $role->id])->save();
        $alice = $this->alice->refresh();

        foreach (['users', 'roles', 'requests'] as $section) {
            $this->actingAs($alice)->getJson("/api/admin/{$section}")->assertStatus(403);
        }

        $this->assertSame([], $alice->adminResources());
        // მოდულის უფლება კი მართლა აქვს — ე.ი. `*` თავის საქმეს აკეთებს
        $this->assertTrue($alice->hasPermission('movie', 'delete'));
    }

    /**
     * ⚠️ **გლობალური და დესტრუქციული ოპერაციები `super_admin`-ზე რჩება**:
     * მოდულის გამორთვა ყველა ანგარიშს ეხება, purge კი სხვისი ბიბლიოთეკის
     * წაშლაა — ეს ერთი სექციის უფლებით არ უნდა იხსნებოდეს.
     */
    public function test_admin_sections_do_not_unlock_global_operations(): void
    {
        $role = Role::create([
            'key' => 'staff',
            'name_ka' => 'პერსონალი',
            'name_en' => 'Staff',
            'permissions' => [
                'admin:users' => ['view', 'update', 'delete'],
                'admin:roles' => ['view', 'update'],
                'admin:requests' => ['view', 'update'],
            ],
        ]);
        $this->alice->forceFill(['role_id' => $role->id])->save();
        $alice = $this->alice->refresh();

        $this->actingAs($alice)->getJson('/api/admin/users')->assertOk();

        $this->actingAs($alice)->getJson('/api/admin/modules')->assertStatus(403);
        $this->actingAs($alice)->postJson('/api/admin/purge/plan', ['target' => 'movie', 'mode' => 'all'])
            ->assertStatus(403);
    }

    /** სექციის შიგნით მოქმედებაც ცალკეა: ნახვა ≠ წაშლა */
    public function test_admin_section_actions_are_separate(): void
    {
        $role = Role::create([
            'key' => 'viewer',
            'name_ka' => 'დამკვირვებელი',
            'name_en' => 'Viewer',
            'permissions' => ['admin:users' => ['view']],
        ]);
        $this->alice->forceFill(['role_id' => $role->id])->save();
        $alice = $this->alice->refresh();

        $this->actingAs($alice)->getJson('/api/admin/users')->assertOk();
        $this->actingAs($alice)->deleteJson("/api/admin/users/{$this->bob->id}")->assertStatus(403);
    }

    /** L4 — სიაშივე სრული ინფო: შიგთავსი, რჩეულები, ბოლო აქტივობა, ადგილი */
    public function test_admin_user_list_carries_full_info(): void
    {
        $this->makeMovie($this->alice, 'Alice movie')->forceFill(['is_favorite' => true])->save();
        $this->makeMovie($this->alice, 'Another');

        $row = collect(
            $this->actingAs($this->admin)->getJson('/api/admin/users')->assertOk()->json('data')
        )->firstWhere('id', $this->alice->id);

        $this->assertSame(2, $row['movies_count']);
        $this->assertSame(1, $row['favorites_count']);
        $this->assertSame(['movie', 'series'], $row['modules']);
        $this->assertSame([], $row['hidden_modules']);
        $this->assertArrayHasKey('last_activity', $row);
        // 17.1 — ადმინის ხედში ფაილების ჯამი + ლიმიტი და დაქეშილი მრიცხველი
        $this->assertSame(0, $row['storage']['files']);
        $this->assertSame(0, $row['storage']['bytes']);
        $this->assertSame(0, $row['storage']['used']);
        $this->assertSame(1073741824, $row['storage']['quota']);
    }

    /** L3 — „ვის აქვს ჩართული": თვითონ გამორთულიც სიაშია, ოღონდ მონიშნული */
    public function test_admin_module_list_shows_holders_with_state(): void
    {
        // alice თვითონ გამორთავს ფილმებს — უფლება რჩება (K13)
        $this->actingAs($this->alice)->patchJson('/api/modules/movie', ['enabled' => false])->assertOk();

        $movie = collect(
            $this->actingAs($this->admin)->getJson('/api/admin/modules')->assertOk()->json('data')
        )->firstWhere('key', 'movie');

        $holders = collect($movie['users']);

        // ჩართულად ითვლება bob + admin (ავტომატურად), alice — არა
        $this->assertSame(2, $movie['users_count']);
        $this->assertTrue($holders->firstWhere('id', $this->alice->id)['hidden_by_user']);
        $this->assertFalse($holders->firstWhere('id', $this->bob->id)['hidden_by_user']);
        $this->assertTrue($holders->firstWhere('id', $this->admin->id)['implicit']);
        $this->assertNotNull($holders->firstWhere('id', $this->bob->id)['enabled_at']);
    }
}
