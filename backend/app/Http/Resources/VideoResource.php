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
            // მართვადი ტიპი (5.1) — `kind` enum-ი აღარ არსებობს
            'type_id' => $this->type_id,
            'type' => $this->whenLoaded('type', fn () => new VideoTypeResource($this->type)),
            // §6.4 — ვიდეოს სტატუსი: ამ მოდულს ის აქამდე საერთოდ არ ჰქონდა
            'status' => StatusResource::brief($this->status),
            // 5.6/16.5 — საჯარო პროფილის წინაპირობა; default `private`
            'visibility' => $this->visibility,
            'url' => $this->url,
            'platform' => $this->platform,
            'external_id' => $this->external_id,
            'embed_url' => $this->embed_url,
            // ატვირთული thumbnail → /storage/…; თუ არაა — პლატფორმის URL
            'thumbnail' => $this->thumbnail_path ?: $this->thumbnail_url,
            'duration' => $this->duration,
            'tags' => $this->tags ?? [],
            'is_favorite' => $this->is_favorite,
            'watch_count' => $this->watch_count,
            'watched_at' => $this->watched_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            /* §7.1 — ლოკალური ასლი.
               ⚠️ **გზა გარეთ არ გადის**: ფაილი პრივატულ დისკზეა და მხოლოდ
               `GET /api/videos/{id}/download`-ით იხსნება. აქედან მხოლოდ
               „აქვს/მიმდინარეობს/ჩავარდა" და ადამიანისთვის საჭირო დეტალები. */
            'download_status' => $this->download_status,
            'download_size' => (int) $this->download_size,
            'download_format' => $this->download_format,
            'download_name' => $this->download_name,
            'download_error' => $this->download_error,
            'downloaded_at' => $this->downloaded_at?->toIso8601String(),
            /* ⚠️ **„გაჭედილია" backend-ის სათქმელია** (აუდიტი 2026-09-14, §B1) —
               იგივე წესი, რაც საცავის `private` დროშას აქვს. SPA-ს ჭერისა და
               საწყისი დროის მეორე ასლი დასჭირდებოდა, ე.ი. ერთ დღეს ღილაკი
               „მიმდინარეობს"-ს აჩვენებდა, სერვერი კი უკვე დაუშვებდა ხელახლა
               გაშვებას (ან პირიქით). ერთი ფორმულა — `Video::downloadStale()`. */
            'download_stale' => $this->downloadStale(),
            // მიმაგრებული შიგთავსი (K3)
            'images_count' => $this->whenCounted('images'),
            'documents_count' => $this->whenCounted('documents'),
            'notes_count' => $this->whenCounted('notes'),
        ];
    }
}
