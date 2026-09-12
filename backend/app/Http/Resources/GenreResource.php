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
            // §7.1 — მესამე მედია-დომენი; `whenCounted` მას მხოლოდ მაშინ აჩენს,
            // როცა `withCount`-ში ითხოვეს, ე.ი. ძველი პასუხები არ იბერება
            'animes_count' => $this->whenCounted('animes'),
        ];
    }
}
