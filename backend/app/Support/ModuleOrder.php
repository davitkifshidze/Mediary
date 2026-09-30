<?php

namespace App\Support;

use App\Models\Module;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * **მოდულების რიგი — თითო მომხმარებელზე** (Tasks §36, Q27).
 *
 * ორი ფენაა და ორივე ერთ ადგილას იკითხება:
 *  - **პირადი რიგი** — `users.settings.module_order`, გასაღებების სია
 *    (`/modules`-ზე drag & drop-ით ან ისრებით იწერება);
 *  - **საერთო რიგი** — `modules.sort_order`, სუპერადმინის „ეს რიგი
 *    ყველასთვის ნაგულისხმევად". ვისაც პირადი ჯერ არ აქვს (ახალი ანგარიშიც),
 *    ამას მიჰყვება.
 *
 * ⚠️ **მიგრაციის გარეშე და `module_user`-ში არა**: pivot-ის რიგი ყველა
 * მოდულზე არ არსებობს (super_admin-ს მოდული pivot-ის გარეშეც აქვს, ჯერ
 * ჩაურთველი მოდული კი `/modules`-ზე მაინც ჩანს), ე.ი. რიგის ნაწილი ჩუმად
 * იკარგებოდა.
 *
 * ⚠️ **რიგში არმყოფი მოდული ბოლოს დგება და არ იკარგება** — მოგვიანებით
 * ჩართული, ადმინის მიერ გააქტიურებული ან §37-ით შექმნილი; მათ შორის კი
 * საერთო რიგია. ე.ი. სია არასდროს „მოკლდება" იმის გამო, რომ ძველ
 * რიგში მოდული არ ეწერა.
 *
 * ⚠️ **ამ გასაღებს საკუთარი ჩამწერი აქვს და `PUT /auth/settings` მას ვერ
 * ცვლის** (`preserve()`): SPA-ს `SettingsProvider` შესვლისას მთელ ბლობს
 * ინახავს და შენახვისას **მთლიანად** უკან წერს, ე.ი. მასში შესვლის
 * მომენტის რიგი იჯდა — `/settings`-ზე ნებისმიერი შენახვა მას შემდეგ
 * გადალაგებულ რიგს ჩუმად დააბრუნებდა.
 */
final class ModuleOrder
{
    /** `users.settings`-ის გასაღები */
    public const SETTING = 'module_order';

    /** სიის ჭერი — მოდული ათეულობითაა, ეს მხოლოდ JSON-ის ზომის დაცვაა */
    public const MAX_KEYS = 200;

    /**
     * პირადი რიგი — მხოლოდ სტრიქონები, გამეორების გარეშე.
     *
     * ⚠️ `PUT /auth/settings` ბლობს ტიპის გარეშე იღებდა, ე.ი. ძველ ბაზაში
     * აქ ნებისმიერი რამ შეიძლება იდოს — ცუდი მნიშვნელობა „პირადი რიგი არ
     * არის"-ად იკითხება და არა შეცდომად.
     *
     * @return list<string>
     */
    public static function of(?User $user): array
    {
        $raw = $user ? data_get($user->settings, self::SETTING) : null;

        if (! is_array($raw)) {
            return [];
        }

        $keys = [];
        foreach ($raw as $key) {
            if (is_string($key) && $key !== '' && ! in_array($key, $keys, true)) {
                $keys[] = $key;
            }
        }

        return $keys;
    }

    /** აქვს თუ არა პირადი რიგი (თუნდაც საერთოს ემთხვეოდეს) */
    public static function isCustom(?User $user): bool
    {
        return self::of($user) !== [];
    }

    /**
     * მოდულების დალაგება ამ მომხმარებლის რიგით.
     *
     * ⚠️ **ერთი ფუნქცია ყველა სიისთვის** — `GET /modules` (საიდბარი და
     * `/modules`), `GET /dashboard` (მთავარის ბარათები) და ადმინის სია.
     * ცალ-ცალკე დაწერილი ერთ ადგილას საერთო რიგს დატოვებდა და ბარათები
     * მენიუს სხვა რიგით დაიხატებოდა — სწორედ ის, რასაც §36.2 ასწორებს.
     *
     * @param  Collection<int, Module>  $modules
     * @return Collection<int, Module>
     */
    public static function sort(Collection $modules, ?User $user): Collection
    {
        $rank = array_flip(self::of($user));

        return $modules
            ->sortBy([
                fn (Module $a, Module $b) => ($rank[$a->key] ?? PHP_INT_MAX) <=> ($rank[$b->key] ?? PHP_INT_MAX),
                // რიგს გარეთ დარჩენილები — საერთო რიგით
                fn (Module $a, Module $b) => [(int) $a->sort_order, (int) $a->id] <=> [(int) $b->sort_order, (int) $b->id],
            ])
            ->values();
    }

    /**
     * ვის რომელი მოდულის გასაღები შეუძლია რიგში ჩაწეროს — ზუსტად ის, რასაც
     * `/modules`-ზე ხედავს: აქტიური მოდულები, სუპერადმინს კი გამორთულებიც
     * (მისი სია `/admin/modules`-ზე დგას).
     *
     * ⚠️ **§37-ის წინაპირობა**: პირადი მოდული სხვისთვის არ ჩანს და მისი
     * არსებობა თავად ინფორმაციაა — ყველა გასაღებზე შემოწმება კი `200`/`422`-ის
     * სხვაობით სწორედ ამას გაამხელდა.
     *
     * @return list<string>
     */
    public static function visibleKeys(User $user): array
    {
        /* ⚠️ §37 — საკუთარი პირადი მოდული **ყოველთვის** ჩანს (გამორთულიც —
           `/modules`-ზე ის „ადმინმა გამორთო"-თი დგას), სხვისი კი **არასდროს**,
           სუპერადმინისთვისაც: მისი ზედამხედველობის სია ცალკეა (37.8). */
        return Module::query()
            ->where(fn ($q) => $q
                ->where(fn ($base) => $base->whereNull('owner_id')
                    ->when(! $user->isSuperAdmin(), fn ($active) => $active->where('is_active', true)))
                ->orWhere('owner_id', $user->getKey()))
            ->pluck('key')
            ->all();
    }

    /**
     * პირადი რიგის ჩაწერა.
     *
     * ⚠️ **უცნობი გასაღები ჩუმად იშლება და `422` არ არის** — ველების
     * კონსტრუქტორის წესი (`PUT /modules/{key}/fields`): მოდული ნებისმიერ
     * დროს შეიძლება გამოირთოს, ე.ი. გვერდის ჩატვირთვასა და გადათრევას შორის
     * გამქრალი მოდულის გამო გადალაგება არ უნდა ჩავარდეს.
     *
     * @param  list<string>  $keys
     * @return list<string> რაც მართლა ჩაიწერა
     */
    public static function save(User $user, array $keys): array
    {
        $visible = array_flip(self::visibleKeys($user));
        $clean = [];

        foreach ($keys as $key) {
            if (isset($visible[$key]) && ! in_array($key, $clean, true)) {
                $clean[] = $key;
            }
        }

        self::write($user, $clean === [] ? null : $clean);

        return $clean;
    }

    /** პირადი რიგის წაშლა — საერთო რიგზე დაბრუნება */
    public static function forget(User $user): void
    {
        self::write($user, null);
    }

    /**
     * **`PUT /auth/settings`-ის ბლობში ეს გასაღები სერვერისაა.**
     *
     * მოსული მნიშვნელობა იგნორირდება და ბაზაში მდგარი რჩება (ან არ იწერება,
     * თუ ჯერ არ არსებობს). იხ. კლასის შენიშვნა — SPA-ს ასლი შესვლის
     * მომენტისაა.
     *
     * @param  array<string, mixed>  $incoming
     * @return array<string, mixed>
     */
    public static function preserve(User $user, array $incoming): array
    {
        unset($incoming[self::SETTING]);

        $stored = self::of($user);
        if ($stored !== []) {
            $incoming[self::SETTING] = $stored;
        }

        return $incoming;
    }

    /**
     * საერთო რიგის ახალი სია: ჩამოთვლილები თავიანთი რიგით, დანარჩენები
     * მათ შემდეგ, არსებული საერთო რიგით.
     *
     * @param  list<string>  $keys
     * @param  list<string>  $current  ყველა მოდული, ამჟამინდელი საერთო რიგით
     * @return list<string>
     */
    public static function merged(array $keys, array $current): array
    {
        return array_values(array_unique([...array_values(array_intersect($keys, $current)), ...$current]));
    }

    /**
     * ⚠️ **`saveQuietly()` — ლოგის გარეშე, განზრახ.** რიგი ინტერფეისის
     * არჩევანია და არა მონაცემი: სტატუსებისა და ლექსიკონების გადალაგებაც
     * (`POST …/reorder`) query builder-ით იწერება და აუდიტ-ლოგში არ ჩანს.
     * ყოველი გადათრევა `settings`-ის სრულ ძველ/ახალ ბლობს ჩაწერდა ლოგში.
     */
    private static function write(User $user, ?array $order): void
    {
        $settings = is_array($user->settings) ? $user->settings : [];

        if ($order === null) {
            if (! array_key_exists(self::SETTING, $settings)) {
                return;
            }
            unset($settings[self::SETTING]);
        } else {
            $settings[self::SETTING] = $order;
        }

        $user->forceFill(['settings' => $settings])->saveQuietly();
    }
}
