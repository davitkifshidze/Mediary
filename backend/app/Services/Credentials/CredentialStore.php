<?php

namespace App\Services\Credentials;

use App\Models\UserCredential;
use App\Support\CredentialProviders;
use Illuminate\Support\Facades\Auth;

/**
 * **გარე წყაროს გასაღების ერთადერთი წასაკითხი წერტილი** (Tasks §21).
 *
 * შვიდივე კლიენტი (`TmdbClient`, `Translator`, `RawgClient`, `IgdbClient`,
 * `SerpApiClient`, `SerperImages`, `VideoMetadata`) `config('services.*')`-ს
 * აღარ კითხულობს — მას აქედან იღებს. ეს `StorageMeter`-ის იგივე წესია:
 * ერთი შესვლა-გამოსვლა, თორემ მეორე გზა მრიცხველს ჩუმად აცდენს.
 *
 * ## სამი მდგომარეობა და არა ორი
 *
 *   `user`   — ჩემი გასაღებია ჩადებული და ჩართულია
 *   `shared` — ჩემი არაა, მაგრამ ინსტალაციას (`.env`) აქვს
 *   `none`   — არსად არაა (endpoint 503-ს აბრუნებს, როგორც აქამდე)
 *
 * ⚠️ **`shared` განზრახ დარჩა.** დღევანდელი ინსტალაცია ერთმომხმარებლიანია
 * და ყველა გასაღები `.env`-შია — მისი უბრალოდ წაშლა ყველა წყაროს ერთ
 * წამში გათიშავდა. ამიტომ `.env` „ინსტალაციის ნაგულისხმევია", ხოლო ვინც
 * თავისას ჩადებს, თავისით მუშაობს.
 *
 * ⚠️ **„ჩემი გასაღები" `required` ველებით წყდება და არა ნებისმიერით.**
 * Gemini-ს ორი ველი აქვს — `key` (სავალდებულო) და `model` (არა). მხოლოდ
 * მოდელის ჩაწერა „ჩემს გასაღებს" არ ნიშნავს: გამოძახება მაინც საერთო
 * გასაღებით წავიდოდა, კვოტა კი ჩემს რიგებზე დაითვლებოდა — ე.ი. ორივე
 * მრიცხველი მოტყუვდებოდა. IGDB-ს იგივე მიზეზით **ორივე** ველი უნდა ჰქონდეს.
 *
 * ⚠️ **ცალკეული ველი მაინც ეცემა საერთოზე.** ჩემი გასაღები + ცარიელი
 * `model` = ჩემი გასაღები და ინსტალაციის ნაგულისხმევი მოდელი. სხვაგვარად
 * გასაღების ჩაწერა მოდელს ჩუმად ცარიელს დატოვებდა და თარგმანი დაიშლებოდა.
 *
 * ⚠️ **CLI-ს `Auth::id()` არ აქვს** → იქ ყოველთვის საერთო გასაღებია. ეს
 * `BelongsToUser`-ის დღევანდელი, ცნობილი ქცევაა (`media:redownload --user=`)
 * და არა ახალი გამონაკლისი; ამიტომ `$userId`-ს ცხადადაც იღებს — ფონური
 * სამუშაო (`RunBatchItem`, რომელიც `Auth::setUser()`-ს აკეთებს) მუშაობს.
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

    /** ქეშის ჩამოყრა — შენახვის/წაშლის შემდეგ და ტესტებში */
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
     * ⚠️ ეს ერთადერთი პრედიკატია, რომელზეც კვოტის დათვლა დგას (§21.4) —
     * ორი ასლი ორ სხვადასხვა პასუხს გასცემდა.
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

    /** `user` | `shared` | `none` — ინტერფეისისთვის და დიაგნოსტიკისთვის */
    public static function source(string $provider, ?int $userId = null): string
    {
        if (self::usesOwnKey($provider, $userId)) {
            return 'user';
        }

        foreach (CredentialProviders::required($provider) as $name) {
            if (trim((string) CredentialProviders::shared($provider, $name)) === '') {
                return 'none';
            }
        }

        return 'shared';
    }

    /** გასაღები/ველი. `null` — არსად არაა (endpoint 503-ს აბრუნებს) */
    public static function value(string $provider, string $field = 'key', ?int $userId = null): ?string
    {
        if (self::usesOwnKey($provider, $userId)) {
            $own = trim((string) (self::row($provider, $userId)?->fields()[$field] ?? ''));

            if ($own !== '') {
                return $own;
            }
        }

        $shared = trim((string) CredentialProviders::shared($provider, $field));

        return $shared === '' ? null : $shared;
    }

    public static function configured(string $provider, ?int $userId = null): bool
    {
        foreach (CredentialProviders::required($provider) as $name) {
            if (self::value($provider, $name, $userId) === null) {
                return false;
            }
        }

        return CredentialProviders::required($provider) !== [];
    }

    /**
     * ლიმიტი. `null` = ჭერი არ დაგვიწესებია, `0` = ლიმიტი გამორთულია —
     * **ორი სხვადასხვა ფაქტია** და `Translator`/`SerpApiClient` ისედაც ასე
     * კითხულობს, ამიტომ `??` ჯაჭვში `0`-ს ვერ გამოვტოვებთ.
     */
    public static function limit(string $provider, string $name, ?int $userId = null): ?int
    {
        if (self::usesOwnKey($provider, $userId)) {
            $own = self::row($provider, $userId)?->limits[$name] ?? null;

            if ($own !== null && $own !== '') {
                return max(0, (int) $own);
            }
        }

        $shared = CredentialProviders::shared($provider, $name);

        return $shared === null || $shared === '' ? null : max(0, (int) $shared);
    }

    /**
     * **ვის ხარჯზე იწერება ეს გამოძახება** (§21.4).
     *
     * თავისი გასაღებით — ჩემი id, ე.ი. მრიცხველი მხოლოდ ჩემს რიგებს ითვლის
     * და ჩემს ლიმიტს ამოწმებს. საერთო გასაღებით — `null`, ე.ი. ძველებურად
     * მთელი ინსტალაციის ჯამი (ზუსტად ის, რასაც `TranslationUsage`-ისა და
     * `SerpSearch`-ის დოკბლოკები აღწერენ: „ლიმიტი ანგარიშისაა").
     *
     * ⚠️ ამის გარეშე მთელი თასქი ტყუილია: თავისი გასაღები + საერთო
     * მრიცხველი ნიშნავს, რომ სხვისმა თარგმანმა შენი კვოტა შეიძლება
     * ამოწუროს, თუმცა შენი გასაღები ხელუხლებელია.
     */
    public static function quotaOwner(string $provider, ?int $userId = null): ?int
    {
        return self::usesOwnKey($provider, $userId) ? self::currentUserId($userId) : null;
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
