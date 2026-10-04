<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Support\AppSettings;
use App\Support\AuditSettings;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **„ჟურნალის პარამეტრები"** (Tasks §43.5).
 *
 * ⚠️ რა მოწმდება: ნაგულისხმევად ყველაფერი ჩართულია; გამორთული ტიპი არ იწერება
 * (კარიბჭე `AuditLogger`-შია, ე.ი. observer-იც ემორჩილება); ჩატის წაშლა ვერ
 * გამოირთვება; პარამეტრები მხოლოდ სუპერადმინისაა (ჟურნალის ნახვის როლსაც 403);
 * `/auth/me` SPA-ს ჩართულ ტიპებს ეუბნება.
 */
class AuditSettingsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        AppSettings::flush();

        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('alice');
        $this->admin = $this->makeUser('root');
        $this->admin->assignRole('super_admin')->save();
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::pluck('id')->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now()]])->all());

        return $user->refresh();
    }

    public function test_everything_is_on_by_default_and_chat_delete_is_protected(): void
    {
        $kinds = collect($this->actingAs($this->admin)->getJson('/api/admin/audit/settings')->assertOk()->json('data'))->keyBy('key');

        $this->assertSame(array_keys(AuditSettings::KINDS), $kinds->keys()->all());
        $this->assertTrue($kinds->every(fn ($kind) => $kind['enabled']));
        $this->assertTrue($kinds['chat_delete']['protected']);
        $this->assertFalse($kinds['click']['protected']);
    }

    public function test_a_disabled_kind_is_not_written_and_the_change_is_kept_in_app_settings(): void
    {
        $this->actingAs($this->admin)->putJson('/api/admin/audit/settings', ['off' => ['visit', 'create']])
            ->assertOk()
            ->assertJsonPath('data.4.key', 'visit')
            ->assertJsonPath('data.4.enabled', false);
        $this->assertSame(['off' => ['visit', 'create']], AppSettings::get(AuditSettings::SETTING));
        // ⚠️ თვითონ ცვლილება ჟურნალშია („ვინ გამორთო") — ის ჩაწერამდე იწერება
        $this->assertSame(1, AuditLog::where('subject_type', 'app_setting')->count());
        $from = (int) AuditLog::max('id');

        $this->actingAs($this->user)->postJson('/api/audit/visit', ['path' => '/movies'])->assertNoContent();
        // observer-იც (`create`) — ფილმის დამატება ლოგში აღარ ჩანს, რედაქტირება კი ჩვეულებრივ იწერება
        $movie = Movie::create(['year' => 2021]);
        $movie->update(['year' => 2022]);

        $after = AuditLog::where('id', '>', $from);
        $this->assertSame(0, (clone $after)->whereIn('action', [AuditLog::ACTION_VISIT, AuditLog::ACTION_CREATE])->count());
        $this->assertSame(1, (clone $after)->where('action', AuditLog::ACTION_UPDATE)->where('subject_type', 'movie')->count());

        // ყველაფერი ისევ ჩართულია — რიგი იშლება
        $this->actingAs($this->admin)->putJson('/api/admin/audit/settings', ['off' => []])->assertOk();
        $this->assertFalse(AppSettings::has(AuditSettings::SETTING));
        $this->actingAs($this->user)->postJson('/api/audit/visit', ['path' => '/books'])->assertNoContent();
        $this->assertSame(1, AuditLog::where('action', AuditLog::ACTION_VISIT)->count());
    }

    public function test_the_protected_kind_cannot_be_turned_off(): void
    {
        $this->actingAs($this->admin)->putJson('/api/admin/audit/settings', ['off' => ['chat_delete']])
            ->assertStatus(422);
        $this->actingAs($this->admin)->putJson('/api/admin/audit/settings', ['off' => ['nonsense']])
            ->assertStatus(422);

        $this->assertTrue(AuditSettings::enabled(AuditLog::ACTION_CHAT_DELETE));
    }

    public function test_only_the_super_admin_manages_the_settings(): void
    {
        $this->actingAs($this->user)->getJson('/api/admin/audit/settings')->assertForbidden();
        $this->actingAs($this->user)->putJson('/api/admin/audit/settings', ['off' => ['click']])->assertForbidden();
        $this->assertTrue(AuditSettings::enabled(AuditLog::ACTION_CLICK));
    }

    public function test_me_tells_the_spa_which_client_kinds_are_on(): void
    {
        $this->actingAs($this->user)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('data.audit_kinds', ['visit', 'refresh', 'open', 'click']);

        AuditSettings::save(['click', 'refresh'], $this->admin);

        $this->actingAs($this->user)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('data.audit_kinds', ['visit', 'open']);
    }
}
