<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * **მორიგეობის ტიპი (Tasks §34)** — კლასიფიკატორის ფორმა (`/dictionaries`):
 * `shifts_count` ლექსიკონის ბარათის „N მორიგეობას“ კითხულობს.
 */
class DutyShiftTypeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'key' => $this->key,
            'name_ka' => $this->name_ka,
            'name_en' => $this->name_en,
            'hours' => (float) $this->hours,
            'icon' => $this->icon,
            'sort_order' => (int) $this->sort_order,
            'shifts_count' => (int) ($this->shifts_count ?? 0),
        ];
    }
}
