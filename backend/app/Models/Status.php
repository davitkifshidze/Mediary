<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Support\StatusDomain;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

/**
 * **სტატუსი — per-user ლექსიკონი (Tasks §6.2/§6.4).**
 *
 * ერთი ცხრილი ექვსივე დომენზე (`module` სვეტი ჭრის), და არა
 * `movie_statuses`/`video_statuses`/… — ექვსი იდენტური ცხრილი ექვს
 * კონტროლერს, ექვს პოლისსა და ექვს მიგრაციას ნიშნავდა, განსხვავება კი
 * მხოლოდ უცხო გასაღების სახელი იქნებოდა.
 *
 * ⚠️ **`key` არასდროს იცვლება** — გადარქმევა `name_*`-ს ეხება. სწორედ
 * `key` აკავშირებს მომხმარებლის ლექსიკონს კოდში ჩაწერილ ნაგულისხმევებთან
 * (`?view=watched`, `PurgeService::TARGET_STATUSES`, i18n-ის `status.*`),
 * ე.ი. მისი ცვლა ძველ ბმულებს გაწყვეტდა.
 *
 * ⚠️ **`role` არ არის „ფერი"** — სამი სერვისი *მნიშვნელობას* ეკითხება
 * (იხ. `StatusDomain`-ის დოკუმენტაცია). ამიტომ ის `null` ვერ იქნება.
 */
class Status extends Model
{
    use BelongsToUser;

    protected $guarded = ['id'];

    protected $casts = [
        'sort_order' => 'integer',
        'is_default' => 'boolean',
    ];

    /* ---------- აუდიტი ---------- */

    /**
     * ⚠️ ამ მოდელის მოდული **რიგშია და არა კლასში** — ერთი ცხრილი ექვს
     * მოდულს ემსახურება, ე.ი. `AuditRegistry::MODELS`-ის სტატიკური რუკა
     * მას ვერ უპასუხებდა (ლოგში ყველა სტატუსი ერთ ფსევდო-მოდულში
     * მოხვდებოდა და მოდულის ფილტრი მათ ვერ იპოვიდა).
     */
    public function auditModule(): string
    {
        return StatusDomain::usesDictionary($this->module)
            ? StatusDomain::module($this->module)
            : 'account';
    }

    /* ---------- სკოუპები ---------- */

    public function scopeForDomain(Builder $query, string $domain): Builder
    {
        return $query->where('module', $domain);
    }

    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('sort_order')->orderBy('id');
    }

    /* ---------- ლენივი დეფაულტები ---------- */

    /**
     * ამ user-ს ამ დომენზე ჯერ ერთი სტატუსიც არ აქვს → ნაკრები შეიქმნას.
     * ლენივი შევსება მიგრაციაზე საიმედოა (`VideoType::ensureDefaults()`-ის
     * წესი): ახალი ანგარიშიც და მოგვიანებით ჩართული მოდულიც ერთ გზას გადის.
     */
    public static function ensureDefaults(int $userId, string $domain): void
    {
        if (! StatusDomain::usesDictionary($domain)) {
            return;
        }

        $query = static::withoutGlobalScope('owner')->where('user_id', $userId)->where('module', $domain);

        if ((clone $query)->exists()) {
            return;
        }

        /* ⚠️ **query builder-ით და არა `create()`-ით.** საწყისი ნაკრები
           მანქანის დაწერილია და არა ადამიანის, ე.ი. აუდიტ-ლოგში არ უნდა
           მოხვდეს — თორემ ბიბლიოთეკის პირველივე გახსნა ლოგს ოცამდე
           „შექმნილია სტატუსი" რიგით ავსებდა და ნამდვილ ცვლილებებს ფარავდა. */
        $now = now();
        $rows = [];

        foreach (StatusDomain::defaults($domain) as $i => $status) {
            $rows[] = $status + [
                'user_id' => $userId,
                'module' => $domain,
                'is_default' => (bool) ($status['is_default'] ?? false),
                'icon' => $status['icon'] ?? null,
                'sort_order' => $i + 1,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        DB::table((new static)->getTable())->insert($rows);
    }

    /**
     * ამ user-ის ნაგულისხმევი სტატუსი — ახალი ჩანაწერი მას იღებს.
     * ⚠️ `is_default`-იანი წაშლილია → პირველი რიგი; სია ცარიელია → `null`
     * (სტატუსის გარეშე ჩანაწერიც კანონიერია, იხ. `HasStatus`).
     */
    public static function defaultFor(int $userId, string $domain): ?self
    {
        static::ensureDefaults($userId, $domain);

        $query = static::withoutGlobalScope('owner')
            ->where('user_id', $userId)
            ->where('module', $domain)
            ->ordered();

        return (clone $query)->where('is_default', true)->first() ?? $query->first();
    }

    /**
     * ვალიდაციის წესი ჩანაწერის `status` ველზე — **გასაღები ამ ანგარიშის
     * ლექსიკონში უნდა არსებობდეს**.
     *
     * ⚠️ `ensureDefaults()` აქვე ეშვება: ახალ ანგარიშზე ჯერ ერთი რიგიც არ
     * არსებობს, ე.ი. `status=watched` წესიერი მოთხოვნაც 422-ად დაბრუნდებოდა.
     */
    public static function rule(string $domain, ?int $userId = null): Exists
    {
        $userId ??= (int) Auth::id();
        static::ensureDefaults($userId, $domain);

        return Rule::exists('statuses', 'key')
            ->where('user_id', $userId)
            ->where('module', $domain);
    }

    /** ამ ანგარიშის გასაღებები ამ დომენზე (რიგის დაცვით) */
    public static function keysFor(int $userId, string $domain): array
    {
        static::ensureDefaults($userId, $domain);

        return static::withoutGlobalScope('owner')
            ->where('user_id', $userId)
            ->where('module', $domain)
            ->ordered()
            ->pluck('key')
            ->all();
    }

    /**
     * სახელიდან უნიკალური key — ლათინური slug, ქართულ სახელზეც მუშაობს.
     *
     * ⚠️ **`all`/`favorite`/`downloaded` დაკავებულია** (ეტაპი 8): ისინი
     * `?view=`-ის ფსევდო-განყოფილებებია. „Favorite" სახელის სტატუსი
     * `favorite` გასაღებს რომ მიეღო, მისი სექცია რჩეულებს გაიხსნიდა, და
     * საიდბარის განლაგებაში ორი რიგი ერთ id-ს იკავებდა.
     */
    public static function makeKey(int $userId, string $domain, string $name): string
    {
        $base = Str::slug($name) ?: 'status';
        $key = $base;
        $n = 2;

        while (in_array($key, StatusDomain::RESERVED_KEYS, true) || static::withoutGlobalScope('owner')
            ->where('user_id', $userId)->where('module', $domain)->where('key', $key)->exists()) {
            $key = "{$base}-{$n}";
            $n++;
        }

        return mb_substr($key, 0, 60);
    }
}
