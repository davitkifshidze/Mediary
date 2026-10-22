<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use App\Support\AppTime;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * **მორიგეობის რიტმი** — „112 · 24 სთ · ყოველ 4 დღეში 1 ოქტომბრიდან · 09:00".
 *
 * რიტმი თვითონ კალენდარზე არაფერს ხატავს: „გაგრძელება"
 * (`DutyPatternController::continue()`) მისგან ნამდვილ მორიგეობებს ქმნის და
 * `generated_until`-ს წინ წევს. ⚠️ შენი ხელით დადგმული, გადატანილი ან
 * გაუქმებული მორიგეობა შენი გადაწყვეტილებაა — რიტმი იმ დღეს, სადაც იმავე
 * სამსახურის მორიგეობა უკვე დგას, **გამოტოვებს**, და უკვე გაგრძელებულ შუალედს
 * ხელახლა არ ეხება (გადატანით გათავისუფლებული დღე ცარიელი რჩება).
 *
 * ⚠️ თარიღები `Y-m-d`-ით ინახება (`DutyShift::setDateAttribute()`-ის მიზეზი).
 */
class DutyPattern extends Model
{
    use BelongsToUser;
    use HasTrash;

    /** „ყოველ N დღეში" — ზედა ზღვარი */
    public const MAX_INTERVAL = 60;

    /** ერთ გაგრძელებაში რამდენი დღე (≈ წელიწადი) */
    public const MAX_DAYS = 400;

    protected $guarded = ['id'];

    protected $casts = [
        'workplace_id' => 'integer',
        'type_id' => 'integer',
        'hours' => 'decimal:1',
        'interval_days' => 'integer',
        'anchor_date' => 'date',
        'generated_until' => 'date',
        'is_active' => 'boolean',
    ];

    public function setAnchorDateAttribute(mixed $value): void
    {
        $this->attributes['anchor_date'] = self::day($value);
    }

    public function setGeneratedUntilAttribute(mixed $value): void
    {
        $this->attributes['generated_until'] = self::day($value);
    }

    private static function day(mixed $value): ?string
    {
        return $value === null || $value === '' ? null : CarbonImmutable::parse($value, AppTime::zone())->toDateString();
    }

    public function workplace(): BelongsTo
    {
        return $this->belongsTo(DutyWorkplace::class, 'workplace_id');
    }

    public function type(): BelongsTo
    {
        return $this->belongsTo(DutyShiftType::class, 'type_id');
    }

    public function shifts(): HasMany
    {
        return $this->hasMany(DutyShift::class, 'pattern_id');
    }

    /** საიდან გრძელდება — უკვე გაგრძელებულის მეორე დღიდან, ან პირველი დღიდან */
    public function continuesFrom(): CarbonImmutable
    {
        $anchor = CarbonImmutable::parse($this->anchor_date->toDateString());

        if ($this->generated_until === null) {
            return $anchor;
        }

        $next = CarbonImmutable::parse($this->generated_until->toDateString())->addDay();

        return $next->greaterThan($anchor) ? $next : $anchor;
    }

    /**
     * რიტმის დღეები `$from`–`$until` შუალედში (ჩათვლით) — პირველი დღიდან
     * ყოველ N დღეში; თვის საზღვარს თვითონ კვეთს (29 → 2).
     *
     * @return list<string>
     */
    public function datesBetween(CarbonImmutable $from, CarbonImmutable $until): array
    {
        $anchor = CarbonImmutable::parse($this->anchor_date->toDateString());
        $step = max(1, (int) $this->interval_days);

        // პირველი რიტმის დღე `$from`-ზე ან მის შემდეგ
        $offset = (int) $anchor->diffInDays($from, false);
        $day = $offset <= 0 ? $anchor : $anchor->addDays((int) (ceil($offset / $step) * $step));

        $out = [];

        while ($day->lessThanOrEqualTo($until)) {
            $out[] = $day->toDateString();
            $day = $day->addDays($step);
        }

        return $out;
    }
}
