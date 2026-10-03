<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * **ადამიანი პირად გალერეაში (Tasks §33).**
 *
 * ⚠️ `cover` ესკიზის API-გზაა: ცხადად არჩეული ყდა, ან — თუ ის არ არის/ურნაშია —
 * ბოლო ფოტო (`PersonalGallery::covers()` ერთი მოთხოვნით აწყობს). ⚠️ მთვლელები
 * `withCount`-იდანაა და `personal_parent` scope-ს ემორჩილება — ურნაში მყოფი
 * ალბომის ფოტო რიცხვში არ ჩანს.
 */
class PersonResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'birthday' => $this->birthday?->toDateString(),
            'note' => $this->note,
            'cover_media_id' => $this->cover_media_id,
            'cover' => $this->resolved_cover ?? null,
            'photos' => (int) ($this->photos_count ?? 0),
            'videos' => (int) ($this->videos_count ?? 0),
            'albums' => (int) ($this->albums_count ?? 0),
            'sort_order' => (int) $this->sort_order,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
