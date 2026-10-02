<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Role;
use App\Models\Status;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * **„ნაგულისხმევი სტატუსების აღდგენა" (Tasks 2026-10-02 §1).**
 *
 * მოწმდება ის, რაც ჩუმად ჩავარდებოდა: აკლდება მხოლოდ ის, რაც აკლია
 * (გადარქმეული ცოცხალია და ხელუხლებელი), ურნაში მყოფი **ურნიდან** ბრუნდება
 * (ახალი იმავე გასაღებით `unique`-ზე წაიქცეოდა), თანამოსახელე არ ორმაგდება,
 * ადგილი კანონიკურია, ნაგულისხმევი მხოლოდ მაშინ ინიშნება, როცა არცერთი არ
 * არის, და — რაც მთავარია — **არაფერი ხდება თავისით**.
 */
class StatusRestoreDefaultsTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('dato');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::pluck('id')->all());

        return $user->refresh();
    }

    private function row(string $key, string $domain = 'movie'): ?Status
    {
        return Status::withoutGlobalScopes()
            ->where('user_id', $this->user->id)
            ->where('module', $domain)
            ->where('key', $key)
            ->first();
    }

    /** @return list<string> ცოცხალი გასაღებები რიგით */
    private function keys(string $domain = 'movie'): array
    {
        return $this->actingAs($this->user)->getJson("/api/statuses/{$domain}")->assertOk()->json('data.*.key');
    }

    private function restore(string $domain = 'movie')
    {
        return $this->actingAs($this->user)->postJson("/api/statuses/{$domain}/restore-defaults");
    }

    public function test_a_missing_default_comes_back_in_its_place_and_nothing_else_changes(): void
    {
        Status::ensureDefaults($this->user->id, 'movie');
        // გადარქმეული ცოცხალია — გასაღებით იცნობა და ხელუხლებელი რჩება
        $this->row('watched')->forceFill(['name_ka' => 'ვნახე'])->save();
        // საბოლოოდ წაშლილი (ურნის გარეშე)
        DB::table('statuses')->where('user_id', $this->user->id)->where('key', 'to_watch')->delete();

        // ⚠️ თავისით — არასდროს: სიის გახსნა დაკარგულს არ აბრუნებს
        $this->assertSame(['undecided', 'watching', 'watched'], $this->keys());

        $this->restore()
            ->assertOk()
            ->assertJsonPath('restored', ['to_watch'])
            ->assertJsonPath('from_trash', [])
            ->assertJsonPath('skipped', [])
            ->assertJsonPath('data.1.key', 'to_watch');

        // კანონიკური ადგილი — „გადაუწყვეტელის" შემდეგ
        $this->assertSame(['undecided', 'to_watch', 'watching', 'watched'], $this->keys());
        $this->assertSame('ვნახე', $this->row('watched')->name_ka);
        $this->assertSame('საყურებელი', $this->row('to_watch')->name_ka);
        $this->assertSame('todo', $this->row('to_watch')->role);

        // ⚠️ ადამიანის ქმედებაა — ჟურნალში ჩანს
        $this->assertTrue(AuditLog::where('action', AuditLog::ACTION_CREATE)
            ->where('subject_type', 'status')->where('subject_label', 'საყურებელი')->exists());
    }

    public function test_a_default_in_the_trash_comes_back_from_the_trash(): void
    {
        Status::ensureDefaults($this->user->id, 'movie');
        $row = $this->row('watching');
        $row->forceFill(['trash_meta' => ['ids' => [1], 'to' => 2]])->save();
        $row->moveToTrash();

        $this->restore()
            ->assertOk()
            ->assertJsonPath('restored', [])
            ->assertJsonPath('from_trash', ['watching']);

        $back = $this->row('watching');
        $this->assertSame($row->id, $back->id, 'ახალი რიგი კი არა — იგივე, ურნიდან');
        $this->assertNull($back->trashed_at);
        $this->assertNull($back->trash_meta);
        $this->assertSame(['undecided', 'to_watch', 'watching', 'watched'], $this->keys());
        $this->assertSame(4, Status::withoutGlobalScopes()->where('user_id', $this->user->id)->where('module', 'movie')->count());
    }

    public function test_a_namesake_of_my_own_is_not_duplicated(): void
    {
        Status::ensureDefaults($this->user->id, 'movie');
        DB::table('statuses')->where('user_id', $this->user->id)->where('key', 'to_watch')->delete();

        // საკუთარი „საყურებელი" სხვა გასაღებით
        $this->actingAs($this->user)
            ->postJson('/api/statuses/movie', ['name_ka' => 'საყურებელი', 'name_en' => 'Later', 'role' => 'todo'])
            ->assertCreated();

        $this->restore()
            ->assertOk()
            ->assertJsonPath('restored', [])
            ->assertJsonPath('skipped', ['to_watch']);

        $this->assertNull($this->row('to_watch'));
    }

    public function test_nothing_missing_changes_nothing(): void
    {
        Status::ensureDefaults($this->user->id, 'movie');
        // ჩემი რიგი — თავისუფლად გადალაგებული
        $this->row('watched')->forceFill(['sort_order' => 0])->save();
        $before = $this->keys();

        $this->restore()
            ->assertOk()
            ->assertJsonPath('restored', [])
            ->assertJsonPath('from_trash', [])
            ->assertJsonPath('skipped', []);

        $this->assertSame($before, $this->keys());
        $this->assertSame('watched', $before[0]);
    }

    public function test_the_default_flag_is_set_only_when_no_status_has_it(): void
    {
        Status::ensureDefaults($this->user->id, 'movie');

        // ყველა ურნაშია — ცარიელ ლექსიკონში ნაგულისხმევიც დაიკარგა
        foreach (['undecided', 'to_watch', 'watching', 'watched'] as $key) {
            $this->row($key)->moveToTrash();
        }
        $this->row('undecided')->forceFill(['is_default' => false])->save();

        $this->restore()->assertOk()->assertJsonPath('from_trash', ['undecided', 'to_watch', 'watching', 'watched']);
        $this->assertTrue($this->row('undecided')->is_default);

        // ⚠️ არჩეული ნაგულისხმევი ჩუმად არ იცვლება
        DB::table('statuses')->where('user_id', $this->user->id)->where('key', 'to_watch')->delete();
        Status::withoutGlobalScopes()->where('user_id', $this->user->id)->update(['is_default' => false]);
        $this->row('watched')->forceFill(['is_default' => true])->save();

        $this->restore()->assertOk()->assertJsonPath('restored', ['to_watch']);
        $this->assertTrue($this->row('watched')->is_default);
        $this->assertFalse($this->row('undecided')->is_default);
    }

    public function test_records_keep_their_status_and_new_ones_get_the_default(): void
    {
        Status::ensureDefaults($this->user->id, 'movie');
        $movie = Movie::withoutEvents(fn () => Movie::forceCreate(['user_id' => $this->user->id, 'status_id' => $this->row('watched')->id]));
        DB::table('statuses')->where('user_id', $this->user->id)->where('key', 'to_watch')->delete();

        $this->restore()->assertOk();

        $this->assertSame($this->row('watched')->id, (int) $movie->refresh()->status_id);
    }

    public function test_it_needs_the_create_right_and_the_module(): void
    {
        $role = Role::create([
            'key' => 'movie-viewer',
            'name_ka' => 'movie-viewer',
            'name_en' => 'movie-viewer',
            'permissions' => ['movie' => ['view']],
        ]);

        $viewer = $this->makeUser('viewer');
        $viewer->forceFill(['role_id' => $role->id])->save();

        $this->actingAs($viewer->refresh())
            ->postJson('/api/statuses/movie/restore-defaults')
            ->assertForbidden()
            ->assertExactJson(['message' => 'forbidden_permission', 'permission' => 'movie.create']);

        $nomodule = $this->makeUser('nomodule');
        $nomodule->modules()->sync([]);

        $this->actingAs($nomodule->refresh())
            ->postJson('/api/statuses/movie/restore-defaults')
            ->assertForbidden();
    }

    public function test_every_status_dictionary_can_restore(): void
    {
        foreach (['series', 'anime', 'video', 'note', 'bookmark'] as $domain) {
            Status::ensureDefaults($this->user->id, $domain);
            $first = Status::withoutGlobalScopes()->where('user_id', $this->user->id)->where('module', $domain)->orderBy('sort_order')->first();
            DB::table('statuses')->where('id', $first->id)->delete();

            $this->restore($domain)->assertOk()->assertJsonPath('restored', [$first->key]);
            $this->assertSame($first->key, $this->keys($domain)[0], "{$domain}: სიის თავში უნდა დაბრუნდეს");
        }
    }
}
