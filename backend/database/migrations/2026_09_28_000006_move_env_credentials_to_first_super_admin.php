<?php

use App\Models\User;
use App\Models\UserCredential;
use App\Services\Credentials\CredentialStore;
use App\Support\CredentialProviders;
use Dotenv\Dotenv;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * **`.env`-ის წყაროს გასაღებები → პირველი სუპერ-ადმინის პირადი ჩანაწერები**
 * (Tasks §30.5, Q38 — 2026-09-28).
 *
 * §30-იდან აპი `TMDB_API_KEY`-ს, `GEMINI_API_KEY`-ს და დანარჩენებს **აღარ
 * კითხულობს** — გასაღები მხოლოდ მომხმარებლისაა. ამ ცვლილების გარეშე
 * გაშვებულ ინსტალაციაზე ყველა წყარო ერთ წამში გაჩერდებოდა. ეს მიგრაცია
 * „იმავე ნაბიჯშია": `.env`-ის მნიშვნელობები **იმ ადამიანის** ჩანაწერებში
 * გადადის, ვინც ისინი ჩაწერა — ანუ ინსტალაციის პატრონის, პირველი
 * სუპერ-ადმინის (`backups:auto`-ის იგივე წესი, FEAT-12).
 *
 * ⚠️ **ფაილი იკითხება და არა `env()`**: `config:cache`-ის შემდეგ `env()`
 * ცარიელია, ე.ი. მიგრაცია ჩუმად არაფერს გადაიტანდა. გზა
 * `environmentFilePath()`-იდან მოდის (ტესტი მას დროებით ფაილზე აბრუნებს).
 *
 * ⚠️ **Eloquent განზრახ** — `credentials` `encrypted:array`-ია; `DB::table()`
 * ღია ტექსტს ჩაწერდა (§21.9/SEC-12-ის წესი).
 *
 * ⚠️ **უკვე ჩაწერილს არასდროს ცვლის** — ველ-ველ: ვისაც თავისი გასაღები
 * უკვე აქვს, მისი რჩება. მოდელი და ლიმიტი მხოლოდ მაშინ გადადის, როცა
 * კოდის ნაგულისხმევისგან **განსხვავდება** — თორემ ნაგულისხმევი „პირადად"
 * გაიყინებოდა და მისი შემდგომი ცვლილება ამ ანგარიშს აღარ მიაღწევდა.
 *
 * ⚠️ **`.env`-ს თვითონ არ ეხება** — საიდუმლოების ფაილის მიგრაციიდან
 * გადაწერა ზედმეტად სახიფათოა. `mediary:doctor` ხაზებს FAIL-ით აჩვენებს,
 * წაშლა კი ადამიანის ხელითაა.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('user_credentials') || ! Schema::hasTable('users')) {
            return;
        }

        $values = $this->legacyValues();

        if ($values === []) {
            return;
        }

        $owner = User::with('role')->orderBy('id')->get()->first(fn (User $u) => $u->isSuperAdmin());

        if (! $owner) {
            /* ⚠️ ცარიელი ბაზა (ახალი ინსტალაცია, ტესტის `migrate`) ჩვეულებრივი
               მდგომარეობაა და ლოგს არ ავსებს — `mediary:doctor` ხაზებს ისედაც
               აჩვენებს. ანგარიშები რომ არის და სუპერ-ადმინი არა, ეს კი ითქმის. */
            if (User::query()->exists()) {
                Log::warning('.env credentials were not moved — there is no super admin yet', [
                    'names' => array_keys($values),
                ]);
            }

            return;
        }

        $moved = [];

        foreach ($this->byProvider($values) as $provider => $entry) {
            if ($this->store((int) $owner->getKey(), $provider, $entry['fields'], $entry['limits'])) {
                $moved[] = $provider;
            }
        }

        CredentialStore::forget();

        // ⚠️ მხოლოდ წყაროების სახელები — მნიშვნელობა ლოგში არასდროს
        Log::info('.env credentials moved to the first super admin', [
            'user_id' => $owner->getKey(),
            'providers' => $moved,
        ]);
    }

    /**
     * ⚠️ **`down()` ცარიელია**: `.env`-ში დაბრუნება მიგრაციის საქმე არაა, და
     * რიგების წაშლა ადამიანის მიერ მერე ჩაწერილ გასაღებსაც წაშლიდა.
     */
    public function down(): void {}

    /** @return array<string, string> ცვლადი => შევსებული მნიშვნელობა */
    private function legacyValues(): array
    {
        $path = app()->environmentFilePath();

        if (! is_file($path)) {
            return [];
        }

        $parsed = Dotenv::parse((string) file_get_contents($path));
        $out = [];

        foreach (array_keys(CredentialProviders::LEGACY_ENV) as $name) {
            $value = trim((string) ($parsed[$name] ?? ''));

            if ($value !== '') {
                $out[$name] = $value;
            }
        }

        return $out;
    }

    /**
     * @param  array<string, string>  $values
     * @return array<string, array{fields: array<string, string>, limits: array<string, int>}>
     */
    private function byProvider(array $values): array
    {
        $out = [];

        foreach ($values as $name => $value) {
            [$provider, $kind, $key] = CredentialProviders::LEGACY_ENV[$name];
            $out[$provider] ??= ['fields' => [], 'limits' => []];

            if ($kind === 'limit') {
                if (is_numeric($value) && (int) $value !== (int) CredentialProviders::default($provider, $key)) {
                    $out[$provider]['limits'][$key] = max(0, (int) $value);
                }

                continue;
            }

            $default = CredentialProviders::default($provider, $key);

            if ($default === null || $value !== (string) $default) {
                $out[$provider]['fields'][$key] = $value;
            }
        }

        return $out;
    }

    /**
     * @param  array<string, string>  $fields
     * @param  array<string, int>  $limits
     */
    private function store(int $userId, string $provider, array $fields, array $limits): bool
    {
        if ($fields === [] && $limits === []) {
            return false;
        }

        $row = UserCredential::firstOrNew(['user_id' => $userId, 'provider' => $provider]);

        /* ⚠️ სხვა `APP_KEY`-ით დაშიფრული რიგი ამ მანქანაზე ისედაც არავის
           გამოდგება, და მისი ორიგინალი `save()`-ის dirty-შემოწმებას აგდებს
           (SEC-12-ის გაკვეთილი) — ამიტომ მეხსიერებაში ჯერ ბათილდება. */
        $row->forgetUnreadable();

        $stored = $row->fields();
        $storedLimits = $row->limits ?? [];
        $fieldChanged = false;
        $limitChanged = false;

        foreach ($fields as $key => $value) {
            if (trim((string) ($stored[$key] ?? '')) === '') {
                $stored[$key] = $value;
                $fieldChanged = true;
            }
        }

        foreach ($limits as $key => $value) {
            if (! array_key_exists($key, $storedLimits)) {
                $storedLimits[$key] = $value;
                $limitChanged = true;
            }
        }

        if (! $fieldChanged && ! $limitChanged) {
            return false;
        }

        $row->credentials = $stored;
        $row->limits = $storedLimits ?: null;

        if (! $row->exists) {
            $row->is_active = true;
        }

        // ახალი მნიშვნელობა ჯერ შეუმოწმებელია (CredentialController-ის წესი)
        if ($fieldChanged) {
            $row->verified_at = null;
            $row->last_error = null;
        }

        $row->save();

        return true;
    }
};
