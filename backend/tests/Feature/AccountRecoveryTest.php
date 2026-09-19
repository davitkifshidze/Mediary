<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Support\ResetLink;
use App\Support\Totp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * **ანგარიშის აღდგენა და მეორე ფაქტორი (FEAT-16).**
 *
 * ⚠️ **`throttle:login` წუთში 5 მცდელობას უშვებს** და აღდგენის წყვილიც
 * იმავე ჭერის უკანაა — ამიტომ ტესტები წვრილადაა დაშლილი (`AuthTest`-ის
 * იგივე წესი).
 */
class AccountRecoveryTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'secret-password';

    private function makeUser(string $name, array $extra = []): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => Hash::make(self::PASSWORD),
        ]);

        $user->forceFill(['is_active' => true, ...$extra])->save();

        return $user;
    }

    private function admin(): User
    {
        return tap($this->makeUser('root'), fn (User $u) => $u->assignRole('super_admin')->save());
    }

    /* ================= ადმინის ბმული ================= */

    public function test_an_admin_issues_a_one_time_link_and_the_token_is_stored_hashed(): void
    {
        $admin = $this->admin();
        $user = $this->makeUser('lost');

        $res = $this->actingAs($admin)
            ->postJson("/api/admin/users/{$user->id}/reset-link")
            ->assertOk()
            ->assertJsonStructure(['url', 'expires_at', 'hours']);

        $token = str($res->json('url'))->afterLast('/')->toString();
        $this->assertNotSame('', $token);

        /* ⚠️ ეს ტესტის მთავარი მტკიცებაა: ცხრილში ნედლი ტოკენი **არ** დევს.
           მისი წაკითხვა სხვის ანგარიშში შესვლის საშუალებას არ უნდა იძლეოდეს. */
        $row = DB::table('password_reset_tokens')->where('email', $user->email)->first();
        $this->assertNotNull($row);
        $this->assertNotSame($token, $row->token);
        $this->assertSame(hash('sha256', $token), $row->token);
    }

    public function test_a_used_link_is_gone_and_answers_410(): void
    {
        $user = $this->makeUser('lost');
        $token = ResetLink::issue($user);

        $this->getJson("/api/auth/reset/{$token}")
            ->assertOk()
            ->assertJsonPath('username', 'lost')
            // ⚠️ ელფოსტა პასუხში არ გადის — ბმული შეიძლება სხვის ხელში იყოს
            ->assertJsonMissingPath('email');

        $this->postJson("/api/auth/reset/{$token}", [
            'password' => 'brand-new-password',
            'password_confirmation' => 'brand-new-password',
        ])->assertNoContent();

        $this->assertTrue(Hash::check('brand-new-password', $user->fresh()->password));

        // ერთჯერადობა
        $this->getJson("/api/auth/reset/{$token}")->assertStatus(410);
        $this->postJson("/api/auth/reset/{$token}", [
            'password' => 'another-password',
            'password_confirmation' => 'another-password',
        ])->assertStatus(410);
    }

    public function test_an_expired_link_answers_410(): void
    {
        $user = $this->makeUser('lost');
        $token = ResetLink::issue($user);

        Carbon::setTestNow(now()->addHours(ResetLink::HOURS + 1));

        $this->getJson("/api/auth/reset/{$token}")->assertStatus(410);

        Carbon::setTestNow();
    }

    /**
     * ⚠️ SEC-02-ის იგივე კარი: `admin:users`-ის მქონე ადმინი სუპერ-ადმინის
     * ბმულს ვერ გასცემს — თორემ ერთი მოთხოვნით მის ანგარიშს იღებდა.
     */
    public function test_an_admin_cannot_issue_a_link_for_someone_above_them(): void
    {
        $role = Role::create([
            'key' => 'user-admin',
            'name_ka' => 'მომხმარებლების ადმინი',
            'name_en' => 'User admin',
            'permissions' => ['admin:users' => ['view', 'update', 'delete']],
        ]);

        $actor = $this->makeUser('helper');
        $actor->forceFill(['role_id' => $role->id])->save();

        $target = $this->admin();

        $this->actingAs($actor)
            ->postJson("/api/admin/users/{$target->id}/reset-link")
            ->assertStatus(403)
            ->assertJsonPath('message', 'role_escalation');

        $this->assertDatabaseCount('password_reset_tokens', 0);
    }

    /** პაროლის ხელით შეცვლა გაცემულ ბმულს კლავს */
    public function test_changing_the_password_kills_an_outstanding_link(): void
    {
        $user = $this->makeUser('lost');
        $token = ResetLink::issue($user);

        $this->actingAs($user)->patchJson('/api/auth/password', [
            'current_password' => self::PASSWORD,
            'password' => 'chosen-by-me-now',
            'password_confirmation' => 'chosen-by-me-now',
        ])->assertNoContent();

        $this->getJson("/api/auth/reset/{$token}")->assertStatus(410);
    }

    /* ================= TOTP ================= */

    /**
     * **RFC 6238-ის საკუთარი ტესტ-ვექტორები** (Appendix B, SHA-1).
     *
     * ⚠️ ალგორითმი ხელით დაიწერა ბიბლიოთეკის ნაცვლად, ე.ი. ერთადერთი
     * გამართლება სწორედ ესაა: სტანდარტი თვითონ ამბობს, რა უნდა გამოვიდეს.
     */
    public function test_the_rfc_test_vectors(): void
    {
        // base32("12345678901234567890")
        $secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

        // RFC 4226 — HOTP, მრიცხველი 0
        $this->assertSame('755224', Totp::at($secret, 0));

        // RFC 6238 — T = 59 · 1111111109 · 1111111111 · 1234567890 · 2000000000
        $this->assertSame('287082', Totp::at($secret, intdiv(59, 30)));
        $this->assertSame('081804', Totp::at($secret, intdiv(1111111109, 30)));
        $this->assertSame('050471', Totp::at($secret, intdiv(1111111111, 30)));
        $this->assertSame('005924', Totp::at($secret, intdiv(1234567890, 30)));
        $this->assertSame('279037', Totp::at($secret, intdiv(2000000000, 30)));
    }

    public function test_the_window_accepts_a_neighbouring_step_but_not_a_distant_one(): void
    {
        $secret = Totp::secret();
        $now = 1_700_000_000;

        $this->assertTrue(Totp::verify($secret, Totp::at($secret, intdiv($now, 30)), $now));
        $this->assertTrue(Totp::verify($secret, Totp::at($secret, intdiv($now, 30) - 1), $now));
        $this->assertFalse(Totp::verify($secret, Totp::at($secret, intdiv($now, 30) - 3), $now));
        $this->assertFalse(Totp::verify($secret, '000', $now));
    }

    /** ჩართვა ორნაბიჯიანია და შუალედში შესვლა ჯერ კოდს არ ითხოვს */
    public function test_two_factor_only_starts_working_after_it_is_confirmed(): void
    {
        $user = $this->makeUser('careful');

        $secret = $this->actingAs($user)
            ->postJson('/api/auth/2fa', ['password' => self::PASSWORD])
            ->assertOk()
            ->json('secret');

        $this->assertFalse($user->fresh()->hasTwoFactor());

        // დაუდასტურებელზე ჩვეულებრივი შესვლა მუშაობს
        $this->postJson('/api/auth/login', ['login' => 'careful', 'password' => self::PASSWORD])
            ->assertOk();

        $codes = $this->actingAs($user)
            ->postJson('/api/auth/2fa/confirm', ['code' => Totp::at($secret, intdiv(time(), 30))])
            ->assertOk()
            ->json('recovery_codes');

        $this->assertCount(8, $codes);
        $this->assertTrue($user->fresh()->hasTwoFactor());
    }

    public function test_a_password_alone_does_not_get_into_a_two_factor_account(): void
    {
        $secret = Totp::secret();
        $user = $this->makeUser('guarded', [
            'two_factor_secret' => $secret,
            'two_factor_confirmed_at' => now(),
            'two_factor_recovery_codes' => ['AAAAA-BBBBB'],
        ]);

        $this->postJson('/api/auth/login', ['login' => 'guarded', 'password' => self::PASSWORD])
            ->assertStatus(409)
            ->assertJsonPath('message', 'two_factor_required');

        $this->assertGuest();

        $this->postJson('/api/auth/login', [
            'login' => 'guarded', 'password' => self::PASSWORD, 'code' => '000000',
        ])->assertStatus(422)->assertJsonPath('message', 'two_factor_code_invalid');

        $this->assertGuest();

        $this->postJson('/api/auth/login', [
            'login' => 'guarded',
            'password' => self::PASSWORD,
            'code' => Totp::at($secret, intdiv(time(), 30)),
        ])->assertOk();

        $this->assertAuthenticatedAs($user);
    }

    public function test_a_recovery_code_works_exactly_once(): void
    {
        $user = $this->makeUser('guarded', [
            'two_factor_secret' => Totp::secret(),
            'two_factor_confirmed_at' => now(),
            'two_factor_recovery_codes' => ['AAAAA-BBBBB', 'CCCCC-DDDDD'],
        ]);

        $this->postJson('/api/auth/login', [
            'login' => 'guarded', 'password' => self::PASSWORD, 'code' => 'AAAAA-BBBBB',
        ])->assertOk();

        $this->assertSame(['CCCCC-DDDDD'], $user->fresh()->two_factor_recovery_codes);

        $this->post('/api/auth/logout');

        $this->postJson('/api/auth/login', [
            'login' => 'guarded', 'password' => self::PASSWORD, 'code' => 'AAAAA-BBBBB',
        ])->assertStatus(422);
    }

    /** გამორთვა პაროლის გარეშე არ ხდება — გახსნილი ტაბი არ კმარა */
    public function test_disabling_two_factor_needs_the_account_password(): void
    {
        $user = $this->makeUser('guarded', [
            'two_factor_secret' => Totp::secret(),
            'two_factor_confirmed_at' => now(),
        ]);

        $this->actingAs($user)->deleteJson('/api/auth/2fa', ['password' => 'wrong-one'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'current_password_wrong');

        $this->assertTrue($user->fresh()->hasTwoFactor());

        $this->actingAs($user)->deleteJson('/api/auth/2fa', ['password' => self::PASSWORD])
            ->assertOk();

        $this->assertFalse($user->fresh()->hasTwoFactor());
    }

    /** საიდუმლო და კოდები არც `/auth/me`-ში და არც ადმინის სიაში არ გადის */
    public function test_the_secret_never_leaves_through_a_user_payload(): void
    {
        $secret = Totp::secret();
        $user = $this->makeUser('guarded', [
            'two_factor_secret' => $secret,
            'two_factor_confirmed_at' => now(),
            'two_factor_recovery_codes' => ['AAAAA-BBBBB'],
        ]);

        $body = $this->actingAs($user)->getJson('/api/auth/me')->assertOk()->content();

        $this->assertStringNotContainsString($secret, $body);
        $this->assertStringNotContainsString('AAAAA-BBBBB', $body);
        $this->assertTrue($this->actingAs($user)->getJson('/api/auth/me')->json('data.two_factor_enabled'));
    }
}
