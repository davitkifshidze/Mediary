<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** სრული ვერსია დეტალებისთვის */
class MovieResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title_ka' => $this->title_ka,
            'title_en' => $this->title_en,
            'year' => $this->year,
            'imdb_id' => $this->imdb_id,
            'imdb_url' => $this->imdb_url,
            'tmdb_id' => $this->tmdb_id,
            'ge_url' => $this->ge_url,
            'description_ka' => $this->description_ka,
            'description_en' => $this->description_en,
            'description_ka_source' => $this->description_ka_source,
            'description_en_source' => $this->description_en_source,
            'rating' => $this->rating,
            'runtime' => $this->runtime,
            'poster' => $this->poster_path ? asset('storage/'.$this->poster_path) : null,
            'poster_source' => $this->poster_source,
            'status' => $this->status,
            'is_favorite' => $this->is_favorite,
            'watched_at' => $this->watched_at,
            'sync_status' => $this->sync_status,
            'collection_id' => $this->tmdb_collection_id,
            'collection_name' => $this->collection_name,
            'franchise_next' => (bool) ($this->franchise_next ?? false),
            'genres' => GenreResource::collection($this->whenLoaded('genres')),
            'cast' => CastResource::collection($this->whenLoaded('cast')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
