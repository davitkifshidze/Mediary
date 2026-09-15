<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * **ავტორიზაცია (აუდიტი 2026-09-14, §D).**
 *
 * ⚠️ **პროექტს 456 ტესტი ჰქონდა და ეს კონტროლერი დაფარული არ იყო.** ის
 * ყველაზე უსაფრთხოებრივად კრიტიკულია — „პირველი ანგარიში super_admin-ია",
 * „გათიშული ვერ შედის", „ცარიელი `profile_visibility` არ ცვლის" — და
 * არცერთ წესს არაფერი იცავდა.
 *
 * ⚠️ **ტესტი ორი გამოსწორების შემდეგ გახდა შესაძლებელი:** სანამ
 * `AuthController::regenerateSession()` გაჩნდებოდა, `postJson()`-ით მოსული
 * (არა-stateful) რექვესთი `/auth/register`-ზე **ყოველთვის 500-ს** აბრუნებდა.
 *
 * ⚠️ **`throttle:login` 5 მცდელობას უშვებს წუთში.** ჭერი თითო ტესტზე
 * ნულდება (`CACHE_STORE=array` + ახალი აპლიკაცია), ე.ი. ერთ მეთოდში
 * ხუთზე მეტი მცდელობა 429-ს მოიტანს — ამიტომ ტესტები წვრილადაა დაშლილი.
 */
class AuthTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'secret-password';

    private function payload(string $name, array $extra = []): array
    {
        return [
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => self::PASSWORD,
            'password_confirmation' => self::PASSWORD,
            ...$extra,
        ];
    }

    /**
     * ⚠️ **`$extra` `forceFill`-ით იწერება და არა `create()`-ით.** `User`-ს
     * Laravel 13-ის `#[Fillable]` ატრიბუტი აქვს და მასში მხოლოდ
     * `name`/`first_name`/`last_name`/`username`/`email`/`password` წერია —
     * ე.ი. `is_active` და `profile_visibility` მასობრივი შევსებით **ჩუმად
     * იკარგება** და ტესტი სულ სხვას ამოწმებდა, ვიდრე ეგონა.
     */
    private function makeUser(string $name, array $extra = []): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => Hash::make(self::PASSWORD),
        ]);

        if ($extra) {
            $user->forceFill($extra)->save();
        }

        return $user;
    }

    /* ================= რეგისტრაცია ================= */

    /**
     * **პირველი ანგარიში super_admin-ია** (bootstrap) — მის გარეშე ახალ
     * ინსტალაციაზე ადმინი საერთოდ არ იარსებებდა.
     */
    public function test_the_first_account_becomes_a_super_admin(): void
    {
        $this->postJson('/api/auth/register', $this->payload('first'))
            ->assertStatus(201)
            ->assertJsonPath('data.username', 'first');

        $this->assertTrue(User::first()->isSuperAdmin());
        $this->assertTrue(User::first()->is_active);
    }

    /**
     * **მეორე ანგარიში ჩვეულებრივია და ცარიელი.**
     *
     * ⚠️ ეს პროექტის ცხადი წესია: რეგისტრაცია ღიაა, მაგრამ მოდულებს
     * ადმინი რთავს (`enabled_by_default` დღეს არცერთს არ აქვს, ე.ი.
     * ახალ ანგარიშს **ნული** მოდული უნდა ჰქონდეს).
     */
    public function test_the_second_account_is_an_ordinary_user_with_only_default_modules(): void
    {
        $this->seed(ModulesSeeder::class);

        $this->postJson('/api/auth/register', $this->payload('first'))->assertStatus(201);
        $this->postJson('/api/auth/register', $this->payload('second'))->assertStatus(201);

        $second = User::where('username', 'second')->first();

        $this->assertFalse($second->isSuperAdmin());
        $this->assertSame('user', $second->roleKey());
        $this->assertSame(
            Module::where('is_active', true)->where('enabled_by_default', true)->count(),
            $second->modules()->count(),
        );
    }

    /** ⚠️ **პირველ ანგარიშს ყველა აქტიური მოდული ეძლევა** — bootstrap-ის წესი */
    public function test_the_first_account_gets_every_active_module(): void
    {
        $this->seed(ModulesSeeder::class);

        $this->postJson('/api/auth/register', $this->payload('first'))->assertStatus(201);

        $this->assertSame(
            Module::where('is_active', true)->count(),
            User::first()->modules()->count(),
        );
    }

    public function test_username_and_email_must_be_unique(): void
    {
        $this->makeUser('taken');

        $this->postJson('/api/auth/register', $this->payload('taken'))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['username', 'email']);
    }

    /** ⚠️ `alpha_dash` — username მისამართებში ხვდება (`/u/{username}`) */
    public function test_a_username_with_spaces_is_rejected(): void
    {
        $this->postJson('/api/auth/register', $this->payload('ok', ['username' => 'two words']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['username']);
    }

    public function test_the_password_must_be_confirmed_and_long_enough(): void
    {
        $this->postJson('/api/auth/register', $this->payload('a', [
            'password' => 'short',
            'password_confirmation' => 'short',
        ]))->assertStatus(422)->assertJsonValidationErrors(['password']);

        $this->postJson('/api/auth/register', $this->payload('b', [
            'password_confirmation' => 'something-else',
        ]))->assertStatus(422)->assertJsonValidationErrors(['password']);
    }

    /** ⚠️ **403 და მანქანური კოდი** — ფრონტს გასარჩევი პასუხი სჭირდება */
    public function test_registration_can_be_switched_off(): void
    {
        config(['mediary.allow_registration' => false]);

        $this->postJson('/api/auth/register', $this->payload('nope'))
            ->assertStatus(403)
            ->assertJson(['message' => 'registration_disabled']);

        $this->assertSame(0, User::count());
    }

    /* ================= შესვლა ================= */

    public function test_login_works_with_the_username(): void
    {
        $this->makeUser('alice');

        $this->postJson('/api/auth/login', ['login' => 'alice', 'password' => self::PASSWORD])
            ->assertOk()
            ->assertJsonPath('data.username', 'alice');
    }

    /** ⚠️ ერთი ველი ორივესთვის — `filter_var()` წყვეტს, email-ია თუ username */
    public function test_login_works_with_the_email(): void
    {
        $this->makeUser('alice');

        $this->postJson('/api/auth/login', ['login' => 'alice@example.com', 'password' => self::PASSWORD])
            ->assertOk()
            ->assertJsonPath('data.username', 'alice');
    }

    public function test_a_wrong_password_is_a_validation_error(): void
    {
        $this->makeUser('alice');

        $this->postJson('/api/auth/login', ['login' => 'alice', 'password' => 'nope'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['login']);
    }

    /**
     * **გათიშული ანგარიში ვერ შედის** — ადმინის „გათიშვა" სწორედ ამას უნდა
     * ნიშნავდეს, თორემ ღილაკი არაფერს აკეთებდა.
     */
    public function test_a_disabled_account_cannot_log_in(): void
    {
        $this->makeUser('alice', ['is_active' => false]);

        $this->postJson('/api/auth/login', ['login' => 'alice', 'password' => self::PASSWORD])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['login']);

        // ⚠️ და სესია არ რჩება — `Auth::logout()` ცხადად იძახება
        $this->assertGuest();
    }

    public function test_me_requires_a_session(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_me_returns_the_current_user_with_modules_and_role(): void
    {
        $this->seed(ModulesSeeder::class);
        $user = $this->makeUser('alice');
        $user->modules()->sync(Module::where('key', 'movie')->pluck('id')->all());

        $this->actingAs($user)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('data.username', 'alice')
            /* ⚠️ `role` რესურსში **სტრიქონია** (`roleKey()`) და არა ობიექტი —
               ძველი `users.role` enum-ის თავსებადობა (Tasks 1.6). */
            ->assertJsonPath('data.role', 'user')
            ->assertJsonCount(1, 'data.modules');
    }

    public function test_logout_answers_no_content(): void
    {
        $this->actingAs($this->makeUser('alice'))
            ->postJson('/api/auth/logout')
            ->assertNoContent();
    }

    /* ================= პროფილი ================= */

    public function test_the_profile_can_be_updated(): void
    {
        $user = $this->makeUser('alice');

        $this->actingAs($user)->patchJson('/api/auth/profile', [
            'name' => 'ალისი',
            'bio' => 'ფილმების კატალოგი',
        ])->assertOk()->assertJsonPath('data.name', 'ალისი');

        $this->assertSame('ფილმების კატალოგი', $user->refresh()->bio);
    }

    /**
     * ⚠️ **ცარიელი `profile_visibility` „არ შეცვალო"-ს ნიშნავს და არა
     * `private`-ს.** ფორმა multipart-ია და ველი შეიძლება საერთოდ არ მოვიდეს —
     * ჩუმად `private`-ზე დაბრუნება საჯარო პროფილს გამორთავდა.
     */
    public function test_an_empty_visibility_does_not_reset_it(): void
    {
        $user = $this->makeUser('alice', ['profile_visibility' => 'public']);

        $this->actingAs($user)->patchJson('/api/auth/profile', ['name' => 'ალისი'])->assertOk();
        $this->assertSame('public', $user->refresh()->profile_visibility);

        $this->actingAs($user)->patchJson('/api/auth/profile', ['profile_visibility' => ''])->assertOk();
        $this->assertSame('public', $user->refresh()->profile_visibility);

        // ცხადი მნიშვნელობა კი მუშაობს
        $this->actingAs($user)->patchJson('/api/auth/profile', ['profile_visibility' => 'private'])->assertOk();
        $this->assertSame('private', $user->refresh()->profile_visibility);
    }

    public function test_another_users_username_cannot_be_taken(): void
    {
        $this->makeUser('bob');
        $alice = $this->makeUser('alice');

        $this->actingAs($alice)->patchJson('/api/auth/profile', ['username' => 'bob'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['username']);
    }

    /** ⚠️ საკუთარი username-ის ხელახლა გაგზავნა **არ** უნდა იყოს კონფლიქტი */
    public function test_keeping_your_own_username_is_not_a_conflict(): void
    {
        $alice = $this->makeUser('alice');

        $this->actingAs($alice)->patchJson('/api/auth/profile', ['username' => 'alice'])->assertOk();
    }

    /* ================= პაროლი ================= */

    public function test_changing_the_password_requires_the_current_one(): void
    {
        $user = $this->makeUser('alice');

        $this->actingAs($user)->patchJson('/api/auth/password', [
            'current_password' => 'wrong',
            'password' => 'brand-new-password',
            'password_confirmation' => 'brand-new-password',
        ])->assertStatus(422)->assertJsonValidationErrors(['current_password']);

        $this->assertTrue(Hash::check(self::PASSWORD, $user->refresh()->password));
    }

    public function test_the_password_really_changes(): void
    {
        $user = $this->makeUser('alice');

        $this->actingAs($user)->patchJson('/api/auth/password', [
            'current_password' => self::PASSWORD,
            'password' => 'brand-new-password',
            'password_confirmation' => 'brand-new-password',
        ])->assertNoContent();

        $this->assertTrue(Hash::check('brand-new-password', $user->refresh()->password));
    }

    /* ================= პარამეტრები ================= */

    /**
     * ⚠️ `settings` **`fillable`-ში არ არის** (მასობრივი შევსება არ გვინდა) —
     * კონტროლერი `forceFill`-ს იძახებს. ტესტი სწორედ ამ გზას იცავს.
     */
    public function test_settings_are_stored_on_the_account(): void
    {
        $user = $this->makeUser('alice');

        $this->actingAs($user)->putJson('/api/auth/settings', [
            'settings' => ['contentLang' => 'ka', 'cardSize' => 'lg'],
        ])->assertOk()->assertJsonPath('settings.contentLang', 'ka');

        $this->assertSame('lg', $user->refresh()->settings['cardSize']);
    }

    public function test_settings_must_be_an_array(): void
    {
        $this->actingAs($this->makeUser('alice'))
            ->putJson('/api/auth/settings', ['settings' => 'ka'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['settings']);
    }
}
