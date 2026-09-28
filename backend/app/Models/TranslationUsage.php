<?php

namespace App\Models;

use App\Support\AppTime;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **ერთი გარე თარგმანის გამოძახება** (შენი მითითება, 2026-09-14).
 *
 * ⚠️ **`BelongsToUser` განზრახ არ გამოიყენება** — `user_id` აქ „ვინ დახარჯა"
 * არის და არა „ვისია ეს ჩანაწერი" (`SerpSearch`/`AuditLog`-ის ზუსტი
 * პრეცედენტი), და მრიცხველი მას ცხადად, `CredentialStore::quotaOwner()`-ით
 * ირჩევს — ფონურ სამუშაოსა და ტესტში `Auth::id()` შეიძლება სხვა იყოს.
 *
 * ⚠️ **ლიმიტი მომხმარებლისაა (Tasks §30)**: გასაღები ყველას თავისი აქვს, ე.ი.
 * „მთელი ინსტალაციის ჯამი" აღარაფერს ნიშნავს — სხვისი თარგმანი ჩემს კვოტას
 * არ ხარჯავს, რადგან Google-ს ჩემი გასაღები საერთოდ არ უნახავს.
 */
class TranslationUsage extends Model
{
    use MassPrunable;

    public const PROVIDER_GEMINI = 'gemini';

    /**
     * რამდენი თვე ვინახავთ (Tasks DEBT-24).
     *
     * ⚠️ **ლიმიტის ფანჯარა ერთი დღეა** (`usedToday`) და RPM — ერთი წუთი,
     * ე.ი. სამი თვის იქით რიგი მხოლოდ ისტორიაა. `serp_searches`-ის იგივე
     * ვადა, რადგან ორივე ერთსა და იმავე კითხვას პასუხობს.
     */
    public const KEEP_MONTHS = 3;

    /**
     * ⚠️ **წყნარი ოკეანის დრო და არა UTC.** Gemini-ის უფასო დონის დღიური
     * ლიმიტი **Pacific-ის შუაღამეზე** ნულდება — ეს Google-ის დოკუმენტირებული
     * ქცევაა. UTC-ით დათვლა მრიცხველს დღეში 7–8 საათით აცდენდა და „დარჩა 900"
     * ხან სიმართლე იქნებოდა, ხან — სრული ტყუილი.
     */
    public const QUOTA_TIMEZONE = 'America/Los_Angeles';

    protected $fillable = [
        'user_id',
        'provider',
        'model',
        'target_lang',
        'context',
        'chars',
        'ok',
        'error',
    ];

    protected function casts(): array
    {
        return [
            'chars' => 'integer',
            'ok' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** მიმდინარე კვოტის დღის დასაწყისი (UTC-ში გადაყვანილი) */
    public static function dayStart(): CarbonImmutable
    {
        /* ⚠️ ფანჯარა Pacific-ისაა (Google-ის ლიმიტი), **ნორმალიზება კი
           აპლიკაციის ზონისა** (Tasks §8): `created_at` ამ ზონით იწერება და
           იკითხება, ე.ი. `->utc()` შედარებას 4 საათით ააცდენდა. */
        return CarbonImmutable::now(self::QUOTA_TIMEZONE)->startOfDay()->setTimezone(AppTime::zone());
    }

    /**
     * ამ მომხმარებლის დღევანდელი გამოძახებები.
     *
     * ⚠️ **საერთო შტო აღარ არსებობს (Tasks §30).** აქამდე `null` „მთელ
     * ინსტალაციას" ნიშნავდა (საერთო `.env` გასაღები) — ახლა ის ნიშნავს,
     * რომ მომხმარებელი არ არის (CLI), ე.ი. გასაღებიც არ არის და დასათვლელი
     * არაფერია. `0` და არა „ყველასი": სხვისი ხარჯის ჩათვლა ჩემს ლიმიტს
     * ტყუილად ამოწურავდა.
     */
    public static function usedToday(?int $userId, string $provider = self::PROVIDER_GEMINI): int
    {
        if ($userId === null) {
            return 0;
        }

        return static::where('provider', $provider)
            ->where('user_id', $userId)
            ->where('created_at', '>=', self::dayStart())
            ->count();
    }

    /** ბოლო წუთში გასული გამოძახებები — უფასო დონეზე RPM-იც ლიმიტია */
    public static function usedThisMinute(?int $userId, string $provider = self::PROVIDER_GEMINI): int
    {
        if ($userId === null) {
            return 0;
        }

        return static::where('provider', $provider)
            ->where('user_id', $userId)
            ->where('created_at', '>=', CarbonImmutable::now()->subMinute())
            ->count();
    }

    /**
     * ⚠️ **`MassPrunable`** — ერთი query, მოვლენების გარეშე: მოდელი
     * `AuditRegistry::NOT_LOGGED`-შია და ათასობით ობიექტის ჩატვირთვა
     * მხოლოდ წასაშლელად ფუჭი ხარჯია.
     *
     * ⚠️ ზღვარი `AppTime`-იდან მოდის და არა `CarbonImmutable::now()`-იდან:
     * `created_at` აპლიკაციის ზონაშია ჩაწერილი (§8) და ამ ფაილის
     * `QUOTA_TIMEZONE` აქ არ მოქმედებს — ის Google-ის ლიმიტის ფანჯარაა.
     */
    public function prunable(): Builder
    {
        return static::where('created_at', '<', AppTime::now()->subMonths(self::KEEP_MONTHS));
    }
}
