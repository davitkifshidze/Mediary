<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * გალერეის ფოტო (`gallery_images`, Tasks 10).
 *
 * `collection` აღარ ბრუნდება — ცხრილი თვითონ არის კოლექცია; `kind`-იც
 * ზედმეტია, აქ ყოველთვის სურათია.
 */
class GalleryImageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            // storage-ის გზა — ფრონტი `storageUrl()`-ით აწყობს სრულ URL-ს
            'url' => $this->path,
            'original_name' => $this->original_name,
            'mime' => $this->mime,
            'size' => $this->size,
            'source' => $this->source,
            /* §4.3 — „რაც კიდევ ვიცით": ორიგინალის გვერდი და ის, რომ
               ჩამოწერილი ესკიზია (ორიგინალი ხშირად hotlink-ს კრძალავს). */
            'source_url' => $this->source_url,
            'is_thumbnail' => (bool) $this->is_thumbnail,
            // ⚠️ TMDB-ის **ტექნიკური** ტიპი — წყაროდან მოდის და ხელით არ იცვლება
            'category' => $this->category,
            'width' => $this->width,
            'height' => $this->height,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
