<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Module;
use App\Models\TranslationUsage;
use App\Models\User;
use App\Models\UserCredential;
use App\Services\Credentials\CredentialStore;
use App\Services\Notes\NoteChannelSettings;
use App\Services\Translation\Translator;
use App\Support\CredentialProviders;
use Database\Seeders\ModulesSeeder;
use Illuminate\Encryption\Encrypter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * Tasks §21 → §30 — „მონაცემები": გასაღები და ლიმიტი **მხოლოდ** თითო მომხმარებელზე.
 *
 * ⚠️ §30-იდან (Q38) საერთო `.env` ფენა აღარ არსებობს — ტესტები, რომლებიც მას
 * იცავდნენ, **შებრუნებულია**: `config('services.*')`-ში ჩაწერილი გასაღები
 * იგნორირდება, ხოლო ვისაც თავისი არ აქვს, მისთვის წყარო არ მუშაობს.
 *
 * ⚠️ აქ **ლოგიკა** მოწმდება და არა ცოცხალი წყარო: ვისი გასაღები წავიდა,
 * ვის ხარჯზე დაითვალა და რა გავიდა პასუხში.
 */
class CredentialTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private User $other;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = $this->makeUser('kate');
        $this->other = $this->makeUser('nino');
    }

    private function makeUser(string $name): User
    {
        return User::create([
            'name' => $name,
            'username' => $name,
            'email' => $name.'@example.com',
            'password' => 'password',
        ]);
    }

    private function own(User $user, string $provider, array $fields, array $limits = []): UserCredential
    {
        $row = UserCredential::create([
            'user_id' => $user->id,
            'provider' => $provider,
            'credentials' => $fields,
            'limits' => $limits ?: null,
        ]);

        CredentialStore::forget();

        return $row;
    }

    /**
     * ⚠️ **`config`/`.env`-ში ჩაწერილი გასაღები იგნორირდება** (Tasks §30.9) —
     * აქამდე ეს „საერთო გასაღები" იყო; ახლა ის არაფერს ნიშნავს.
     */
    public function test_a_key_in_config_is_ignored(): void
    {
        config(['services.tmdb.key' => 'installation-key']);

        $this->actingAs($this->user);

        $this->assertSame('none', CredentialStore::source(CredentialProviders::TMDB));
        $this->assertNull(CredentialStore::value(CredentialProviders::TMDB));
        $this->assertFalse(CredentialStore::configured(CredentialProviders::TMDB));
    }

    /** ჩემი გასაღები ჩემია — სხვას, ვისაც თავისი არ აქვს, არაფერი მოხვდება */
    public function test_a_users_own_key_is_theirs_alone(): void
    {
        $this->own($this->user, CredentialProviders::TMDB, ['key' => 'mine']);

        $this->actingAs($this->user);

        $this->assertSame('user', CredentialStore::source(CredentialProviders::TMDB));
        $this->assertSame('mine', CredentialStore::value(CredentialProviders::TMDB));

        // ⚠️ სხვას იგივე გასაღები არ უნდა მოხვდეს — და სარეზერვოც აღარ აქვს
        $this->actingAs($this->other);
        CredentialStore::forget();
        $this->assertNull(CredentialStore::value(CredentialProviders::TMDB));
        $this->assertSame('none', CredentialStore::source(CredentialProviders::TMDB));
    }

    /**
     * ⚠️ IGDB-ს ორი სავალდებულო ველი აქვს: ერთი ჩაწერილი „ჩემს გასაღებს"
     * არ ნიშნავს — და §30-იდან ნახევრად შევსებულ წყაროს სარეზერვოც აღარ აქვს.
     */
    public function test_a_half_filled_provider_is_not_treated_as_own(): void
    {
        $this->own($this->user, CredentialProviders::IGDB, ['client_id' => 'mine']);

        $this->actingAs($this->user);

        $this->assertFalse(CredentialStore::usesOwnKey(CredentialProviders::IGDB));
        $this->assertFalse(CredentialStore::configured(CredentialProviders::IGDB));
        $this->assertNull(CredentialStore::value(CredentialProviders::IGDB, 'client_id'));
    }

    /**
     * ⚠️ ცალკეული, **არასავალდებულო** ღია ველი **კოდის ნაგულისხმევზე** ეცემა:
     * ჩემი გასაღები + ცარიელი მოდელი = ჩემი გასაღები და `gemini-3.5-flash`.
     */
    public function test_an_unset_optional_field_falls_back_to_the_code_default(): void
    {
        config(['services.gemini.model' => 'config-model-is-ignored']);
        $this->own($this->user, CredentialProviders::GEMINI, ['key' => 'mine']);

        $this->actingAs($this->user);

        $this->assertSame('mine', CredentialStore::value(CredentialProviders::GEMINI));
        $this->assertSame('gemini-3.5-flash', CredentialStore::value(CredentialProviders::GEMINI, 'model'));
    }

    /** ⚠️ გამორთული რიგი = გასაღები არ მაქვს — საერთოზე ვარდნა აღარ არსებობს */
    public function test_an_inactive_row_means_no_key(): void
    {
        $row = $this->own($this->user, CredentialProviders::TMDB, ['key' => 'mine']);
        $row->update(['is_active' => false]);
        CredentialStore::forget();

        $this->actingAs($this->user);

        $this->assertNull(CredentialStore::value(CredentialProviders::TMDB));
        $this->assertSame('none', CredentialStore::source(CredentialProviders::TMDB));
    }

    /**
     * **ეს თასქის არსია (§21.4 → §30).** მრიცხველი მხოლოდ ჩემს რიგებს ითვლის —
     * სხვისი თარგმანი ჩემს კვოტას არ ხარჯავს, რადგან Google-ს ჩემი გასაღები
     * საერთოდ არ უნახავს.
     */
    public function test_own_key_means_own_quota(): void
    {
        $this->own($this->user, CredentialProviders::GEMINI, ['key' => 'mine'], ['daily' => 10]);

        // სხვისი ხარჯი — ჩემთვის უხილავი უნდა იყოს
        foreach (range(1, 8) as $i) {
            TranslationUsage::create([
                'user_id' => $this->other->id,
                'provider' => TranslationUsage::PROVIDER_GEMINI,
                'chars' => 10,
                'ok' => true,
            ]);
        }

        $this->actingAs($this->user);
        CredentialStore::forget();

        $usage = app(Translator::class)->usage();

        $this->assertSame('user', $usage['source']);
        $this->assertSame(0, $usage['used'], 'სხვისი ხარჯი ჩემს გასაღებს არ ეხება');
        $this->assertFalse($usage['exhausted']);
        $this->assertSame('day', $usage['period']);
    }

    /**
     * ⚠️ **„მთელი ინსტალაციის ჯამი" აღარ არსებობს** (Tasks §30) — გასაღების
     * გარეშეც მრიცხველი მხოლოდ ჩემს რიგებს ითვლის, და არა ყველასას.
     */
    public function test_the_counter_never_counts_the_whole_installation(): void
    {
        foreach (range(1, 8) as $i) {
            TranslationUsage::create([
                'user_id' => $this->other->id,
                'provider' => TranslationUsage::PROVIDER_GEMINI,
                'chars' => 10,
                'ok' => true,
            ]);
        }

        $this->actingAs($this->user);

        $usage = app(Translator::class)->usage();

        $this->assertSame('none', $usage['source']);
        $this->assertSame(0, $usage['used']);
        // ⚠️ მომხმარებლის გარეშე (CLI) გასაღებიც არაა, ე.ი. დასათვლელიც არაფერია
        $this->assertSame(0, TranslationUsage::usedToday(null));
    }

    /** ჩემი ლიმიტი კოდის ნაგულისხმევს ცვლის; `0` = ლიმიტი არაა და `null`-ისგან განსხვავდება */
    public function test_a_personal_limit_overrides_the_code_default(): void
    {
        config(['services.gemini.daily_limit' => 7]);
        $this->own($this->user, CredentialProviders::GEMINI, ['key' => 'mine'], ['daily' => 50]);

        $this->actingAs($this->user);

        $this->assertSame(50, CredentialStore::limit(CredentialProviders::GEMINI, 'daily'));
        // ⚠️ `config` არაფერს ცვლის — ნაგულისხმევი კოდისაა (1500)
        $this->assertSame(1500, CredentialStore::limit(CredentialProviders::GEMINI, 'daily', $this->other->id));

        $this->own($this->other, CredentialProviders::GEMINI, ['key' => 'theirs'], ['daily' => 0]);
        $this->assertSame(0, CredentialStore::limit(CredentialProviders::GEMINI, 'daily', $this->other->id));
    }

    /* ---------- API ---------- */

    public function test_the_api_never_returns_a_secret(): void
    {
        config(['services.tmdb.key' => 'config-key-value']);
        $this->own($this->user, CredentialProviders::TMDB, ['key' => 'super-secret-value']);

        $res = $this->actingAs($this->user)->getJson('/api/credentials')->assertOk();

        $body = $res->getContent();

        $this->assertStringNotContainsString('super-secret-value', $body);
        $this->assertStringNotContainsString('config-key-value', $body);
        // …მაგრამ „ჩავწერე" ჩანს
        $tmdb = collect($res->json('data'))->firstWhere('provider', 'tmdb');
        $this->assertSame('user', $tmdb['source']);
        $this->assertTrue($tmdb['fields'][0]['has_own']);
        /* ⚠️ ნიღაბი **ინტერფეისზე ველის შიგთავსია** (და არა placeholder),
           ე.ი. მან „შევსებული ველი" უნდა დახატოს — სიგრძე ფიქსირებულია და
           ნამდვილ სიგრძეს არ იმეორებს (ისიც მინიშნება იქნებოდა). */
        $this->assertSame('••••••••••••alue', $tmdb['fields'][0]['masked']);
    }

    public function test_saving_and_clearing_a_field(): void
    {
        $this->actingAs($this->user)
            ->putJson('/api/credentials/tmdb', ['fields' => ['key' => 'mine']])
            ->assertOk()
            ->assertJsonPath('data.source', 'user');

        CredentialStore::forget();
        $this->assertSame('mine', CredentialStore::value(CredentialProviders::TMDB, 'key', $this->user->id));

        // ცარიელი = გასუფთავება (გამოტოვებული კი — არ ცვლის); სარეზერვო აღარ არსებობს
        $this->actingAs($this->user)
            ->putJson('/api/credentials/tmdb', ['fields' => ['key' => '']])
            ->assertOk()
            ->assertJsonPath('data.source', 'none')
            ->assertJsonPath('data.configured', false);
    }

    /**
     * ⚠️ **პასუხში საერთო ფენის კვალი აღარაა** (Tasks §30.10): არც `has_shared`,
     * არც `shared_hint`, ლიმიტზე კი `default` — კოდის ნაგულისხმევი.
     */
    public function test_the_payload_carries_code_defaults_not_shared_values(): void
    {
        $gemini = collect($this->actingAs($this->user)->getJson('/api/credentials')->json('data'))
            ->firstWhere('provider', 'gemini');

        $this->assertSame('none', $gemini['source']);

        foreach ($gemini['fields'] as $field) {
            $this->assertArrayNotHasKey('has_shared', $field);
            $this->assertArrayNotHasKey('shared_hint', $field);
        }

        $model = collect($gemini['fields'])->firstWhere('name', 'model');
        $this->assertSame('gemini-3.5-flash', $model['default']);
        // ⚠️ საიდუმლოს ნაგულისხმევი არასდროს აქვს
        $this->assertNull(collect($gemini['fields'])->firstWhere('name', 'key')['default']);

        $daily = collect($gemini['limits'])->firstWhere('name', 'daily');
        $this->assertSame(1500, $daily['default']);
        $this->assertArrayNotHasKey('shared', $daily);
    }

    /** ⚠️ გასაღების შეცვლა ძველ „შემოწმებულია"-ს ბათილს ხდის */
    public function test_changing_a_key_clears_the_verified_stamp(): void
    {
        $row = $this->own($this->user, CredentialProviders::TMDB, ['key' => 'old']);
        $row->update(['verified_at' => now()]);

        $this->actingAs($this->user)
            ->putJson('/api/credentials/tmdb', ['fields' => ['key' => 'new']])
            ->assertOk()
            ->assertJsonPath('data.verified_at', null);
    }

    /** ⚠️ აუდიტ-ლოგში გასაღები ვერასდროს უნდა მოხვდეს */
    public function test_the_audit_log_records_the_fact_not_the_value(): void
    {
        $this->actingAs($this->user)
            ->putJson('/api/credentials/tmdb', ['fields' => ['key' => 'top-secret']])
            ->assertOk();

        $log = AuditLog::where('subject_type', 'credential')->latest('id')->first();

        $this->assertNotNull($log);
        $this->assertSame('tmdb', $log->subject_label);
        $this->assertStringNotContainsString('top-secret', json_encode($log->new_values));
        $this->assertSame(['key'], $log->new_values['fields']);
    }

    /* ---------- ნახვა და კოპირება (§21.8) ---------- */

    /** ⚠️ სწორედ ამისთვისაა ცალკე endpoint: სია მას არ აბრუნებს, ეს — აბრუნებს */
    public function test_reveal_returns_my_own_key(): void
    {
        $this->own($this->user, CredentialProviders::TMDB, ['key' => 'my-real-key']);

        $this->actingAs($this->user)
            ->getJson('/api/credentials/tmdb/reveal')
            ->assertOk()
            ->assertJsonPath('fields.key', 'my-real-key')
            ->assertJsonPath('source', 'user');
    }

    /** ⚠️ **`config`-ში ჩაწერილი მნიშვნელობა არასდროს გადის** — ის ჩემი არაა */
    public function test_reveal_never_returns_a_key_from_config(): void
    {
        config(['services.tmdb.key' => 'installation-key']);

        $res = $this->actingAs($this->user)
            ->getJson('/api/credentials/tmdb/reveal')
            ->assertOk()
            ->assertJsonPath('source', 'none')
            ->assertJsonPath('fields', []);

        $this->assertStringNotContainsString('installation-key', $res->getContent());
    }

    /** ⚠️ სხვისი გასაღები ჩემი endpoint-ით არ იკითხება — მოთხოვნა ჩემს რიგზეა */
    public function test_reveal_never_returns_another_users_key(): void
    {
        $this->own($this->other, CredentialProviders::TMDB, ['key' => 'their-key']);

        $res = $this->actingAs($this->user)
            ->getJson('/api/credentials/tmdb/reveal')
            ->assertOk();

        $this->assertStringNotContainsString('their-key', $res->getContent());
    }

    /** ღია ველი (მოდელი) სიაშივე მოდის — აქ მისი გამეორება ზედმეტია */
    public function test_reveal_only_carries_secret_fields(): void
    {
        $this->own($this->user, CredentialProviders::GEMINI, ['key' => 'k', 'model' => 'gemini-x']);

        $this->actingAs($this->user)
            ->getJson('/api/credentials/gemini/reveal')
            ->assertOk()
            ->assertJsonPath('fields.key', 'k')
            ->assertJsonMissingPath('fields.model');
    }

    /** ⚠️ გასაღების გატანა ის მოქმედებაა, რომელსაც კვალი უნდა დარჩეს */
    public function test_reveal_is_written_to_the_audit_log(): void
    {
        $this->own($this->user, CredentialProviders::TMDB, ['key' => 'my-real-key']);

        $this->actingAs($this->user)->getJson('/api/credentials/tmdb/reveal')->assertOk();

        $log = AuditLog::where('subject_type', 'credential')->latest('id')->first();

        $this->assertNotNull($log);
        $this->assertSame('reveal: tmdb', $log->subject_label);
        // …მაგრამ თვითონ გასაღები ლოგში მაინც არ წერია
        $this->assertStringNotContainsString('my-real-key', json_encode($log->new_values));
    }

    /* ---------- სუპერ-ადმინი და ტელეგრამი (§21.9 → §30) ---------- */

    /**
     * ⚠️ **სუპერ-ადმინიც მხოლოდ თავის გასაღებს ხედავს** (Tasks §30): §21.9-ის
     * „ინსტალაციის გასაღების ნახვა" საერთო ფენასთან ერთად გაქრა.
     */
    public function test_even_a_super_admin_cannot_reveal_a_config_key(): void
    {
        config(['services.tmdb.key' => 'installation-key']);
        $this->user->assignRole('super_admin')->save();

        $res = $this->actingAs($this->user->fresh())
            ->getJson('/api/credentials/tmdb/reveal')
            ->assertOk()
            ->assertJsonPath('fields', [])
            ->assertJsonMissingPath('owner');

        $this->assertStringNotContainsString('installation-key', $res->getContent());
    }

    /** …ხოლო თავისას — ჩვეულებრივად */
    public function test_a_super_admin_reveals_their_own_key(): void
    {
        $this->user->assignRole('super_admin')->save();
        $this->own($this->user, CredentialProviders::TMDB, ['key' => 'mine']);

        $this->actingAs($this->user->fresh())
            ->getJson('/api/credentials/tmdb/reveal')
            ->assertOk()
            ->assertJsonPath('fields.key', 'mine')
            ->assertJsonPath('source', 'user');
    }

    /** ტელეგრამი ჩვეულებრივი წყაროა სიაში — მისი ბარათიც იქვეა */
    public function test_telegram_is_a_provider_like_the_others(): void
    {
        $res = $this->actingAs($this->user)->getJson('/api/credentials')->assertOk();

        $telegram = collect($res->json('data'))->firstWhere('provider', 'telegram');

        $this->assertNotNull($telegram);
        // ⚠️ ბოტი პირადია — ჩაწერამდე წყარო უბრალოდ „არ არის"
        $this->assertSame('none', $telegram['source']);
        $this->assertFalse($telegram['fields'][0]['has_own']);
    }

    /**
     * Tasks §30 — ⚠️ **ბოტის შემოწმება `getMe`-ია**: უფასოა და ჩატში არაფერს
     * აგზავნის. აქამდე ტელეგრამის ბარათის „შემოწმება" `unknown_provider`-ს
     * აბრუნებდა — ბარათების ბადეზე ეს ღილაკი ყოველთვის ჩავარდებოდა.
     */
    public function test_the_telegram_token_is_checked_with_get_me(): void
    {
        Http::fake(['api.telegram.org/*' => Http::response(['ok' => true, 'result' => ['is_bot' => true]])]);
        $this->own($this->user, CredentialProviders::TELEGRAM, ['bot_token' => '123:ABC', 'chat_id' => '42']);

        $this->actingAs($this->user)
            ->postJson('/api/credentials/telegram/test')
            ->assertOk()
            ->assertJsonPath('ok', true);

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/bot123:ABC/getMe'));
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'sendMessage'));
    }

    /**
     * ⚠️ **ბოტის ტოკენი ერთ საცავშია.** შეხსენების არხების ფანჯარაც იმავე
     * endpoint-ს იძახებს, ე.ი. `NoteChannelSettings` სწორედ იმას კითხულობს,
     * რაც „მონაცემებში" ჩაიწერა — თორემ ორი მნიშვნელობა გაჩნდებოდა და
     * შეხსენება ჩუმად გაჩუმდებოდა.
     */
    public function test_the_telegram_token_saved_here_is_what_the_reminder_reads(): void
    {
        $this->actingAs($this->user)
            ->putJson('/api/credentials/telegram', [
                'fields' => ['bot_token' => '123:ABC', 'chat_id' => '987654'],
            ])
            ->assertOk()
            ->assertJsonPath('data.source', 'user');

        CredentialStore::forget();

        $settings = app(NoteChannelSettings::class)->for($this->user);

        $this->assertSame('123:ABC', $settings['telegram_bot_token']);
        $this->assertSame('987654', $settings['telegram_chat_id']);
    }

    /* ---------- SEC-12 — ღია ტოკენი `module_user.settings`-ში ---------- */

    /** `note` მოდული ჩართული, pivot-ის settings — ზუსტად `$settings` */
    private function notePivot(User $user, array $settings): int
    {
        $moduleId = (int) Module::where('key', 'note')->value('id');

        $user->modules()->syncWithoutDetaching([
            $moduleId => ['settings' => json_encode($settings), 'enabled_at' => now()],
        ]);

        return $moduleId;
    }

    private function pivotSettings(User $user, int $moduleId): string
    {
        return (string) DB::table('module_user')
            ->where('user_id', $user->id)
            ->where('module_id', $moduleId)
            ->value('settings');
    }

    /**
     * ⚠️ **SEC-12 (High, 2026-09-17).** §21.9-ის მიგრაცია ტოკენს pivot-ში
     * ტოვებდა, `GET /api/modules` კი pivot-ის JSON-ს ფილტრის გარეშე
     * აბრუნებდა — ღია ტოკენი ყოველ მოდულების სიაში ბრაუზერს ეგზავნებოდა.
     */
    public function test_the_modules_list_never_carries_the_plaintext_bot_token(): void
    {
        $this->seed(ModulesSeeder::class);
        $this->notePivot($this->user, [
            'telegram_bot_token' => '123456:LEGACY-PLAINTEXT',
            'telegram_chat_id' => '42',
            'status_sections' => ['hidden' => ['done']],
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/modules')->assertOk();

        $this->assertStringNotContainsString('LEGACY-PLAINTEXT', (string) $res->getContent());

        $note = collect($res->json('data'))->firstWhere('key', 'note');
        $this->assertArrayNotHasKey('telegram_bot_token', $note['user_settings']);
        $this->assertArrayNotHasKey('telegram_chat_id', $note['user_settings']);
        // ⚠️ დანარჩენი ფენები უცვლელია
        $this->assertSame(['hidden' => ['done']], $note['user_settings']['status_sections']);
    }

    /** SEC-12 — ⚠️ settings-ის `PUT` ღია ასლს **ხელახლა** არ შქმნის */
    public function test_module_settings_never_write_the_bot_token_back(): void
    {
        $this->seed(ModulesSeeder::class);
        $noteId = $this->notePivot($this->user, []);

        $res = $this->actingAs($this->user)
            ->putJson('/api/modules/note/settings', [
                'settings' => ['telegram_bot_token' => '999:WRITTEN-BACK', 'gallery' => ['limit' => 5]],
            ])
            ->assertOk();

        $this->assertStringNotContainsString('WRITTEN-BACK', (string) $res->getContent());
        $this->assertStringNotContainsString('WRITTEN-BACK', $this->pivotSettings($this->user, $noteId));
        $this->assertSame(['limit' => 5], json_decode($this->pivotSettings($this->user, $noteId), true)['gallery']);
    }

    /**
     * SEC-12 — მიგრაცია: ⚠️ **ჯერ ავსება, მერე წაშლა, და ველ-ველ.**
     * `kate`-ს `user_credentials`-ში არაფერი აქვს → ორივე ველი pivot-იდან
     * გადადის; `nino`-ს ტოკენი უკვე აქვს, `chat_id` — არა → **თავისი** ტოკენი
     * რჩება, `chat_id` pivot-იდან ივსება. ორივეს pivot-იდან ღია გასაღებები
     * ქრება, დანარჩენი JSON — უცვლელი.
     */
    public function test_the_migration_backfills_credentials_then_strips_the_pivot(): void
    {
        $this->seed(ModulesSeeder::class);

        $noteId = $this->notePivot($this->user, [
            'telegram_bot_token' => '111:ONLY-IN-PIVOT',
            'telegram_chat_id' => '11',
            'status_sections' => ['hidden' => ['done']],
        ]);
        $this->own($this->other, CredentialProviders::TELEGRAM, ['bot_token' => '222:ALREADY-ENCRYPTED']);
        $this->notePivot($this->other, ['telegram_bot_token' => '222:STALE-PIVOT', 'telegram_chat_id' => '22']);

        (require database_path('migrations/2026_09_17_000001_strip_plaintext_telegram_from_module_settings.php'))->up();
        CredentialStore::forget();

        foreach ([$this->user, $this->other] as $user) {
            $this->assertStringNotContainsString('telegram_', $this->pivotSettings($user, $noteId));
        }

        $this->assertSame(
            ['hidden' => ['done']],
            json_decode($this->pivotSettings($this->user, $noteId), true)['status_sections'],
        );

        $channels = app(NoteChannelSettings::class);

        $this->assertSame(
            ['telegram_bot_token' => '111:ONLY-IN-PIVOT', 'telegram_chat_id' => '11'],
            $channels->for($this->user),
        );
        $this->assertSame(
            ['telegram_bot_token' => '222:ALREADY-ENCRYPTED', 'telegram_chat_id' => '22'],
            $channels->for($this->other),
        );

        // ⚠️ ახლა ტოკენი დაშიფრულია — ბაზაში ღიად არსად
        $this->assertStringNotContainsString(
            '111:ONLY-IN-PIVOT',
            (string) DB::table('user_credentials')->where('user_id', $this->user->id)->value('credentials'),
        );
    }

    /**
     * SEC-12 — ⚠️ **სხვა `APP_KEY`-ით დაშიფრული რიგი** (ცოცხალ ბაზაზე ზუსტად ასე
     * ჩავარდა პირველი გაშვება): `fields()` მას ცარიელად თვლის, ე.ი. აპი
     * pivot-ის ღია ასლზე მუშაობდა. მიგრაცია არ ცვივა — რიგს pivot-ის
     * მნიშვნელობით ხელახლა შიფრავს და მერე pivot-ს ასუფთავებს.
     */
    public function test_the_migration_repairs_a_row_encrypted_with_another_app_key(): void
    {
        $this->seed(ModulesSeeder::class);

        $foreign = new Encrypter(random_bytes(32), 'aes-256-cbc');
        DB::table('user_credentials')->insert([
            'user_id' => $this->user->id,
            'provider' => CredentialProviders::TELEGRAM,
            'credentials' => $foreign->encryptString(json_encode(['bot_token' => '333:OTHER-MACHINE'])),
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $noteId = $this->notePivot($this->user, ['telegram_bot_token' => '333:PIVOT-COPY', 'telegram_chat_id' => '33']);

        (require database_path('migrations/2026_09_17_000001_strip_plaintext_telegram_from_module_settings.php'))->up();
        CredentialStore::forget();

        $this->assertStringNotContainsString('telegram_', $this->pivotSettings($this->user, $noteId));
        $this->assertSame(1, DB::table('user_credentials')->where('user_id', $this->user->id)->count());
        $this->assertSame(
            ['telegram_bot_token' => '333:PIVOT-COPY', 'telegram_chat_id' => '33'],
            app(NoteChannelSettings::class)->for($this->user),
        );
    }

    /** ⚠️ ბაზაში ტოკენი ღიად აღარ დევს (ადრე `module_user.settings`-ში იდო) */
    public function test_the_telegram_token_is_encrypted_at_rest(): void
    {
        $this->own($this->user, CredentialProviders::TELEGRAM, ['bot_token' => '123:SECRET']);

        $raw = \DB::table('user_credentials')
            ->where('user_id', $this->user->id)
            ->where('provider', 'telegram')
            ->value('credentials');

        $this->assertStringNotContainsString('123:SECRET', (string) $raw);
    }

    /** ინსტალაციის ბლოკი მხოლოდ სუპერ-ადმინს მოსდევს */
    public function test_installation_settings_are_super_admin_only(): void
    {
        $this->actingAs($this->user)
            ->getJson('/api/credentials')
            ->assertOk()
            ->assertJsonPath('meta.installation', []);

        $this->user->assignRole('super_admin')->save();

        $keys = collect(
            $this->actingAs($this->user->fresh())->getJson('/api/credentials')->json('meta.installation')
        )->pluck('key');

        $this->assertContains('YTDLP_BINARY', $keys);
        $this->assertContains('ALLOW_REGISTRATION', $keys);
    }

    public function test_an_unknown_provider_is_a_404(): void
    {
        $this->actingAs($this->user)->putJson('/api/credentials/nope', ['fields' => []])->assertNotFound();
    }

    /** ⚠️ Serper-ის შემოწმება კრედიტს ხარჯავს → ცხადი დასტურის გარეშე 422 */
    public function test_a_paid_test_requires_an_explicit_confirmation(): void
    {
        $this->own($this->user, CredentialProviders::SERPER, ['key' => 'mine']);

        $this->actingAs($this->user)
            ->postJson('/api/credentials/serper/test')
            ->assertStatus(422);
    }

    public function test_a_successful_test_stamps_the_row(): void
    {
        Http::fake(['api.themoviedb.org/*' => Http::response(['images' => []], 200)]);
        $this->own($this->user, CredentialProviders::TMDB, ['key' => 'mine']);

        $this->actingAs($this->user)
            ->postJson('/api/credentials/tmdb/test')
            ->assertOk()
            ->assertJsonPath('ok', true);

        $this->assertNotNull(UserCredential::where('user_id', $this->user->id)->first()->verified_at);
    }

    /** გასაღების უარყოფა („401") და „ვერ მივწვდი" სხვადასხვა პასუხია */
    public function test_a_rejected_key_is_recorded_with_its_reason(): void
    {
        Http::fake(['api.themoviedb.org/*' => Http::response(['status_message' => 'Invalid API key'], 401)]);
        $this->own($this->user, CredentialProviders::TMDB, ['key' => 'mine']);

        $this->actingAs($this->user)
            ->postJson('/api/credentials/tmdb/test')
            ->assertOk()
            ->assertJsonPath('ok', false)
            ->assertJsonPath('error', 'rejected');

        $this->assertSame('rejected', UserCredential::where('user_id', $this->user->id)->first()->last_error);
    }

    /** ⚠️ სხვისი ჩანაწერი ჩემი endpoint-ით არ იშლება — მოთხოვნა ჩემს რიგზეა */
    public function test_delete_only_touches_my_own_row(): void
    {
        $mine = $this->own($this->user, CredentialProviders::TMDB, ['key' => 'mine']);
        $theirs = $this->own($this->other, CredentialProviders::TMDB, ['key' => 'theirs']);

        $this->actingAs($this->user)->deleteJson('/api/credentials/tmdb')->assertOk();

        $this->assertDatabaseMissing('user_credentials', ['id' => $mine->id]);
        $this->assertDatabaseHas('user_credentials', ['id' => $theirs->id]);
    }

    /** ⚠️ ბაზაში გასაღები ღიად არ დევს (დამპი ხელიდან ხელში გადადის, §22) */
    public function test_the_key_is_encrypted_at_rest(): void
    {
        $this->own($this->user, CredentialProviders::TMDB, ['key' => 'plain-text-key']);

        $raw = \DB::table('user_credentials')->where('user_id', $this->user->id)->value('credentials');

        $this->assertStringNotContainsString('plain-text-key', (string) $raw);
    }

    /* ---------- სხვა `APP_KEY` (Tasks GAP-11) ---------- */

    /** სხვა მანქანის გასაღებით დაშიფრული რიგი */
    private function foreignRow(string $provider, array $fields): void
    {
        $foreign = new Encrypter(random_bytes(32), 'aes-256-cbc');

        DB::table('user_credentials')->insert([
            'user_id' => $this->user->id,
            'provider' => $provider,
            'credentials' => $foreign->encryptString(json_encode($fields)),
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        CredentialStore::forget();
    }

    /**
     * **გაუშიფრავი რიგი პასუხში ცხადად წერია და ჩუმად „არაფერი" აღარაა.**
     *
     * ⚠️ ეს ცოცხალ ბაზაზე მოხდა (SEC-12, 2026-09-17): ერთადერთი
     * `user_credentials` რიგი ძველ მანქანაზე სხვა `APP_KEY`-ით დაიშიფრა.
     * `fields()` შეცდომას ყლაპავდა, ე.ი. აპი რიგს „გასაღები არ არის"-ად
     * კითხულობდა: `CredentialStore` საერთო `.env`-ზე ვარდებოდა (და პირადი
     * ლიმიტი ჩუმად საერთო ხდებოდა), `/credentials` კი „არ არის"-ს აჩვენებდა.
     * ლოგში არაფერი იწერებოდა.
     */
    public function test_a_row_from_another_app_key_is_reported_as_undecryptable(): void
    {
        Log::spy();
        $this->foreignRow(CredentialProviders::TELEGRAM, ['bot_token' => '333:OTHER-MACHINE']);

        $row = collect($this->actingAs($this->user)->getJson('/api/credentials')->assertOk()->json('data'))
            ->firstWhere('provider', CredentialProviders::TELEGRAM);

        $this->assertTrue($row['undecryptable'], 'გაუშიფრავი რიგი ცხადად უნდა ჩანდეს');
        /* ⚠️ `source` სიმართლეს ამბობს: ჩემი გასაღები ვერ იკითხება, ე.ი.
           **მოქმედი** გასაღები ჩემი არაა — ეს ორი სხვადასხვა ფაქტია. */
        $this->assertNotSame('user', $row['source']);
        $this->assertFalse(CredentialStore::usesOwnKey(CredentialProviders::TELEGRAM, $this->user->id));

        // ⚠️ ლოგში ერთხელ, თუმცა `fields()` ერთ მოთხოვნაში რამდენჯერმე იძახება
        Log::shouldHaveReceived('warning')
            ->withArgs(fn (string $message) => str_contains($message, 'cannot be decrypted'))
            ->once();
    }

    /**
     * **ახალი გასაღების ჩაწერა გაუშიფრავ რიგზე მუშაობს.**
     *
     * ⚠️ ესაა ერთადერთი გამოსავალი, რაც მომხმარებელს რჩება — და სწორედ ის
     * ცდებოდა: Eloquent-ის dirty-შემოწმება დაშიფრული cast-ის **ორიგინალს**
     * შიფრავს, ე.ი. `save()` იმავე `DecryptException`-ზე ვარდებოდა (500).
     */
    public function test_a_new_key_can_be_written_over_an_undecryptable_row(): void
    {
        $this->foreignRow(CredentialProviders::TELEGRAM, ['bot_token' => '333:OTHER-MACHINE']);

        $this->actingAs($this->user)
            ->putJson('/api/credentials/'.CredentialProviders::TELEGRAM, [
                'fields' => ['bot_token' => '999:FRESH', 'chat_id' => '42'],
            ])
            ->assertOk()
            ->assertJsonPath('data.undecryptable', false)
            ->assertJsonPath('data.source', 'user');

        CredentialStore::forget();
        $this->assertSame('999:FRESH', CredentialStore::value(CredentialProviders::TELEGRAM, 'bot_token', $this->user->id));
    }

    /* ---------- `.env` → პირადი ჩანაწერები (Tasks §30.5) ---------- */

    /** დროებითი `.env` — მიგრაცია დეველოპერის ნამდვილ ფაილს არ კითხულობს */
    private function withEnvFile(string $contents): string
    {
        $dir = sys_get_temp_dir().DIRECTORY_SEPARATOR.'mediary-env-'.uniqid();
        mkdir($dir);
        file_put_contents($dir.DIRECTORY_SEPARATOR.'.env', $contents);
        $this->app->useEnvironmentPath($dir);

        return $dir;
    }

    private function runEnvMigration(): void
    {
        (require database_path('migrations/2026_09_28_000006_move_env_credentials_to_first_super_admin.php'))->up();
        CredentialStore::forget();
    }

    /**
     * **`.env`-ის გასაღებები პირველი სუპერ-ადმინისაა** — ის გადადის მის
     * ჩანაწერებში, დაშიფრულად. ⚠️ უკვე ჩაწერილს არ ცვლის, ხოლო ნაგულისხმევის
     * ტოლი მოდელი/ლიმიტი „პირადად" არ იყინება.
     */
    public function test_the_migration_moves_env_keys_to_the_first_super_admin(): void
    {
        $this->other->assignRole('super_admin')->save();
        // ⚠️ RAWG-ის თავისი გასაღები უკვე აქვს — ის უნდა დარჩეს
        $this->own($this->other, CredentialProviders::RAWG, ['key' => 'already-mine']);

        $dir = $this->withEnvFile(implode("\n", [
            'TMDB_API_KEY=tmdb-from-env',
            'GEMINI_API_KEY=gemini-from-env',
            'GEMINI_MODEL=gemini-3.5-flash',
            'RAWG_API_KEY=rawg-from-env',
            'SERPAPI_KEY=',
            'SERPAPI_MONTHLY_LIMIT=250',
            'SERPER_API_KEY="serper-from-env"',
        ])."\n");

        try {
            $this->runEnvMigration();
        } finally {
            @unlink($dir.DIRECTORY_SEPARATOR.'.env');
            @rmdir($dir);
        }

        $owner = $this->other->id;

        $this->assertSame('tmdb-from-env', CredentialStore::value(CredentialProviders::TMDB, 'key', $owner));
        $this->assertSame('gemini-from-env', CredentialStore::value(CredentialProviders::GEMINI, 'key', $owner));
        $this->assertSame('serper-from-env', CredentialStore::value(CredentialProviders::SERPER, 'key', $owner));
        $this->assertSame('already-mine', CredentialStore::value(CredentialProviders::RAWG, 'key', $owner));

        // ცარიელი ხაზი გასაღები არაა, ნაგულისხმევის ტოლი პარამეტრი კი არ იყინება
        $this->assertFalse(UserCredential::where('user_id', $owner)->where('provider', 'serpapi')->exists());
        $gemini = UserCredential::where('user_id', $owner)->where('provider', 'gemini')->first();
        $this->assertArrayNotHasKey('model', $gemini->fields());
        $this->assertNull($gemini->limits);

        // ⚠️ მხოლოდ მფლობელს — სხვა ანგარიშს არაფერი ეძლევა
        $this->assertFalse(UserCredential::where('user_id', $this->user->id)->exists());

        // ⚠️ დაშიფრულად — `DB::table()`-ით ჩაწერა ღია ტექსტს დატოვებდა
        $raw = (string) DB::table('user_credentials')->where('user_id', $owner)->where('provider', 'tmdb')->value('credentials');
        $this->assertStringNotContainsString('tmdb-from-env', $raw);
    }

    /** სუპერ-ადმინის გარეშე ვერავის მიეწერება — და ვერც სხვას მიეწერება */
    public function test_the_migration_writes_nothing_without_a_super_admin(): void
    {
        $dir = $this->withEnvFile("TMDB_API_KEY=tmdb-from-env\n");

        try {
            $this->runEnvMigration();
        } finally {
            @unlink($dir.DIRECTORY_SEPARATOR.'.env');
            @rmdir($dir);
        }

        $this->assertSame(0, UserCredential::count());
    }
}
