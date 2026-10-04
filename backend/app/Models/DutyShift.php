<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasTrash;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **ერთი მორიგეობა (Tasks §34)** — მოდულის ჩანაწერი (`duty`): თარიღი, სამსახური,
 * ტიპი (ან ქასთომ საათები), დაწყების დრო, თანხა, შენიშვნა.
 *
 * ⚠️ **თანხა ჩანაწერზე იწერება** (`DutyPay`-ით შევსებული ან ხელით) და ტარიფის
 * შემდგომი ცვლილება მას არ ეხება — წარსული პერიოდის ჯამი სტაბილურია.
 *
 * ⚠️ **ღამის მორიგეობის თარიღი დაწყების დღეა** (Q8): 23:00-ზე დაწყებული
 * 12-საათიანი იმ დღეს ითვლება, როცა დაიწყო — პერიოდის საზღვარზეც.
 *
 * ⚠️ **morph-ალიასი `duty`-ა** — მოდულის გასაღები (ადგილის/პირადი გალერეის
 * წესი): ურნის სახე, დამატებითი ველების `record_type` და აუდიტი ერთ სიტყვას
 * კითხულობს.
 */
class DutyShift extends Model
{
    use BelongsToUser;

    /** §34.6 — დამატებითი ველები მორიგეობაზე (წაშლა → ფაილი + კვოტა) */
    use HasCustomFields;

    use HasTrash;

    protected $guarded = ['id'];

    protected $casts = [
        'workplace_id' => 'integer',
        'type_id' => 'integer',
        'date' => 'date',
        'hours' => 'decimal:1',
        'pay' => 'decimal:2',
        'is_favorite' => 'boolean',
    ];

    public function workplace(): BelongsTo
    {
        return $this->belongsTo(DutyWorkplace::class, 'workplace_id');
    }

    public function type(): BelongsTo
    {
        return $this->belongsTo(DutyShiftType::class, 'type_id');
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
