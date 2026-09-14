<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * შეხსენება (`note_reminders`, Tasks §13.2).
 *
 * `next_at` **გამოთვლილი** ველია და ფრონტზე მხოლოდ საჩვენებლად მიდის —
 * მისი ჩაწერა მხოლოდ `NoteReminder::computeNextAt()`-ს შეუძლია.
 */
class NoteReminderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'note_entry_id' => $this->note_entry_id,
            // ⚠️ **ბმა ჩანაწერზე** — მხოლოდ მაშინ, როცა რელაცია მართლა ჩატვირთულია
            // (ერთი ჩანაწერის სიაში ის ზედმეტია და N+1-საც ნიშნავდა)
            'note' => $this->whenLoaded('noteEntry', fn () => [
                'id' => $this->noteEntry->id,
                'title' => $this->noteEntry->title,
            ]),
            'mode' => $this->mode,
            'remind_at' => $this->remind_at?->toIso8601String(),
            'interval_minutes' => $this->interval_minutes,
            // ⚠️ **სიებია და არა ერთეული მნიშვნელობები** (ეტაპი 7): დღეში
            // რამდენიმე დრო და თვეში რამდენიმე რიცხვი. `H:i` — წამები
            // ინტერფეისს არ სჭირდება.
            'times_of_day' => array_values(array_map(
                fn ($time) => substr((string) $time, 0, 5),
                $this->times_of_day ?? [],
            )),
            'weekdays' => array_values($this->weekdays ?? []),
            'days_of_month' => array_values($this->days_of_month ?? []),
            'month' => $this->month,
            'repeat_count' => $this->repeat_count,
            // მოქმედების ფანჯარა — აბსოლუტური მომენტები (ეტაპი 7)
            'starts_at' => $this->starts_at?->toIso8601String(),
            'ends_at' => $this->ends_at?->toIso8601String(),
            'timezone' => $this->timezone,
            'channels' => $this->channels ?? ['browser'],
            'is_active' => $this->is_active,
            'next_at' => $this->next_at?->toIso8601String(),
            'last_sent_at' => $this->last_sent_at?->toIso8601String(),
            'sent_count' => $this->sent_count,
        ];
    }
}
