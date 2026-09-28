<?php

namespace App\Services\Credentials;

use App\Models\UserCredential;
use App\Support\CredentialProviders;
use Illuminate\Support\Facades\Auth;

/**
 * **გარე წყაროს გასაღების ერთადერთი წასაკითხი წერტილი** (Tasks §21 → §30).
 *
 * შვიდივე კლიენტი (`TmdbClient`, `Translator`, `RawgClient`, `IgdbClient`,
 * `SerpApiClient`, `SerperImages`, `VideoMetadata`) და ტელეგრამის არხი
 * გასაღებს აქედან იღებს. ეს `StorageMeter`-ის იგივე წესია: ერთი
 * შესვლა-გამოსვლა, თორემ მეორე გზა მრიცხველს ჩუმად აცდენს.
 *
 * ## ორი მდგომარეობა (Q38, 2026-09-28)
 *
 *   `user` — ჩემი გასაღებია ჩადებული, სრულია და ჩართულია
 *   `none` — არ მაქვს: წყარო ჩემთვის არ მუშაობს (`credential_missing`)
 *
 * ⚠️ **საერთო (`.env`) ფენა აღარ არსებობს** — „ნებისმიერი პაროლი მომხმარებელს
 * თავისი უნდა ჰქონდეს". ე.ი. გასაღების გარეშე ანგარიშს სარეზერვო აღარაფერი
 * აქვს, და ეს ცხადად ითქმის (`App\Support\MissingCredential`) — „წყარო
 * მიუწვდომელია"-ს ნაცვლად, რომელიც სულ სხვა ფაქტია.
 *
 * ⚠️ **„ჩემი გასაღები" `required` ველებით წყდება და არა ნებისმიერით.**
 * Gemini-ს ორი ველი აქვს — `key` (სავალდებულო) და `model` (არა): მხოლოდ
 * მოდელი გასაღებს არ ნიშნავს. IGDB-ს იგივე მიზეზით **ორივე** ველი უნდა ჰქონდეს.
 *
 * ⚠️ **არასავალდებულო ღია ველი კოდის ნაგულისხმევზე ეცემა** (`model` →
 * `gemini-3.5-flash`), თორემ გასაღების ჩაწერა მოდელს ცარიელს დატოვებდა და
 * თარგმანი დაიშლებოდა. საიდუმლოს ნაგულისხმევი არასდროს აქვს.
 *
 * ⚠️ **CLI-ს `Auth::id()` არ აქვს** → იქ გასაღებიც არ არის. ფონური სამუშაო
 * (`RunBatchItem`) და `media:redownload` მფლობელზე `Auth::setUser()`-ს აკეთებენ,
 * ე.ი. თითო ჩანაწერი **თავისი მფლობელის** გასაღებით მიდის (Tasks §30.7).
 */
class CredentialStore
{
    /**
     * ერთი რექვესთის ქეში: `"<userId>|<provider>"` → `UserCredential|false`.
     *
     * ⚠️ ეს **არაა ოპტიმიზაცია**. `TmdbClient` კონტეინერიდან თითო
     * გამოძახებაზე იქმნება, `Translator` კი კვოტას ყოველ თარგმანზე
     * ამოწმებს — ქეშის გარეშე 300-ჩანაწერიანი სინქრონი ასობით ერთსა და
     * იმავე `select`-ს გააკეთებდა.
     */
    private static array $memo = [];

    /** მოქმედი მომხმარებელი; `null` — CLI ან არაავტორიზებული */
    private static function currentUserId(?int $userId): ?int
    {
        return $userId ?? Auth::id();
    }

    private static function row(string $provider, ?int $userId = null): ?UserCredential
    {
        $userId = self::currentUserId($userId);

        if ($userId === null || ! CredentialProviders::has($provider)) {
            return null;
        }

        $memoKey = $userId.'|'.$provider;

        if (! array_key_exists($memoKey, self::$memo)) {
            self::$memo[$memoKey] = UserCredential::query()
                ->where('user_id', $userId)
                ->where('provider', $provider)
                ->first() ?? false;
        }

        $row = self::$memo[$memoKey];

        return $row === false ? null : $row;
    }

    /** ქეშის ჩამოყრა — შენახვის/წაშლის შემდეგ, ყოველ ფონურ job-ზე და ტესტებში */
    public static function forget(?int $userId = null, ?string $provider = null): void
    {
        if ($userId === null && $provider === null) {
            self::$memo = [];

            return;
        }

        foreach (array_keys(self::$memo) as $key) {
            [$u, $p] = explode('|', $key, 2);

            if (($userId === null || (int) $u === $userId) && ($provider === null || $p === $provider)) {
                unset(self::$memo[$key]);
            }
        }
    }

    /**
     * ამ მომხმარებელს **თავისი** (ჩართული და სრული) გასაღები აქვს თუ არა.
     *
     * ⚠️ ერთადერთი პრედიკატია, რომელზეც `value()`, `configured()` და
     * `source()` დგანან — ორი ასლი ორ სხვადასხვა პასუხს გასცემდა.
     */
    public static function usesOwnKey(string $provider, ?int $userId = null): bool
    {
        $row = self::row($provider, $userId);

        if (! $row || ! $row->is_active) {
            return false;
        }

        $fields = $row->fields();

        foreach (CredentialProviders::required($provider) as $name) {
            if (trim((string) ($fields[$name] ?? '')) === '') {
                return false;
            }
        }

        return true;
    }

    /** `user` | `none` — ინტერფეისისთვის და დიაგნოსტიკისთვის */
    public static function source(string $provider, ?int $userId = null): string
    {
        return self::usesOwnKey($provider, $userId) ? 'user' : 'none';
    }

    /**
     * გასაღები/ველი. `null` — არ მაქვს (endpoint `credential_missing`-ს აბრუნებს).
     *
     * ⚠️ ღია, არასავალდებულო ველი (Gemini-ის მოდელი) ცარიელზე კოდის
     * ნაგულისხმევს აბრუნებს; საიდუმლო — არასდროს.
     */
    public static function value(string $provider, string $field = 'key', ?int $userId = null): ?string
    {
        if (self::usesOwnKey($provider, $userId)) {
            $own = trim((string) (self::row($provider, $userId)?->fields()[$field] ?? ''));

            if ($own !== '') {
                return $own;
            }
        }

        $default = CredentialProviders::default($provider, $field);

        return $default === null || $default === '' ? null : (string) $default;
    }

    public static function configured(string $provider, ?int $userId = null): bool
    {
        return CredentialProviders::required($provider) !== [] && self::usesOwnKey($provider, $userId);
    }

    /**
     * ლიმიტი. `null` = ჭერი არ არის (ნაგულისხმევიც არ აქვს), `0` = ლიმიტი
     * გამორთულია — **ორი სხვადასხვა ფაქტია** და `Translator`/`SerpApiClient`
     * ისედაც ასე კითხულობს, ამიტომ `??` ჯაჭვში `0`-ს ვერ გამოვტოვებთ.
     *
     * ⚠️ პირადი ლიმიტი რიგიდან იკითხება მაშინაც, როცა გასაღები ჯერ არ წერია:
     * `limits` დაშიფრული არაა და ცალკე ფაქტია — „რა ჭერი დავიწესე".
     */
    public static function limit(string $provider, string $name, ?int $userId = null): ?int
    {
        $own = self::row($provider, $userId)?->limits[$name] ?? null;

        if ($own !== null && $own !== '') {
            return max(0, (int) $own);
        }

        $default = CredentialProviders::default($provider, $name);

        return $default === null || $default === '' ? null : max(0, (int) $default);
    }

    /**
     * **ვის ხარჯზე იწერება ეს გამოძახება** (§21.4 → §30).
     *
     * ⚠️ **ყოველთვის მომხმარებელზე** — საერთო გასაღები აღარ არსებობს, ე.ი.
     * „მთელი ინსტალაციის ჯამიც" აღარაფერს ნიშნავს: თითო ანგარიში თავის
     * გასაღებს და თავის ლიმიტს ითვლის. `null` — მომხმარებელი არ არის (CLI),
     * და მაშინ გასაღებიც არ არის, ე.ი. დასათვლელი არაფერია.
     */
    public static function quotaOwner(?int $userId = null): ?int
    {
        return self::currentUserId($userId);
    }

    /**
     * გასაღების მოკლე ანაბეჭდი ქეშის key-სთვის (§21.5).
     *
     * ⚠️ IGDB-ის Twitch-ტოკენი და SerpApi-ის `GET /account` **გასაღებზეა**
     * დამოკიდებული — საერთო ქეშის key ერთი მომხმარებლის ტოკენს მეორეს
     * დაუბრუნებდა და „რატომ 401" პასუხგაუცემელი დარჩებოდა. ⚠️ ძებნის
     * **შედეგის** ქეში კი საერთო რჩება: ის გასაღებზე არაა დამოკიდებული
     * და საზიარო ქეში კვოტას ზოგავს.
     */
    public static function fingerprint(string $provider, ?int $userId = null): string
    {
        $parts = [];

        foreach (array_keys(CredentialProviders::fields($provider)) as $field) {
            $parts[] = (string) self::value($provider, $field, $userId);
        }

        return substr(hash('sha256', implode('|', $parts)), 0, 16);
    }
}
