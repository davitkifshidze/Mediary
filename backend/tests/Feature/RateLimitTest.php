<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Movie;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **მოთხოვნების ჭერი და სინქრონის უფლება**.
 *
 * ორივე პრობლემა ერთ ფაილშია, რადგან ორივე ერთი და იმავე ტიპისაა:
 * **მარშრუტს არასწორი (ან არარსებული) დამცველი ჰქონდა** და ამას არაფერი
 * ამოწმებდა. ორივე ჩუმად ტყდებოდა.
 *
 * ⚠️ **ჭერის მდგომარეობა ტესტებს შორის თავისით იწმინდება**: `CACHE_STORE`
 * `array`-ია (`phpunit.xml`), ხოლო Laravel თითო ტესტზე ახალ აპლიკაციას
 * აწყობს — ე.ი. ერთი ტესტის 5 მცდელობა მეორეს არ გადაება.
 */
class RateLimitTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
    }

    private function makeUser(string $name, array $modules = ['movie']): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);

        $ids = Module::whereIn('key', $modules)
            ->pluck('id')
            ->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now()]])
            ->all();
        $user->modules()->sync($ids);

        return $user->refresh();
    }

    /* ================= ავტორიზაციის ჭერი ================= */

    /**
     * **პაროლის ბრუტფორსი უნდა ჩერდებოდეს.**
     *
     * აქამდე `throttle` პროექტში საერთოდ არ იყო, ე.ი. მცდელობების რაოდენობა
     * შეუზღუდავი იყო — ღია რეგისტრაციის პირობებში ეს ერთადერთი დამცველია
     * სუსტ პაროლსა და თავდამსხმელს შორის.
     */
    public function test_login_is_rate_limited_after_five_attempts(): void
    {
        $this->makeUser('alice');

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', [
                'login' => 'alice',
                'password' => 'wrong-password',
            ])->assertStatus(422);
        }

        // მეექვსე უკვე ჭერშია — და **სწორი პაროლიც** აღარ გადის
        $this->postJson('/api/auth/login', [
            'login' => 'alice',
            'password' => 'password',
        ])->assertStatus(429);
    }

    /**
     * ⚠️ **ჭერი login-ზეც იჭრება და არა მარტო IP-ზე.** ერთი პაროლის
     * ბევრ ანგარიშზე მორგება (credential stuffing) IP-ის მრიცხველს
     * ერთნაირად ხარჯავს, მაგრამ ცალკე ანგარიშის მრიცხველიც უნდა არსებობდეს —
     * თორემ პროქსიების როტაცია მთელ დაცვას გვერდს აუვლიდა.
     */
    public function test_the_login_limiter_also_keys_on_the_submitted_login(): void
    {
        $this->makeUser('alice');

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['login' => 'alice', 'password' => 'nope'])
                ->assertStatus(422);
        }

        // იმავე IP-იდან სხვა ანგარიშზე — IP-ის ჭერიც ამოწურულია
        $this->postJson('/api/auth/login', ['login' => 'bob', 'password' => 'nope'])
            ->assertStatus(429);
    }

    /**
     * რეგისტრაციასაც იგივე ჭერი აქვს — ანგარიშების მასობრივი შექმნა.
     *
     * ⚠️ **ეს ტესტი თავისთავად აფიქსირებს მეორე ხარვეზსაც:** სანამ
     * `AuthController::regenerateSession()` გაჩნდებოდა, `register()`
     * `$request->session()`-ს დაცვის გარეშე იძახებდა და ტესტიდან მოსული
     * (არა-stateful) რექვესთი **ყოველთვის 500-ს** აბრუნებდა. სწორედ ეს
     * აფერხებდა ავტორიზაციის ტესტის დაწერას საერთოდ.
     */
    public function test_registration_is_rate_limited(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/register', [
                'name' => "user{$i}",
                'username' => "user{$i}",
                'email' => "user{$i}@example.com",
                'password' => 'password123',
                'password_confirmation' => 'password123',
            ])->assertStatus(201);
        }

        $this->postJson('/api/auth/register', [
            'name' => 'user6',
            'username' => 'user6',
            'email' => 'user6@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])->assertStatus(429);
    }

    /**
     * ⚠️ **ცარიელი `login` საერთო კალათს აღარ ქმნის.** რეგისტრაცია და პაროლის
     * აღდგენა `login` ველს არ აგზავნის — ადრე ყველა კლიენტი ერთ `login-id:`
     * კალათს იზიარებდა და ერთი ანონიმი ყველას უბლოკავდა.
     */
    public function test_one_client_does_not_block_registration_and_reset_for_everyone(): void
    {
        $register = fn (string $name, string $ip) => $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->postJson('/api/auth/register', [
                'name' => $name, 'username' => $name, 'email' => "{$name}@example.com",
                'password' => 'password123', 'password_confirmation' => 'password123',
            ]);

        // პირველი კლიენტი თავის ჭერს ხარჯავს — უცნობ აღდგენის ბმულებზეც
        for ($i = 0; $i < 5; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.1'])->getJson("/api/auth/reset/bogus{$i}");
        }
        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.1'])->getJson('/api/auth/reset/bogus9')->assertStatus(429);

        // მეორე კლიენტი — სხვა IP — ჩვეულებრივ რეგისტრირდება და აღდგენას ხსნის
        $register('stranger', '10.0.0.2')->assertCreated();
        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.3'])->getJson('/api/auth/reset/another')->assertStatus(410);
    }

    /**
     * ⚠️ **ანგარიშის პაროლის შემოწმებას საკუთარი ჭერი აქვს** — გახსნილ ტაბთან
     * მისულს გლობალური 600 წუთში პაროლის მორგებას აძლევდა.
     */
    public function test_account_password_checks_have_their_own_limit(): void
    {
        $alice = $this->makeUser('alice');

        for ($i = 0; $i < 10; $i++) {
            $this->actingAs($alice)->patchJson('/api/auth/password', [
                'current_password' => "wrong{$i}", 'password' => 'newpassword1', 'password_confirmation' => 'newpassword1',
            ])->assertStatus(422);
        }

        $this->actingAs($alice)->patchJson('/api/auth/password', [
            'current_password' => 'password', 'password' => 'newpassword1', 'password_confirmation' => 'newpassword1',
        ])->assertStatus(429);

        // ერთი კალათია ოთხივე კარზე
        $this->actingAs($alice)->deleteJson('/api/auth/2fa', ['password' => 'password'])->assertStatus(429);
        $this->actingAs($alice)->postJson('/api/auth/2fa', ['password' => 'password'])->assertStatus(429);
        $this->actingAs($alice)->postJson('/api/auth/2fa/recovery-codes', ['password' => 'password'])->assertStatus(429);
    }

    /**
     * ⚠️ **ჩვეულებრივი მუშაობა ჭერს არ ხვდება.** SPA-ს რიგი
     * (`ui/queue.tsx`) ჩანაწერებს 200 ms-იანი პაუზით აგზავნის, ე.ი.
     * ნორმალური სინქრონი წუთში ~300 მოთხოვნაა. გლობალური ჭერი სწორედ
     * ამიტომაა 600 — თუ ის ოდესმე დაბლა ჩამოვა, ეს ტესტი გაფრთხილებს.
     */
    public function test_ordinary_browsing_is_not_throttled(): void
    {
        $alice = $this->makeUser('alice');

        for ($i = 0; $i < 40; $i++) {
            $this->actingAs($alice)->getJson('/api/movies')->assertOk();
        }
    }

    /* ================= სინქრონის უფლება ================= */

    private function roleWith(array $actions): Role
    {
        return Role::create([
            'key' => 'r-'.implode('-', $actions ?: ['none']),
            'name_ka' => 'ტესტი',
            'name_en' => 'Test',
            'permissions' => ['movie' => $actions],
        ]);
    }

    /**
     * **მთავარი წესი:** `POST /media/sync/{type}/{id}` **არსებულ ჩანაწერს
     * ცვლის**, ე.ი. `update` სჭირდება და არა `create`.
     *
     * ⚠️ აქამდე მარშრუტი `permission:@type`-ის ქვეშ იდგა მოქმედების გარეშე,
     * ხოლო `EnsureModulePermission` მას POST-იდან **`create`**-ს უყვანდა
     * (ბოლო სეგმენტი რიცხვია, ე.ი. `UPDATE_ENDPOINTS`-ის ცნობაც არ
     * მუშაობდა). შედეგად „ვქმნი, მაგრამ არ ვცვლი" როლს შეეძლო არსებული
     * ჩანაწერის სათაურის, აღწერის, პოსტერის, ჟანრებისა და მსახიობების
     * გადაწერა.
     */
    public function test_sync_requires_update_and_not_create(): void
    {
        $alice = $this->makeUser('alice');
        $movie = Movie::create(['user_id' => $alice->id, 'year' => 2020]);

        // მხოლოდ `create` — სინქრონი **აკრძალული** უნდა იყოს
        $alice->forceFill(['role_id' => $this->roleWith(['view', 'create'])->id])->save();

        $this->actingAs($alice->refresh())
            ->postJson("/api/media/sync/movie/{$movie->id}", ['fields' => ['title']])
            ->assertStatus(403)
            ->assertJsonPath('permission', 'movie.update');
    }

    /**
     * მეორე მიმართულება: „ვცვლი, მაგრამ არ ვქმნი" როლი **არ** უნდა
     * იღებდეს ცრუ 403-ს — ზუსტად ის ხაფანგი, რომელსაც `/translations`
     * და `/media/cast/…` უკვე არიდებენ.
     */
    public function test_update_permission_is_enough_for_sync(): void
    {
        $alice = $this->makeUser('alice');
        $movie = Movie::create(['user_id' => $alice->id, 'year' => 2020]);

        $alice->forceFill(['role_id' => $this->roleWith(['view', 'update'])->id])->save();

        // ⚠️ გასაღები **ცხადად** იწერება: მის გარეშე მარშრუტი უფლებამდე
        // საერთოდ ვერ აღწევს — `MediaSyncController::item()` ჯერ
        // `configured()`-ს კითხულობს და `credential_missing`-ს აბრუნებს. ჩანაწერს
        // `tmdb_id` არ აქვს, ე.ი. სინქრონი ისედაც ვერაფერს მოიტანს; მნიშვნელოვანი
        // ისაა, რომ **უფლების** კარიბჭე გაიარა (403 არაა).
        $this->fakeTmdb($alice);

        $this->actingAs($alice->refresh())
            ->postJson("/api/media/sync/movie/{$movie->id}", ['fields' => ['title']])
            ->assertStatus(200);
    }

    /**
     * `/lookup` და `/discover` მხოლოდ **კითხულობენ** (TMDB-ს ეკითხებიან და
     * არაფერს ინახავენ), ე.ი. `view` საკმარისი უნდა იყოს — აქამდე ისინი
     * `create`-ს ითხოვდნენ და მხოლოდ-მკითხველი როლი ვერაფერს ეძებდა.
     */
    public function test_lookup_only_needs_view(): void
    {
        $alice = $this->makeUser('alice');
        $alice->forceFill(['role_id' => $this->roleWith(['view'])->id])->save();

        $this->fakeTmdb($alice);

        $this->actingAs($alice->refresh())
            ->postJson('/api/lookup/candidates', ['type' => 'movie', 'query' => 'matrix'])
            ->assertStatus(200);
    }

    /**
     * TMDB — გასაღები და ცარიელი პასუხი.
     *
     * ⚠️ **ორივე ნაწილი აუცილებელია და ორივე ხარვეზი აქ იყო.** გასაღების
     * გარეშე ორივე მარშრუტი `credential_missing`-ს აბრუნებს, ე.ი. ტესტი
     * უფლებას კი არა, კონფიგურაციას ამოწმებდა; `Http::fake()`-ის გარეშე კი
     * გასაღებიან მანქანაზე ტესტი ნამდვილ ქსელურ ზარს აკეთებდა (`?query=matrix`).
     * პასუხი შეგნებულად ცარიელია — შიგთავსი ამ ფაილს არ ეხება.
     * ⚠️ გასაღები **მომხმარებლისაა**, ამიტომ ვის სახელითაც ტესტი
     * მუშაობს, მას ეძლევა.
     */
    private function fakeTmdb(User $user): void
    {
        $this->giveCredential($user, 'tmdb');

        Http::fake([
            'api.themoviedb.org/*' => Http::response(['results' => [], 'cast' => []]),
        ]);
    }
}
