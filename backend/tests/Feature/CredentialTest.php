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
use Tests\TestCase;

/**
 * Tasks §21 — „მონაცემები": გასაღები და ლიმიტი თითო მომხმარებელზე.
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

    public function test_the_shared_env_key_is_used_when_the_user_has_none(): void
    {
        config(['services.tmdb.key' => 'installation-key']);

        $this->actingAs($this->user);

        $this->assertSame('shared', CredentialStore::source(CredentialProviders::TMDB));
        $this->assertSame('installation-key', CredentialStore::value(CredentialProviders::TMDB));
    }

    public function test_a_users_own_key_wins_over_the_shared_one(): void
    {
        config(['services.tmdb.key' => 'installation-key']);
        $this->own($this->user, CredentialProviders::TMDB, ['key' => 'mine']);

        $this->actingAs($this->user);

        $this->assertSame('user', CredentialStore::source(CredentialProviders::TMDB));
        $this->assertSame('mine', CredentialStore::value(CredentialProviders::TMDB));

        // სხვას იგივე გასაღები არ უნდა მოხვდეს
        $this->actingAs($this->other);
        CredentialStore::forget();
        $this->assertSame('installation-key', CredentialStore::value(CredentialProviders::TMDB));
    }

    /**
     * ⚠️ IGDB-ს ორი სავალდებულო ველი აქვს: ერთი ჩაწერილი „ჩემს გასაღებს"
     * არ ნიშნავს — გამოძახება მაინც საერთოთი წავიდოდა, კვოტა კი ჩემზე
     * დაითვლებოდა.
     */
    public function test_a_half_filled_provider_is_not_treated_as_own(): void
    {
        config(['services.igdb.client_id' => 'shared-id', 'services.igdb.client_secret' => 'shared-secret']);
        $this->own($this->user, CredentialProviders::IGDB, ['client_id' => 'mine']);

        $this->actingAs($this->user);

        $this->assertFalse(CredentialStore::usesOwnKey(CredentialProviders::IGDB));
        $this->assertSame('shared-id', CredentialStore::value(CredentialProviders::IGDB, 'client_id'));
    }

    /**
     * ⚠️ ცალკეული, **არასავალდებულო** ველი საერთოზე ეცემა: ჩემი გასაღები +
     * ცარიელი მოდელი = ჩემი გასაღები და ინსტალაციის ნაგულისხმევი მოდელი.
     */
    public function test_an_unset_optional_field_falls_back_while_the_key_stays_mine(): void
    {
        config(['services.gemini.key' => 'shared', 'services.gemini.model' => 'shared-model']);
        $this->own($this->user, CredentialProviders::GEMINI, ['key' => 'mine']);

        $this->actingAs($this->user);

        $this->assertSame('mine', CredentialStore::value(CredentialProviders::GEMINI));
        $this->assertSame('shared-model', CredentialStore::value(CredentialProviders::GEMINI, 'model'));
    }

    public function test_an_inactive_row_falls_back_to_the_shared_key(): void
    {
        config(['services.tmdb.key' => 'installation-key']);
        $row = $this->own($this->user, CredentialProviders::TMDB, ['key' => 'mine']);
        $row->update(['is_active' => false]);
        CredentialStore::forget();

        $this->actingAs($this->user);

        $this->assertSame('installation-key', CredentialStore::value(CredentialProviders::TMDB));
    }

    /**
     * **ეს თასქის არსია (§21.4).** საკუთარი გასაღებით მრიცხველი მხოლოდ ჩემს
     * რიგებს ითვლის — თორემ სხვისი თარგმანი ჩემს კვოტას ხარჯავდა, თუმცა
     * Google-ს ჩემი გასაღები საერთოდ არ უნახავს.
     */
    public function test_own_key_means_own_quota(): void
    {
        config(['services.gemini.key' => 'shared', 'services.gemini.daily_limit' => 10]);
        $this->own($this->user, CredentialProviders::GEMINI, ['key' => 'mine']);

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
    }

    /** საერთო გასაღებზე კი ძველი ქცევა რჩება — ჯამი ინსტალაციისაა */
    public function test_a_shared_key_still_counts_the_whole_installation(): void
    {
        config(['services.gemini.key' => 'shared', 'services.gemini.daily_limit' => 10]);

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

        $this->assertSame('shared', $usage['source']);
        $this->assertSame(8, $usage['used']);
    }

    /** ჩემი ლიმიტი საერთოს ცვლის; `0` = ლიმიტი არაა და `null`-ისგან განსხვავდება */
    public function test_a_personal_limit_overrides_the_installation_one(): void
    {
        config(['services.gemini.key' => 'shared', 'services.gemini.daily_limit' => 1500]);
        $this->own($this->user, CredentialProviders::GEMINI, ['key' => 'mine'], ['daily' => 50]);

        $this->actingAs($this->user);

        $this->assertSame(50, CredentialStore::limit(CredentialProviders::GEMINI, 'daily'));
        $this->assertSame(1500, CredentialStore::limit(CredentialProviders::GEMINI, 'daily', $this->other->id));
    }

    /* ---------- API ---------- */

    public function test_the_api_never_returns_a_secret(): void
    {
        config(['services.tmdb.key' => 'shared-key-value']);
        $this->own($this->user, CredentialProviders::TMDB, ['key' => 'super-secret-value']);

        $res = $this->actingAs($this->user)->getJson('/api/credentials')->assertOk();

        $body = $res->getContent();

        $this->assertStringNotContainsString('super-secret-value', $body);
        $this->assertStringNotContainsString('shared-key-value', $body);
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
        config(['services.tmdb.key' => 'installation-key']);

        $this->actingAs($this->user)
            ->putJson('/api/credentials/tmdb', ['fields' => ['key' => 'mine']])
            ->assertOk()
            ->assertJsonPath('data.source', 'user');

        CredentialStore::forget();
        $this->assertSame('mine', CredentialStore::value(CredentialProviders::TMDB, 'key', $this->user->id));

        // ცარიელი = გასუფთავება (გამოტოვებული კი — არ ცვლის)
        $this->actingAs($this->user)
            ->putJson('/api/credentials/tmdb', ['fields' => ['key' => '']])
            ->assertOk()
            ->assertJsonPath('data.source', 'shared');
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

    /**
     * ⚠️ **საერთო (`.env`) გასაღები არასდროს გადის.** ის ინსტალაციისაა და
     * არა ჩემი — მისი ჩვენება ნებისმიერ ავტორიზებულ ანგარიშს სხვისი
     * (და ფასიანი) გასაღების გატანის საშუალებას მისცემდა.
     */
    public function test_reveal_never_returns_the_shared_key(): void
    {
        config(['services.tmdb.key' => 'installation-key']);

        $res = $this->actingAs($this->user)
            ->getJson('/api/credentials/tmdb/reveal')
            ->assertOk()
            ->assertJsonPath('source', 'shared')
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

    /* ---------- საერთო გასაღები და ტელეგრამი (§21.9) ---------- */

    /**
     * ⚠️ **სუპერ-ადმინი ინსტალაციის გასაღებს ხედავს** (შენი მითითება): `.env`
     * ფაილი ისედაც მისი წასაკითხია, ე.ი. დამალვა მხოლოდ უხერხულობა იყო.
     */
    public function test_a_super_admin_can_reveal_the_shared_key(): void
    {
        config(['services.tmdb.key' => 'installation-key']);
        $this->user->assignRole('super_admin')->save();

        $this->actingAs($this->user->fresh())
            ->getJson('/api/credentials/tmdb/reveal')
            ->assertOk()
            ->assertJsonPath('fields.key', 'installation-key')
            ->assertJsonPath('owner.key', 'shared');
    }

    /** …ჩვეულებრივი ანგარიში კი — არა: გასაღები ანგარიშისაა და არა მისი */
    public function test_a_plain_user_still_cannot_reveal_the_shared_key(): void
    {
        config(['services.tmdb.key' => 'installation-key']);

        $res = $this->actingAs($this->user)
            ->getJson('/api/credentials/tmdb/reveal')
            ->assertOk()
            ->assertJsonPath('fields', []);

        $this->assertStringNotContainsString('installation-key', $res->getContent());
    }

    /** ⚠️ ჩემი გასაღები ყოველთვის ჩემია — საერთოს ის სძლევს */
    public function test_reveal_prefers_my_own_key_over_the_shared_one(): void
    {
        config(['services.tmdb.key' => 'installation-key']);
        $this->user->assignRole('super_admin')->save();
        $this->own($this->user, CredentialProviders::TMDB, ['key' => 'mine']);

        $this->actingAs($this->user->fresh())
            ->getJson('/api/credentials/tmdb/reveal')
            ->assertOk()
            ->assertJsonPath('fields.key', 'mine')
            ->assertJsonPath('owner.key', 'user');
    }

    /** ტელეგრამი ჩვეულებრივი წყაროა სიაში — მისი ბარათიც იქვეა */
    public function test_telegram_is_a_provider_like_the_others(): void
    {
        $res = $this->actingAs($this->user)->getJson('/api/credentials')->assertOk();

        $telegram = collect($res->json('data'))->firstWhere('provider', 'telegram');

        $this->assertNotNull($telegram);
        // ⚠️ `.env`-ში არასდროს ყოფილა: ბოტი პირადია, საერთო ვერსია არ არსებობს
        $this->assertSame('none', $telegram['source']);
        $this->assertFalse($telegram['fields'][0]['has_shared']);
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
        config(['services.serper.key' => 'shared']);

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
}
