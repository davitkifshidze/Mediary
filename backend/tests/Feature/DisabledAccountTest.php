<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * **გათიშული ანგარიში ღია სესიით ვეღარ მუშაობს.**
 *
 * ⚠️ აქამდე `is_active` მხოლოდ შესვლისას მოწმდებოდა — გათიშვის შემდეგ ძველი ქუქი სრულ წვდომას ინარჩუნებდა.
 */
class DisabledAccountTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $name): User
    {
        return User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
    }

    public function test_a_disabled_account_is_signed_out_on_its_next_request(): void
    {
        $admin = $this->makeUser('root');
        $admin->assignRole('super_admin')->save();
        $nino = $this->makeUser('nino');

        $this->actingAs($nino)->getJson('/api/auth/me')->assertOk();

        // ცოცხალი დრაივერი `database`-ია (ტესტებში — `array`)
        config(['session.driver' => 'database']);
        DB::table('sessions')->insert(['id' => 'nino-session', 'user_id' => $nino->id, 'payload' => '', 'last_activity' => time()]);
        $token = $nino->remember_token;

        Auth::forgetGuards();
        $this->actingAs($admin->refresh())->patchJson("/api/admin/users/{$nino->id}", ['is_active' => false])->assertOk();

        // ყველა მოწყობილობის სესია და „დამიმახსოვრე" ქრება
        $this->assertSame(0, DB::table('sessions')->where('user_id', $nino->id)->count());
        $this->assertNotSame($token, $nino->fresh()->remember_token);

        Auth::forgetGuards();
        $this->actingAs($nino->fresh())->getJson('/api/auth/me')->assertUnauthorized()->assertJson(['message' => 'account_disabled']);
    }
}
