<?php

namespace App\Support;

use App\Models\Module;
use App\Models\User;
use Illuminate\Support\Collection;
use WeakMap;

/**
 * **ინტერფეისიდან შექმნილი (პირადი) მოდულები — ერთი რეესტრი (Tasks §37).**
 *
 * საბაზისო ცამეტი მოდული კოდია: თითოს თავისი ცხრილი, კონტროლერი და გვერდი
 * აქვს. პირადი მოდული კი **ჩანაწერია** — `modules` რიგი `owner_id`-ით და
 * `definition`-ით, რომლის ჩანაწერები ერთ საერთო ცხრილშია (`custom_records`).
 * ყველა რეესტრი, რომელსაც „ეს მოდული ვისია / რა ცხრილია / რა სტატუსებით
 * იწყება" სჭირდება, აქ ეკითხება — და არა `Module::whereNotNull('owner_id')`-ს
 * ოცდაათ ადგილას.
 *
 * ⚠️ **გასაღები გლობალურად უნიკალურია და მფლობელის პრეფიქსს ატარებს**
 * (`c{ownerId}-{slug}`): ორ ადამიანს ერთი სახელის („რეცეპტები") მოდული
 * შეიძლება ჰქონდეს, `modules.key` კი ერთია ყველასთვის. პრეფიქსი საბაზისო
 * გასაღებს ვერასდროს დაემთხვევა (`c` + ციფრები + `-` — ასეთი სიტყვა
 * საბაზისო სიაში არ არის), ე.ი. `isKey()` ბაზას არ ეკითხება.
 *
 * ⚠️ **გასაღები ≤ 32 სიმბოლოა** — ყველაზე ვიწრო სვეტი, სადაც ის იწერება,
 * `statuses.module`-ია (`varchar(32)`).
 *
 * ⚠️ **სხვისი პირადი მოდული „არ არსებობს"** — ყველა კარი, სადაც მოდულის
 * გასაღები სერვერამდე აღწევს, მას 404-ით პასუხობს (Q28: ფაქტი, რომ
 * არსებობს, თავად ინფორმაციაა). სუპერადმინისთვისაც: მისი ზედამხედველობა
 * (37.8) აგრეგატებია და არა შიგთავსი.
 *
 * ⚠️ **ქეში მოთხოვნის ფარგლებშია** (`AppSettings`-ის ფორმა, PERF-15-ის
 * გაკვეთილი): სტატიკური ველი ტესტებსა და Octane-ზე მომდევნო მოთხოვნაზე
 * გადავიდოდა — ახლად შექმნილი მოდული „არ იარსებებდა" შემდეგ რექვესთამდე.
 * ჩაწერა (`flush()`) მას თვითონ ასუფთავებს.
 */
final class CustomModules
{
    /** გასაღების რეგულარული გამოსახულება — მარშრუტის `where()`-იც ამას კითხულობს */
    public const PATTERN = 'c[0-9]+-[a-z0-9-]+';

    /** `statuses.module` — `varchar(32)` */
    public const MAX_KEY = 32;

    /** ერთ ანგარიშზე — ფორმის და მენიუს დაცვა უსასრულო ზრდისგან */
    public const MAX_PER_USER = 20;

    /** საცავის ფესვი — ყველა პირადი მოდული ერთ ფესვშია (`custom/{key}/…`) */
    public const ROOT = 'custom';

    /** ჩანაწერების ცხრილი */
    public const TABLE = 'custom_records';

    /** დამატებითი ველების მნიშვნელობები — ერთი ცხრილი ყველა პირად მოდულზე */
    public const VALUES_TABLE = 'custom_record_field_values';

    /**
     * კლასიფიკაციის სახე — **სახელია და არა მექანიზმი**: სამივე ერთი და იგივე
     * ზოგადი კლასიფიკატორია (`custom_categories`), მხოლოდ ნაგულისხმევი
     * ლეიბლი განსხვავდება („ჟანრი" · „ტიპი" · „კატეგორია"). `null` —
     * კლასიფიკაცია საერთოდ არ აქვს.
     */
    public const CLASSIFICATIONS = ['category', 'genre', 'type'];

    /** სტატუსების საწყისი ნაკრები — „ნაგულისხმევი" ან ცარიელი (37.2) */
    public const STATUS_PRESETS = ['default', 'none'];

    /**
     * ნაგულისხმევი სტატუსები — სამი როლი, სამი სახელი.
     *
     * ⚠️ `role` სავალდებულოა და არა დეკორაცია (`StatusDomain`-ის წესი):
     * დამთხვევა, მასობრივი წაშლა და წლის მიზანი მნიშვნელობას კითხულობენ.
     *
     * @var list<array<string, mixed>>
     */
    public const DEFAULT_STATUSES = [
        ['key' => 'planned', 'name_ka' => 'დაგეგმილი', 'name_en' => 'Planned', 'role' => 'todo', 'icon' => 'Clock', 'is_default' => true],
        ['key' => 'in_progress', 'name_ka' => 'მიმდინარე', 'name_en' => 'In progress', 'role' => 'doing', 'icon' => 'Play'],
        ['key' => 'done', 'name_ka' => 'დასრულებული', 'name_en' => 'Done', 'role' => 'done', 'icon' => 'CheckCheck'],
    ];

    /** @var WeakMap<object, Collection<string, Module>>|null */
    private static ?WeakMap $memo = null;

    private static ?object $fallbackScope = null;

    /** პირადი მოდულის გასაღებია? — ბაზის გარეშე, ფორმით */
    public static function isKey(?string $key): bool
    {
        return is_string($key) && strlen($key) <= self::MAX_KEY && preg_match('/^'.self::PATTERN.'$/', $key) === 1;
    }

    /**
     * ყველა პირადი მოდული (ურნაში მყოფის გარდა), გასაღებით.
     *
     * ⚠️ **გამორთულიც** (`is_active = false`) — მფლობელს ის „ადმინმა
     * გამორთო"-თი უნდა დაუჩანდეს (37.8), რეესტრებს კი ჩანაწერები ისევ
     * უნდა ახსოვდეთ (საცავი, ანგარიშის წაშლა).
     *
     * @return Collection<string, Module>
     */
    public static function all(): Collection
    {
        self::$memo ??= new WeakMap;
        $scope = self::scope();

        if (! isset(self::$memo[$scope])) {
            self::$memo[$scope] = Module::query()
                ->whereNotNull('owner_id')
                ->orderBy('id')
                ->get()
                ->keyBy('key');
        }

        return self::$memo[$scope];
    }

    /** @return list<string> */
    public static function keys(): array
    {
        return self::all()->keys()->all();
    }

    public static function find(?string $key): ?Module
    {
        return self::isKey($key) ? self::all()->get($key) : null;
    }

    public static function exists(?string $key): bool
    {
        return self::find($key) !== null;
    }

    /** ამ ანგარიშის პირადი მოდულია? — ერთადერთი კითხვა, რომელსაც ყველა კარი სვამს */
    public static function owns(?User $user, ?string $key): bool
    {
        $module = self::find($key);

        return $user !== null && $module !== null && (int) $module->owner_id === (int) $user->getKey();
    }

    /**
     * ამ ანგარიშის პირადი მოდულები.
     *
     * @return Collection<string, Module>
     */
    public static function of(User $user): Collection
    {
        return self::all()->filter(fn (Module $m) => (int) $m->owner_id === (int) $user->getKey());
    }

    /**
     * გასაღები სახელიდან — `c{ownerId}-{slug}`.
     *
     * ⚠️ **ჭრა პრეფიქსის ადგილს უთმობს** (`DictionaryKey`-ის წესი): ჯერ
     * ბაზისი იჭრება ისე, რომ პრეფიქსი დაეტიოს, და მხოლოდ მერე მოწმდება —
     * ე.ი. `$taken()`-ს ზუსტად ის გასაღები მიეწოდება, რაც ჩაიწერება.
     *
     * ⚠️ **ურნაში მყოფი მოდულის გასაღებიც დაკავებულია**: `modules.key`
     * unique-ია და ურნაში რიგი ადგილზე რჩება.
     */
    public static function makeKey(int $ownerId, string $name): string
    {
        $prefix = 'c'.$ownerId.'-';

        $slug = DictionaryKey::make(
            $name,
            fn (string $candidate) => Module::withoutGlobalScope('trash')->where('key', $prefix.$candidate)->exists(),
            'module',
            max: self::MAX_KEY - strlen($prefix),
        );

        return $prefix.$slug;
    }

    /**
     * მოდულის სტრუქტურა — `definition` JSON, უცნობი მნიშვნელობა ნაგულისხმევად.
     *
     * @return array{classification: ?string, statuses: string}
     */
    public static function definition(Module|string|null $module): array
    {
        $module = is_string($module) ? self::find($module) : $module;
        $raw = is_array($module?->definition) ? $module->definition : [];

        $classification = $raw['classification'] ?? null;
        $statuses = $raw['statuses'] ?? 'default';

        return [
            'classification' => in_array($classification, self::CLASSIFICATIONS, true) ? $classification : null,
            'statuses' => in_array($statuses, self::STATUS_PRESETS, true) ? $statuses : 'default',
        ];
    }

    /** აქვს თუ არა კლასიფიკაცია — ფორმა, ფილტრი და ვალიდაცია ამას ეკითხება */
    public static function classifies(string $key): bool
    {
        return self::definition($key)['classification'] !== null;
    }

    /**
     * სტატუსების საწყისი ნაკრები — `Status::ensureDefaults()`-ისთვის.
     *
     * ⚠️ **„ცარიელი" ნაკრები ცარიელ სიას აბრუნებს**, და `ensureDefaults()`
     * მაშინ არაფერს წერს — მომხმარებელი სტატუსებს კლასიფიკატორის გვერდზე
     * თვითონ დაამატებს.
     *
     * @return list<array<string, mixed>>
     */
    public static function statusDefaults(string $key): array
    {
        return self::definition($key)['statuses'] === 'none' ? [] : self::DEFAULT_STATUSES;
    }

    /** საცავის საქაღალდე — `custom/{key}/{sub}` */
    public static function folder(string $key, string $sub): string
    {
        return self::ROOT.'/'.$key.'/'.$sub;
    }

    /** ქეშის გასუფთავება — შექმნის/წაშლის შემდეგ და ტესტებს შორის */
    public static function flush(): void
    {
        self::$memo = null;
    }

    private static function scope(): object
    {
        if (app()->bound('request')) {
            return app('request');
        }

        return self::$fallbackScope ??= new \stdClass;
    }
}
