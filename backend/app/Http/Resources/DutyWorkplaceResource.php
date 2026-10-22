<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * **სამსახური** — ტარიფებით (`rates`: ტიპი → თანხა) და ნაგულისხმევებით
 * (ტიპი, დაწყების დრო), რომ სწრაფი დამატების ფანჯარამ თანხაც, ტიპიც და დროც
 * წინასწარ შეავსოს მეორე მოთხოვნის გარეშე.
 */
class DutyWorkplaceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'short' => $this->short,
            'color' => $this->color,
            'hourly_rate' => $this->hourly_rate !== null ? (float) $this->hourly_rate : null,
            'default_type_id' => $this->default_type_id,
            'default_start_time' => $this->default_start_time ? substr((string) $this->default_start_time, 0, 5) : null,
            // ანაზღაურების პერიოდი — დღეს მოქმედი პირველი დღე და მომავალი ცვლილება
            'period_day' => $this->resource->periodDay(),
            'period_pending' => $this->resource->periodPending(),
            'is_active' => (bool) $this->is_active,
            'sort_order' => (int) $this->sort_order,
            'rates' => $this->relationLoaded('rates')
                ? $this->rates->map(fn ($rate) => ['type_id' => (int) $rate->type_id, 'pay' => (float) $rate->pay])->values()->all()
                : [],
            'shifts_count' => (int) ($this->shifts_count ?? 0),
        ];
    }
}
