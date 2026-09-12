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
            'mode' => $this->mode,
            'remind_at' => $this->remind_at?->toIso8601String(),
            'interval_minutes' => $this->interval_minutes,
            // `H:i` — წამები ინტერფეისს არ სჭირდება
            'time_of_day' => $this->time_of_day ? substr((string) $this->time_of_day, 0, 5) : null,
            'weekdays' => array_values($this->weekdays ?? []),
            'day_of_month' => $this->day_of_month,
            'month' => $this->month,
            'repeat_count' => $this->repeat_count,
            'timezone' => $this->timezone,
            'channels' => $this->channels ?? ['browser'],
            'is_active' => $this->is_active,
            'next_at' => $this->next_at?->toIso8601String(),
            'last_sent_at' => $this->last_sent_at?->toIso8601String(),
            'sent_count' => $this->sent_count,
        ];
    }
}
