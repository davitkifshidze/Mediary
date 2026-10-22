<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasTrash;
use App\Support\AppTime;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **ერთი მორიგეობა** — მოდულის ჩანაწერი (`duty`): თარიღი, სამსახური,
 * ტიპი (ან ქასთომ საათები), დაწყების დრო, თანხა, შენიშვნა.
 *
 * ⚠️ **თანხა ჩანაწერზე იწერება** (`DutyPay`-ით შევსებული ან ხელით) და ტარიფის
 * შემდგომი ცვლილება მას არ ეხება — წარსული პერიოდის ჯამი სტაბილურია.
 *
 * ⚠️ **ღამის მორიგეობის თარიღი დაწყების დღეა**: 23:00-ზე დაწყებული
 * 12-საათიანი იმ დღეს ითვლება, როცა დაიწყო — პერიოდის საზღვარზეც.
 *
 * ⚠️ **სტატუსი** (`status`): დაგეგმილი · **გაუქმებული** (დღე რჩება წითლად,
 * თანხა 0 და ის **არსად ითვლება** — ჯამში, მთვლელში, სტატისტიკაში, შეხსენებაში) ·
 * **ნაწილობრივი** (საათები და თანხა ხელით, ცარიელი თანხა — 0). ტარიფიდან
 * (`DutyPay`) მხოლოდ დაგეგმილის თანხა ითვლება — მასობრივი შეცვლაც მხოლოდ მას გადაითვლის.
 *
 * ⚠️ **morph-ალიასი `duty`-ა** — მოდულის გასაღები (ადგილის/პირადი გალერეის
 * წესი): ურნის სახე, დამატებითი ველების `record_type` და აუდიტი ერთ სიტყვას
 * კითხულობს.
 */
class DutyShift extends Model
{
    public const SCHEDULED = 'scheduled';

    public const CANCELLED = 'cancelled';

    public const PARTIAL = 'partial';

    public const STATUSES = [self::SCHEDULED, self::CANCELLED, self::PARTIAL];

    use BelongsToUser;

    /** დამატებითი ველები მორიგეობაზე (წაშლა → ფაილი + კვოტა) */
    use HasCustomFields;

    use HasTrash;

    protected $guarded = ['id'];

    protected $casts = [
        'workplace_id' => 'integer',
        'type_id' => 'integer',
        'pattern_id' => 'integer',
        'date' => 'date',
        'hours' => 'decimal:1',
        'pay' => 'decimal:2',
        'is_favorite' => 'boolean',
        'reminded_at' => 'datetime',
    ];

    /* ახალ დღეზე გადატანილს ახალი შეხსენება ეკუთვნის */
    protected static function booted(): void
    {
        static::saving(function (DutyShift $shift) {
            if ($shift->exists && $shift->isDirty('date') && ! $shift->isDirty('reminded_at')) {
                $shift->reminded_at = null;
            }
        });
    }

    /**
     * ⚠️ **თარიღი `Y-m-d`-ით ინახება** და არა Laravel-ის `Y-m-d H:i:s`-ით: sqlite-ზე
     * (ტესტები) `between`/`=` სტრიქონებს ადარებს, და „…-31 00:00:00“ > „…-31“ —
     * პერიოდის ბოლო დღე ამოვარდებოდა, ხოლო შეხსენების `date = ხვალ` არაფერს
     * იპოვიდა. MySQL-ის `DATE` სვეტი ისედაც ასეა.
     */
    public function setDateAttribute(mixed $value): void
    {
        $this->attributes['date'] = $value === null || $value === ''
            ? null
            : CarbonImmutable::parse($value, AppTime::zone())->toDateString();
    }

    public function workplace(): BelongsTo
    {
        return $this->belongsTo(DutyWorkplace::class, 'workplace_id');
    }

    public function type(): BelongsTo
    {
        return $this->belongsTo(DutyShiftType::class, 'type_id');
    }

    /** რომელმა რიტმმა დაბადა (`DutyPattern::continue`) — ჩიპის „გამეორების" ნიშანი */
    public function pattern(): BelongsTo
    {
        return $this->belongsTo(DutyPattern::class, 'pattern_id');
    }

    /**
     * **სათაური** — „2026-10-04 · A · 24 სთ“: ძებნის შედეგი, `/purge`-ის ამრჩევი და
     * ჟურნალი (`auditLabel()`) ერთსა და იმავეს წერს.
     *
     * ⚠️ მორიგეობას სათაურის სვეტი არ აქვს, ე.ი. ჩვეულებრივი წამკითხველები
     * (`title`/`name`) ცარიელს დაწერდნენ. ⚠️ მხოლოდ ნედლი სვეტები და მოკლე ასო
     * იკითხება — რელაცია მოდელზე არ იტვირთება (ლოგი მოდელს არ უნდა ცვლიდეს).
     */
    public function getTitleAttribute(): ?string
    {
        $raw = $this->getAttributes();
        $date = $raw['date'] ?? null;

        if (! is_string($date) || $date === '') {
            return null;
        }

        $short = match (true) {
            $this->relationLoaded('workplace') => $this->getRelation('workplace')?->short,
            ! empty($raw['workplace_id']) => DutyWorkplace::withoutGlobalScopes()->whereKey($raw['workplace_id'])->value('short'),
            default => null,
        };

        $hours = rtrim(rtrim(number_format((float) ($raw['hours'] ?? 0), 1, '.', ''), '0'), '.');

        return implode(' · ', array_filter([substr($date, 0, 10), $short, $hours.' სთ']));
    }

    /** ექსპორტის სვეტი — სამსახურის სახელი (`ExportDomain`, რელაცია წინასწარაა ჩატვირთული) */
    public function getWorkplaceNameAttribute(): ?string
    {
        return $this->workplace?->name;
    }

    /** ჟურნალის სახელი (`AuditRegistry::labelFor()`) */
    public function auditLabel(): ?string
    {
        return $this->title;
    }
}
