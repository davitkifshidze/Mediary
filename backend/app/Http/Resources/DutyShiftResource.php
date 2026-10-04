<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * **ერთი მორიგეობა (Tasks §34).**
 *
 * ⚠️ სამსახური და ტიპი **მოკლედ** ახლავს (ჩიპის ფერი, ასო, სახელი) — კალენდარი
 * მათ ყოველ უჯრაზე ხატავს და ცალკე ლექსიკონის ძებნა ზედმეტი იქნებოდა. ⚠️ ურნაში
 * მყოფი სამსახური/ტიპი რელაციით არ ჩაიტვირთება (`trash` scope) — მაშინ `null`.
 */
class DutyShiftResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $workplace = $this->relationLoaded('workplace') ? $this->workplace : null;
        $type = $this->relationLoaded('type') ? $this->type : null;

        return [
            'id' => $this->id,
            'date' => $this->date?->toDateString(),
            'start_time' => $this->start_time ? substr((string) $this->start_time, 0, 5) : null,
            'hours' => (float) $this->hours,
            'pay' => $this->pay !== null ? (float) $this->pay : null,
            'note' => $this->note,
            'is_favorite' => (bool) $this->is_favorite,
            'workplace_id' => $this->workplace_id,
            'type_id' => $this->type_id,
            'workplace' => $workplace ? [
                'id' => $workplace->id,
                'name' => $workplace->name,
                'short' => $workplace->short,
                'color' => $workplace->color,
            ] : null,
            'type' => $type ? [
                'id' => $type->id,
                'name_ka' => $type->name_ka,
                'name_en' => $type->name_en,
                'hours' => (float) $type->hours,
                'icon' => $type->icon,
            ] : null,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
