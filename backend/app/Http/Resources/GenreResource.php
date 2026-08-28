<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class GenreResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name_en' => $this->name_en,
            'name_ka' => $this->name_ka,
            'slug' => $this->slug,
            'movies_count' => $this->whenCounted('movies'),
            'series_count' => $this->whenCounted('series'),
        ];
    }
}
