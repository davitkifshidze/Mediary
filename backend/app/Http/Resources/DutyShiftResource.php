<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * **ერთი მორიგეობა.**
 *
 * ⚠️ **დასრულება ითვლება და არ ინახება** (`end_time`, `end_day` — რამდენი დღით
 * გვიან): დაწყება + საათები. ცალკე სვეტი საათებს და დასრულებას ერთ დღეს
 * დააშორებდა; 24-საათიანი 09:00-ზე — „09:00 → 09:00 (+1)“.
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
        $start = $this->start_time ? substr((string) $this->start_time, 0, 5) : null;
        $end = $start !== null ? self::end($start, (float) $this->hours) : null;

        return [
            'id' => $this->id,
            'date' => $this->date?->toDateString(),
            'start_time' => $start,
            'end_time' => $end['time'] ?? null,
            'end_day' => $end['day'] ?? null,
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

    /**
     * დასრულება — წუთების არითმეტიკით (თბილისს საათის გადაწევა არ აქვს).
     *
     * @return array{time: string, day: int}
     */
    public static function end(string $start, float $hours): array
    {
        [$h, $m] = array_map('intval', explode(':', $start));
        $total = $h * 60 + $m + (int) round($hours * 60);

        return [
            'time' => sprintf('%02d:%02d', intdiv($total % 1440, 60), $total % 60),
            'day' => intdiv($total, 1440),
        ];
    }
}
