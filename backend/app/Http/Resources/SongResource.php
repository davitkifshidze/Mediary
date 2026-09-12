<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * სიმღერა (`song` მოდული). ორენოვანი translation-ცხრილი განზრახ არ აქვს —
 * სიმღერის სათაური და შემსრულებელი ისე იწერება, როგორც user შეიყვანს
 * (გამამდიდრებელი წყარო, TMDB-ის ანალოგი, მუსიკაზე არ გვაქვს).
 */
class SongResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'artist' => $this->artist,
            'album' => $this->album,
            'year' => $this->year,
            // ⚠️ **მრავალჟანრიანია** (`DECISIONS.md` §5) — `genre_id` აღარ არსებობს
            'genres' => SongGenreResource::collection($this->whenLoaded('genres')),
            'genre_ids' => $this->whenLoaded('genres', fn () => $this->genres->pluck('id')),
            'duration' => $this->duration,
            'url' => $this->url,
            'platform' => $this->platform,
            'external_id' => $this->external_id,
            'embed_url' => $this->embed_url,
            // ატვირთული ფოტო → /storage/…; თუ არაა — პლატფორმის URL
            'thumbnail' => $this->thumbnail_path ?: $this->thumbnail_url,
            'tags' => $this->tags ?? [],
            'rating' => $this->rating,
            'is_favorite' => $this->is_favorite,
            'play_count' => $this->play_count,
            // §7.4 — მიმაგრებული ფაილები/ჩანიშვნები (`whenCounted`: მხოლოდ თუ დათვლილია)
            'images_count' => $this->whenCounted('images'),
            'documents_count' => $this->whenCounted('documents'),
            'notes_count' => $this->whenCounted('notes'),
            'played_at' => $this->played_at?->toIso8601String(),
            // 16.5 — საჯარო პროფილის წინაპირობა; default `private`
            'visibility' => $this->visibility,
            'playlist_ids' => $this->whenLoaded('playlists', fn () => $this->playlists->pluck('id')),
            /* §5.3 — სიაში უნდა ეწეროს, **რომელ პლეილისტს ეკუთვნის** სიმღერა.
               ⚠️ ცარიელი მასივი და „არ არის ჩატვირთული" ერთი და იგივე არაა:
               `whenLoaded`-ის გარეშე ფრონტი „არცერთ პლეილისტში" დაწერდა იქაც,
               სადაც კავშირი უბრალოდ არ მოგვითხოვია. */
            'playlists' => $this->whenLoaded(
                'playlists',
                fn () => $this->playlists->map(fn ($p) => ['id' => $p->id, 'name' => $p->name])->values(),
            ),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
