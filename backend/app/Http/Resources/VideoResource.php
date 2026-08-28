<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class VideoResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'kind' => $this->kind,
            'url' => $this->url,
            'platform' => $this->platform,
            'external_id' => $this->external_id,
            'embed_url' => $this->embed_url,
            // ატვირთული thumbnail: public → /storage/…, adult (private) → policy-ით დაცული route
            'thumbnail' => $this->thumbnail_path
                ? ($this->thumbnailDisk() === 'public'
                    ? $this->thumbnail_path
                    : route('videos.thumb', $this->id))
                : $this->thumbnail_url,
            'thumbnail_is_private' => $this->thumbnail_path && $this->thumbnailDisk() !== 'public',
            'duration' => $this->duration,
            'tags' => $this->tags ?? [],
            'is_adult' => $this->is_adult,
            'is_favorite' => $this->is_favorite,
            'watch_count' => $this->watch_count,
            'watched_at' => $this->watched_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            // მიმაგრებული შიგთავსი (K3)
            'images_count' => $this->whenCounted('images'),
            'documents_count' => $this->whenCounted('documents'),
            'notes_count' => $this->whenCounted('notes'),
        ];
    }
}
