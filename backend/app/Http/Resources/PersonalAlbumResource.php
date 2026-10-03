<?php

namespace App\Http\Resources;

use App\Support\RecordLocks;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * **პირადი გალერეის ალბომი (Tasks §33)** — „გარეთ" ან ადამიანის შიგნით.
 *
 * `person` — ადამიანის სახელი (ჯგუფების სათაურისთვის), თუ ალბომი მისია.
 *
 * ⚠️ **ჩაკეტილი და დაუხსნელი ალბომი ბოქლომიანი ბარათია** (§33.7): აღწერა და
 * ყდა გახსნამდე არ გამოდის.
 */
class PersonalAlbumResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $lock = RecordLocks::state($this->resource);
        $hidden = ! $lock['unlocked'];

        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $hidden ? null : $this->description,
            'person_id' => $this->person_id,
            'person' => $this->relationLoaded('person') && $this->person
                ? ['id' => $this->person->id, 'name' => $this->person->name]
                : null,
            'cover_media_id' => $hidden ? null : $this->cover_media_id,
            'cover' => $hidden ? null : ($this->resolved_cover ?? null),
            'visibility' => $this->visibility,
            'photos' => (int) ($this->photos_count ?? 0),
            'videos' => (int) ($this->videos_count ?? 0),
            'sort_order' => (int) $this->sort_order,
            'created_at' => $this->created_at?->toIso8601String(),
            ...$lock,
        ];
    }
}
