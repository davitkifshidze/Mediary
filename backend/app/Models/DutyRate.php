<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **ტარიფი — სამსახური × ტიპი (Tasks §34, Q8)**: „კლინიკა A · 24 სთ = 220 ₾“.
 *
 * ⚠️ **`user_id` განზრახ არ აქვს** — ტარიფი სამსახურის ნაწილია: იკითხება და
 * იწერება მხოლოდ მისით (`PUT /duty/workplaces/{id}` → `rates`), ე.ი. მფლობელობას
 * სამსახურის `owner` scope და მარშრუტის მიბმა ამოწმებს. საბოლოო წაშლა (სამსახურის
 * ან ტიპის) მას SQL-ის კასკადით მიაქვს — ფაილი და კვოტა აქ არ არის.
 */
class DutyRate extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'workplace_id' => 'integer',
        'type_id' => 'integer',
        'pay' => 'decimal:2',
    ];

    public function workplace(): BelongsTo
    {
        return $this->belongsTo(DutyWorkplace::class, 'workplace_id');
    }

    public function type(): BelongsTo
    {
        return $this->belongsTo(DutyShiftType::class, 'type_id');
    }
}
