<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **ინტერფეისის ენა ორივე მხრიდან** (Tasks GAP-12).
 *
 * ორი ნახევარია და ორივე საჭირო:
 *
 * ⚠️ **აპლიკაციის პასუხი მანქანური კოდია** — მას `lib/errors.ts` თარგმნის.
 * 25 ადგილას ეს წესი არ სრულდებოდა და პასუხი ქართული წინადადება იყო, ე.ი.
 * ინგლისურ ინტერფეისში ქართულად ჩნდებოდა. `frontend/scripts/error-codes.mjs`
 * ამას ვერ ხედავდა, რადგან მხოლოდ `snake_case`-ს ეძებდა.
 *
 * ⚠️ **Laravel-ის საკუთარი ვალიდაცია კი პირიქით** — `lang/ka`-ს არქონის გამო
 * ქართულ ინტერფეისში ინგლისურად მოდიოდა.
 */
class ApiLanguageTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        config()->set('services.tmdb.key', null);

        $this->user = User::create([
            'name' => 'lang',
            'username' => 'lang',
            'email' => 'lang@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::whereIn('key', ['movie', 'video'])->pluck('id')->all());
        $this->user->refresh();
    }

    public function test_a_missing_tmdb_key_answers_with_a_code(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/lookup/candidates', ['type' => 'movie', 'query' => 'matrix'])
            ->assertStatus(503)
            ->assertJson(['message' => 'tmdb_not_configured']);
    }

    public function test_an_empty_lookup_answers_with_a_code(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/lookup/candidates', ['type' => 'movie'])
            ->assertStatus(422)
            ->assertJson(['message' => 'lookup_query_required']);
    }

    /**
     * ⚠️ `withMessages()` კოდს **ორ ადგილას** წერს — `message`-შიც და
     * `errors`-ის ჩანთაშიც; ფორმა მეორეს კითხულობს, ამიტომ ორივე მოწმდება.
     */
    public function test_a_disabled_account_answers_with_a_code(): void
    {
        $this->user->forceFill(['is_active' => false])->save();

        $this->postJson('/api/auth/login', [
            'login' => 'lang@example.com',
            'password' => 'password',
        ])
            ->assertStatus(422)
            ->assertJsonPath('errors.login.0', 'account_disabled');
    }

    public function test_a_wrong_current_password_answers_with_a_code(): void
    {
        $this->actingAs($this->user)
            ->patchJson('/api/auth/password', [
                'current_password' => 'not-it',
                'password' => 'brand-new-password',
                'password_confirmation' => 'brand-new-password',
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.current_password.0', 'current_password_wrong');
    }

    /** ⚠️ ორივე სათაურის გარეშე შენახვა — `withValidator()`-ის შემოწმება */
    public function test_a_record_without_any_title_answers_with_a_code(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/movies', ['status' => 'x'])
            ->assertStatus(422)
            ->assertJsonPath('errors.title_en.0', 'title_required_either');
    }

    /** Laravel-ის საკუთარი ტექსტი — ქართულად, `Accept-Language: ka`-ზე */
    public function test_laravel_validation_speaks_georgian(): void
    {
        $message = $this->actingAs($this->user)
            ->withHeaders(['Accept-Language' => 'ka'])
            ->postJson('/api/video-types', [])
            ->assertStatus(422)
            ->json('errors.name_ka.0');

        $this->assertMatchesRegularExpression('/[\x{10A0}-\x{10FF}]/u', (string) $message);
    }

    /** …და ინგლისურად, `en`-ზე — თორემ ლოკალი უბრალოდ ჩაკეტილი იქნებოდა */
    public function test_laravel_validation_speaks_english_when_asked(): void
    {
        $message = $this->actingAs($this->user)
            ->withHeaders(['Accept-Language' => 'en-US,en;q=0.9'])
            ->postJson('/api/video-types', [])
            ->assertStatus(422)
            ->json('errors.name_ka.0');

        $this->assertDoesNotMatchRegularExpression('/[\x{10A0}-\x{10FF}]/u', (string) $message);
    }

    /**
     * ⚠️ უცნობი ენა **ნაგულისხმევს ტოვებს** და არა `lang/<თვითნებური>`-ს:
     * `App::setLocale()`-ში მოხვედრილი სტრიქონი საქაღალდის ძებნაა.
     */
    public function test_an_unknown_language_falls_back(): void
    {
        $message = $this->actingAs($this->user)
            ->withHeaders(['Accept-Language' => 'zz-ZZ'])
            ->postJson('/api/video-types', [])
            ->assertStatus(422)
            ->json('errors.name_ka.0');

        $this->assertDoesNotMatchRegularExpression('/[\x{10A0}-\x{10FF}]/u', (string) $message);
    }
}
