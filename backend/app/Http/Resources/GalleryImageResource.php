<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * გალერეის ფოტო (`gallery_images`, Tasks 10).
 *
 * `collection` აღარ ბრუნდება — ცხრილი თვითონ არის კოლექცია; `kind`-იც
 * ზედმეტია, აქ ყოველთვის სურათია.
 */
class GalleryImageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            /* storage-ის გზა — ფრონტი `storageUrl()`-ით აწყობს სრულ URL-ს;
               ⚠️ **პირად დისკზე კი API-ის მარშრუტია** (`GalleryImage::servedUrl()`,
               2026-09-17): ჩაკეტილი ალბომის ფაილი `gallery/locked`-შია და
               `/storage/*` მას ვერ კითხულობს — შიშველი `path` გახსნილ ალბომს
               გატეხილ სურათებად ხატავდა. */
            'url' => $this->servedUrl(),
            'original_name' => $this->original_name,
            'mime' => $this->mime,
            'size' => $this->size,
            'source' => $this->source,
            /* §4.3 — „რაც კიდევ ვიცით": ორიგინალის გვერდი და ის, რომ
               ჩამოწერილი ესკიზია (ორიგინალი ხშირად hotlink-ს კრძალავს). */
            'source_url' => $this->source_url,
            'is_thumbnail' => (bool) $this->is_thumbnail,
            // ⚠️ TMDB-ის **ტექნიკური** ტიპი — წყაროდან მოდის და ხელით არ იცვლება
            'category' => $this->category,
            /* §26 — ალბომი (user-ის თავისი დახარისხება). `null` = ალბომის
               გარეშე; მშობლისგან დამოუკიდებელია, ე.ი. ორივე შეიძლება იყოს. */
            'album_id' => $this->album_id,
            /* ⚠️ **დისკს backend ამბობს და არა ფრონტი** (§17.5-ის წესი):
               ჩაკეტილი ალბომის ფოტო `gallery/locked`-შია, პირად დისკზე
               (§7.9), ე.ი. `/storage/*` მას ვერ კითხულობს. `PRIVATE_ROOTS`-ის
               ასლი SPA-ში ერთ დღეს დაშორდებოდა და პირად ფაილს საჯარო
               URL-ქვეშ გამოაჩენდა. */
            'private' => $this->isPrivate(),
            'width' => $this->width,
            'height' => $this->height,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
