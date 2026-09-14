<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * ბორდგეიმი (`board_game` მოდული). სათაური ერთენოვანია — წყარო (BGG)
 * მხოლოდ ინგლისურია და §14 ორ ენას არ ითხოვს.
 */
class BoardGameResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'year' => $this->year,

            'designer' => $this->designer,
            'publisher' => $this->publisher,
            'genre_id' => $this->genre_id,
            'genre' => $this->whenLoaded('genre', fn () => new BoardGameGenreResource($this->genre)),

            'players_min' => $this->players_min,
            'players_max' => $this->players_max,
            'age_min' => $this->age_min,
            'playtime_min' => $this->playtime_min,
            'playtime_max' => $this->playtime_max,
            'complexity' => $this->complexity,

            'bgg_id' => $this->bgg_id,
            'bgg_rating' => $this->bgg_rating,
            // ბმული სვეტად არ ინახება — id-დან გამოითვლება (ერთი წყარო)
            'bgg_url' => $this->bgg_id ? "https://boardgamegeek.com/boardgame/{$this->bgg_id}" : null,

            // ატვირთული ფოტო → /storage/…; თუ არაა — გარე URL
            'image' => $this->image_path ?: $this->image_url,
            'image_source' => $this->image_source,

            'status' => $this->status,
            'rating' => $this->rating,
            'is_favorite' => $this->is_favorite,
            'links' => $this->links ?? [],

            // 16.5 — საჯარო პროფილის წინაპირობა; default `private`
            'visibility' => $this->visibility,
            'files_count' => $this->whenCounted('files'),
            'images_count' => $this->whenCounted('images'),
            'notes_count' => $this->whenCounted('notes'),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
