<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use App\Support\AppSettings;
use App\Support\AuditSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **წარუმატებელი შესვლა ჟურნალში** (Tasks §43.3).
 *
 * ⚠️ რა მოწმდება: არასწორი პაროლი, უცნობი სახელი და გამორთული ანგარიში
 * `login_failed`-ად იწერება — ცდილი სახელით, მიზეზით და IP-ით; პაროლი არასოდეს;
 * გამორთვისას არ იწერება; წარმატებული შესვლა ჩვეულებრივ `login`-ია.
 */
class LoginAuditTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        AppSettings::flush();

        $this->user = User::create([
            'name' => 'alice',
            'username' => 'alice',
            'email' => 'alice@example.com',
            'password' => 'correct-horse',
        ]);
        $this->user->forceFill(['is_active' => true])->save();
    }

    private function failures()
    {
        return AuditLog::query()->where('action', AuditLog::ACTION_LOGIN_FAILED)->orderBy('id');
    }

    public function test_a_wrong_password_and_an_unknown_name_are_logged_without_the_password(): void
    {
        $this->postJson('/api/auth/login', ['login' => 'alice', 'password' => 'wrong-pass-9'])->assertStatus(422);
        $this->postJson('/api/auth/login', ['login' => 'nobody', 'password' => 'wrong-pass-9'])->assertStatus(422);

        $rows = $this->failures()->get();
        $this->assertCount(2, $rows);

        $this->assertSame('alice', $rows[0]->user_label);
        $this->assertSame(['reason' => 'credentials'], $rows[0]->context);
        $this->assertSame('user', $rows[0]->subject_type);
        $this->assertSame((int) $this->user->id, (int) $rows[0]->subject_id);
        $this->assertNull($rows[0]->user_id);
        $this->assertNotNull($rows[0]->ip);

        // უცნობ სახელზე ანგარიში არ არსებობს — `subject` ცარიელია
        $this->assertSame('nobody', $rows[1]->user_label);
        $this->assertNull($rows[1]->subject_id);

        foreach ($rows as $row) {
            $this->assertStringNotContainsString('wrong-pass-9', json_encode($row->getAttributes()));
        }
    }

    public function test_a_disabled_account_is_logged_with_its_reason(): void
    {
        $this->user->forceFill(['is_active' => false])->save();

        $this->postJson('/api/auth/login', ['login' => 'alice@example.com', 'password' => 'correct-horse'])->assertStatus(422);

        $this->assertSame(['reason' => 'disabled'], $this->failures()->firstOrFail()->context);
    }

    public function test_a_success_is_a_login_and_a_disabled_kind_is_not_written(): void
    {
        $this->postJson('/api/auth/login', ['login' => 'alice', 'password' => 'correct-horse'])->assertOk();
        $this->assertSame(1, AuditLog::where('action', AuditLog::ACTION_LOGIN)->count());
        $this->assertSame(0, $this->failures()->count());

        $this->postJson('/api/auth/logout')->assertNoContent();
        AuditSettings::save(['login_failed']);

        $this->postJson('/api/auth/login', ['login' => 'alice', 'password' => 'wrong-pass-9'])->assertStatus(422);
        $this->assertSame(0, $this->failures()->count());
    }
}
