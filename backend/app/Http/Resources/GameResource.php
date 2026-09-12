<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * თამაში (`game` მოდული, Tasks §11).
 *
 * ორენოვანი ტექსტი **ბრტყელი სვეტებია** (წიგნის წესი) — RAWG ერთენოვანია,
 * მაგრამ API-ს ფორმა იგივე რჩება, რაც `MovieResource`-ზე: ორივე ენა მოდის,
 * ფრონტი კი ირჩევს.
 */
class GameResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title_ka' => $this->title_ka,
            'title_en' => $this->title_en,
            'description_ka' => $this->description_ka,
            'description_en' => $this->description_en,

            'release_date' => $this->release_date?->toDateString(),
            // ⚠️ სვეტი არაა — `release_date`-ის აქსესორია (ერთი წყარო)
            'year' => $this->year,

            'developer' => $this->developer,
            'publisher' => $this->publisher,
            'franchise' => $this->franchise,

            'platforms' => $this->platforms ?? [],
            'my_platform' => $this->my_platform,
            'modes' => $this->modes ?? [],

            // ჟანრები **მრავალია** (11.1) — pivot `game_genre_game`
            'genres' => GameGenreResource::collection($this->whenLoaded('genres')),
            'genre_ids' => $this->whenLoaded('genres', fn () => $this->genres->pluck('id')->all()),

            'hltb_main' => $this->hltb_main,
            'hltb_main_extra' => $this->hltb_main_extra,
            'hltb_complete' => $this->hltb_complete,

            'metacritic' => $this->metacritic,
            'opencritic' => $this->opencritic,
            'users_score' => $this->users_score,
            'rating' => $this->rating,

            // ატვირთული ყდა → /storage/…; თუ არაა — გარე URL
            'cover' => $this->cover_path ?: $this->cover_url,
            'cover_source' => $this->cover_source,

            'links' => $this->links ?? [],
            'status' => $this->status,
            'is_favorite' => $this->is_favorite,

            'age_rating' => $this->age_rating,
            'languages' => $this->languages ?? new \stdClass,
            'size_gb' => $this->size_gb,
            'dlcs' => $this->dlcs ?? [],

            'rawg_id' => $this->rawg_id,
            'rawg_slug' => $this->rawg_slug,
            // IGDB — სათადარიგო წყარო (`DECISIONS.md` §7)
            'igdb_id' => $this->igdb_id,
            'igdb_slug' => $this->igdb_slug,

            // 16.5 — საჯარო პროფილის წინაპირობა; default `private`
            'visibility' => $this->visibility,

            'videos' => GameVideoResource::collection($this->whenLoaded('videos')),
            'videos_count' => $this->whenCounted('videos'),
            'files_count' => $this->whenCounted('files'),
            'images_count' => $this->whenCounted('images'),
            'notes_count' => $this->whenCounted('notes'),
            'gallery_count' => $this->whenCounted('galleryImages'),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
