<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * **ფოტო/ვიდეო პირად გალერეაში (Tasks §33).**
 *
 * ⚠️ **`url`/`thumb` API-ის გზებია და არა `/storage/*`** — ფაილი პირად დისკზეა
 * (`private: true`), SPA ესკიზს blob-ად კითხულობს (`usePrivateFileUrl`), ვიდეოს
 * კი `<video src>`-ით უკრავს (Range-ით). ⚠️ დისკის გზა (`path`) პასუხში არ
 * გამოდის — ის შიდა ფაქტია და გარეთ არაფერს ემსახურება.
 */
class PersonalMediaResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'url' => $this->fileUrl(),
            'thumb' => $this->thumbUrl(),
            'private' => true,
            'mime' => $this->mime,
            'size' => (int) $this->size + (int) $this->thumb_size,
            'original_name' => $this->original_name,
            'width' => $this->width,
            'height' => $this->height,
            'duration' => $this->duration,
            'taken_at' => $this->taken_at?->toIso8601String(),
            'caption' => $this->caption,
            'is_favorite' => (bool) $this->is_favorite,
            'person_id' => $this->person_id,
            'album_id' => $this->album_id,
            'sort_order' => (int) $this->sort_order,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
