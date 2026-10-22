<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * **მორიგეობის რიტმი** — „ყოველ N დღეში" `anchor_date`-დან; `generated_until` —
 * რომელ დღემდეა უკვე გაგრძელებული (SPA ამით წყვეტს, აჩვენოს თუ არა
 * „რიტმის გაგრძელება" ამ პერიოდში).
 */
class DutyPatternResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'workplace_id' => $this->workplace_id,
            'type_id' => $this->type_id,
            'hours' => (float) $this->hours,
            'interval_days' => (int) $this->interval_days,
            'anchor_date' => $this->anchor_date?->toDateString(),
            'start_time' => $this->start_time ? substr((string) $this->start_time, 0, 5) : null,
            'is_active' => (bool) $this->is_active,
            'generated_until' => $this->generated_until?->toDateString(),
        ];
    }
}
