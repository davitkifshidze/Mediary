<?php

namespace App\Support;

use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Support\Facades\Schema;
use WeakMap;

/**
 * **ინსტალაციის პარამეტრები — ერთი მკითხველი (Tasks §34.1).**
 *
 * „ყველასთვის მოქმედი და სუპერადმინის მიერ ცვლადი" მნიშვნელობა აქამდე
 * არსად ეტეოდა: `config`/`.env` სერვერის ფაილია (ინტერფეისიდან ვერ იცვლება),
 * `users.settings` კი ერთი ანგარიშისაა. ახლა ორი მომხმარებელი ჰყავს —
 * ატვირთვის ლიმიტები (`UploadLimits`) და ურნის ზედა ზღვარი (`TrashDomain`).
 *
 * ⚠️ **ნაგულისხმევი გამომძახებლისაა და აქ არ ინახება**: `get($key, $default)`
 * შენახულს აბრუნებს, თუ არ არის — გამომძახებლის `config`-ს ან კოდის მუდმივას.
 * ასე ნაგულისხმევი კოდთან ერთად ვითარდება და ბაზაში **მხოლოდ ცვლილება** დევს.
 *
 * ⚠️ **ქეში მოთხოვნის ფარგლებშია — გასაღები მიმდინარე `Request`-ია**
 * (`PublicGallery::remember()`-ის წესი, PERF-15-ის გაკვეთილი). სტატიკური
 * ველი ტესტებში და Octane-ზე მომდევნო მოთხოვნაზე გადავიდოდა, ე.ი. ლიმიტის
 * შეცვლა მეორე მოთხოვნამდე არ იმოქმედებდა. ერთი მოთხოვნა კი ყველა გასაღებს
 * **ერთი query-ით** კითხულობს (`all()`), და ჩაწერა ქეშს თვითონ ასუფთავებს.
 *
 * ⚠️ **ხანგრძლივი worker-ი (queue) ერთსა და იმავე `Request`-ს ხედავს**, ე.ი.
 * ქეში მის სიცოცხლეში არ განახლდება. დღეს არც ერთი job ამ პარამეტრებს არ
 * კითხულობს; თუ ოდესმე დაიწყებს, `flush()` job-ის დასაწყისში უნდა დაიძახოს.
 *
 * ⚠️ **`$tableExists` მხოლოდ `true`-ს იმახსოვრებს** (`AuditLogger`-ისა და
 * `Notifier`-ის ცოცხალი გაკვეთილი): მიგრაციამდე დასმული კითხვა ნაგულისხმევს
 * იღებს და არა 500-ს, `false`-ის დამახსოვრება კი მექანიზმს მთელი პროცესისთვის
 * თიშავდა.
 */
final class AppSettings
{
    /** @var WeakMap<object, array<string, mixed>>|null */
    private static ?WeakMap $memo = null;

    private static bool $tableExists = false;

    /** CLI-ში `request` თუ არ არის მიბმული — ერთი საერთო გასაღები */
    private static ?object $fallbackScope = null;

    /** შენახული მნიშვნელობა, ან გამომძახებლის ნაგულისხმევი */
    public static function get(string $key, mixed $default = null): mixed
    {
        $all = self::all();

        return array_key_exists($key, $all) ? $all[$key] : $default;
    }

    /** არის თუ არა ეს გასაღები **შეცვლილი** (ბაზაში ჩაწერილი) */
    public static function has(string $key): bool
    {
        return array_key_exists($key, self::all());
    }

    /**
     * ჩაწერა. ⚠️ **მოდელით და არა `DB::table()`-ით** — ცვლილება
     * `AuditObserver`-მა უნდა დაინახოს („ვინ შეცვალა ლიმიტი").
     */
    public static function put(string $key, mixed $value, ?User $by = null): void
    {
        $row = AppSetting::firstOrNew(['key' => $key]);
        $row->value = $value;
        $row->updated_by = $by?->getKey();
        $row->save();

        self::flush();
    }

    /** ნაგულისხმევზე დაბრუნება — რიგი იშლება, ე.ი. `get()` ისევ `config`-ს აბრუნებს */
    public static function forget(string $key): void
    {
        AppSetting::where('key', $key)->first()?->delete();

        self::flush();
    }

    /**
     * ყველა შენახული პარამეტრი — **ერთი query მოთხოვნაზე**.
     *
     * @return array<string, mixed>
     */
    public static function all(): array
    {
        if (! self::tableExists()) {
            return [];
        }

        self::$memo ??= new WeakMap;
        $scope = self::scope();

        if (! isset(self::$memo[$scope])) {
            self::$memo[$scope] = AppSetting::query()
                ->get(['key', 'value'])
                ->mapWithKeys(fn (AppSetting $row) => [$row->key => $row->value])
                ->all();
        }

        return self::$memo[$scope];
    }

    /** ქეშის გასუფთავება — ჩაწერის შემდეგ და ტესტებს შორის */
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

    private static function tableExists(): bool
    {
        if (self::$tableExists) {
            return true;
        }

        return self::$tableExists = Schema::hasTable('app_settings');
    }
}
