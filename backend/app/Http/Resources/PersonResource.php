<?php

namespace App\Http\Resources;

use App\Support\RecordLocks;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * **ადამიანი პირად გალერეაში.**
 *
 * ⚠️ `cover` ესკიზის API-გზაა: ცხადად არჩეული ყდა, ან — თუ ის არ არის/ურნაშია —
 * ბოლო ფოტო (`PersonalGallery::covers()` ერთი მოთხოვნით აწყობს). ⚠️ მთვლელები
 * `withCount`-იდანაა და `personal_parent` scope-ს ემორჩილება — ურნაში მყოფი
 * ალბომის ფოტო რიცხვში არ ჩანს.
 *
 * ⚠️ **ჩაკეტილი და ამ სესიაში დაუხსნელი ადამიანი ბოქლომიანი ბარათია**:
 * სახელი და რიცხვები ჩანს, ჩანიშვნა, დაბადება და ყდა კი — არა.
 */
class PersonResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $lock = RecordLocks::state($this->resource);
        $hidden = ! $lock['unlocked'];

        return [
            'id' => $this->id,
            'name' => $this->name,
            'birthday' => $hidden ? null : $this->birthday?->toDateString(),
            'note' => $hidden ? null : $this->note,
            'cover_media_id' => $hidden ? null : $this->cover_media_id,
            'cover' => $hidden ? null : ($this->resolved_cover ?? null),
            'photos' => (int) ($this->photos_count ?? 0),
            'videos' => (int) ($this->videos_count ?? 0),
            'albums' => (int) ($this->albums_count ?? 0),
            'sort_order' => (int) $this->sort_order,
            'created_at' => $this->created_at?->toIso8601String(),
            ...$lock,
        ];
    }
}
