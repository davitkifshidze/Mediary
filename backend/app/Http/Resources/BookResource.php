<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * წიგნი (`book` მოდული). ორივე ენა ერთად მიდის და ფრონტი ირჩევს
 * `contentLang`-ის მიხედვით — იგივე ფორმა, რაც `MovieResource`-ს აქვს.
 */
class BookResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title_ka' => $this->title_ka,
            'title_en' => $this->title_en,
            'description_ka' => $this->description_ka,
            'description_en' => $this->description_en,

            'author' => $this->author,
            'publisher' => $this->publisher,
            'isbn' => $this->isbn,
            'year' => $this->year,
            'pages' => $this->pages,
            'language' => $this->language,
            // §5.7 — ერთი „წყაროს / წასაკითხი ლინკი"; `links` ძველი მონაცემისთვის რჩება
            'source_url' => $this->source_url,

            'genre_id' => $this->genre_id,
            'genre' => $this->whenLoaded('genre', fn () => new BookGenreResource($this->genre)),
            'series_name' => $this->series_name,
            'series_number' => $this->series_number,

            'format' => $this->format,
            'status' => $this->status,
            'rating' => $this->rating,
            'is_favorite' => $this->is_favorite,
            'progress_page' => $this->progress_page,
            'progress_percent' => $this->progress_percent,

            // ატვირთული ყდა → /storage/…; თუ არაა — გარე URL
            'cover' => $this->cover_path ?: $this->cover_url,
            'cover_source' => $this->cover_source,
            'links' => $this->links ?? [],
            'tags' => $this->tags ?? [],
            'openlibrary_id' => $this->openlibrary_id,

            // 16.5 — საჯარო პროფილის წინაპირობა; default `private`
            'visibility' => $this->visibility,
            'files_count' => $this->whenCounted('files'),
            'notes_count' => $this->whenCounted('notes'),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
