<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * გალერეის ვიდეო-ბმული (`gallery_videos`, Tasks §8.1).
 *
 * ⚠️ **`thumbnail_url` დაშორებული მისამართია** და არა ჩვენი ფაილი — ფრონტმა
 * მას `storageUrl()` **არ** უნდა გაუკეთოს. სწორედ ამიტომ ჰქვია `_url` და
 * არა `_path`: სახელი თვითონ ამბობს, რომ ეს გარე ბმულია.
 *
 * ⚠️ **`embed_url` backend-ის აწყობილია** (`VideoUrl`-ის allowlist), ე.ი.
 * ფრონტი მას პირდაპირ `<iframe>`-ში ვერ აგდებს — `lib/embed.ts` ჰოსტს
 * ხელახლა ამოწმებს (არსებული წესი).
 */
class GalleryVideoResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'url' => $this->url,
            'platform' => $this->platform,
            'external_id' => $this->external_id,
            'embed_url' => $this->embed_url,
            'title' => $this->title,
            'channel' => $this->channel,
            'duration' => $this->duration,
            'published_at' => $this->published_at?->toDateString(),
            'thumbnail_url' => $this->thumbnail_url,
            'source_url' => $this->source_url,
            'source' => $this->source,
            'sort_order' => $this->sort_order,
            'created_at' => $this->created_at?->toIso8601String(),
            // ვისზეა მიბმული — „ყველა ვიდეო" სიაში მშობელი უნდა ჩანდეს
            'owner' => [
                'kind' => $this->videoable_type === 'cast_member' ? 'actor' : $this->videoable_type,
                'id' => $this->videoable_id,
            ],
        ];
    }
}
