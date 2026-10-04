<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * პლეილისტი — სიმღერების ნაკრები (`song` მოდული).
 *
 * `songs` მხოლოდ მაშინ მოდის, როცა ჩატვირთულია — სიაში რაოდენობა კმარა,
 * შიდა გვერდზე კი სრული (დალაგებული) სია.
 */
class PlaylistResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'sort_order' => $this->sort_order,
            // Tasks 16 — პლეილისტი დამოუკიდებელი გაზიარებადი ერთეულია
            'visibility' => $this->visibility,
            'songs_count' => $this->whenCounted('songs'),
            'songs' => SongResource::collection($this->whenLoaded('songs')),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
