<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * **სამსახური (Tasks §34)** — ტარიფებით (`rates`: ტიპი → თანხა), რომ სწრაფი
 * დამატების ფანჯარამ თანხა წინასწარ შეავსოს მეორე მოთხოვნის გარეშე.
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
            'is_active' => (bool) $this->is_active,
            'sort_order' => (int) $this->sort_order,
            'rates' => $this->relationLoaded('rates')
                ? $this->rates->map(fn ($rate) => ['type_id' => (int) $rate->type_id, 'pay' => (float) $rate->pay])->values()->all()
                : [],
            'shifts_count' => (int) ($this->shifts_count ?? 0),
        ];
    }
}
