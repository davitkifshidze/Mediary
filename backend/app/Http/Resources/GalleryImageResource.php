<?php

namespace App\Http\Resources;

use App\Support\GalleryParent;
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
        /* ⚠️ **ჩაკეტილი ფოტო სიიდან არ ქრება — ის შიშვლდება (2026-09-20).**

           შენი სიტყვები: „როდესაც ჩაკეტილ კატეგორიაში იქნება, ყველა ფოტოში
           ჩანდეს დაბლარულად და თუ პაროლს არ შეიყვან, არ გამოჩნდება".

           ⚠️ **გაშიშვლება აქაა და არა კონტროლერში, და ეს მთელი დაცვაა.**
           ფოტოს რამდენიმე endpoint აბრუნებს (ბრტყელი სია, ჩანაწერის
           გვერდი, მსახიობის კადრები) — ერთ მათგანში დავიწყებული პირობა
           ლოკს **ჩუმად** გააუქმებდა. resource ერთია, ე.ი. ბილიკს გარეთ
           ვერცერთი გზა ვერ გაიტანს.

           ⚠️ **სამი ველი გადის და სამივე საჭიროა**: `id` (პაროლის შემდეგ
           იმავე ფოტოს ვცნობთ), ზომები (უამისოდ ბადე პროპორციას ვერ
           დაიცავს და პაროლის შეყვანისას ყველა ფილა ახტება) და `album_id`
           (ფილაზე დაჭერით სწორედ **ამ** ალბომის პაროლი უნდა იკითხებოდეს).
           `path`/`remote_path`/`source_url` — არცერთი. რაც არასდროს
           გაიგზავნა, იმას ინსპექტორი ვერ იპოვის. */
        if ($this->isAlbumLocked()) {
            return [
                'id' => $this->id,
                'album_id' => $this->album_id,
                'width' => $this->width,
                'height' => $this->height,
                'locked' => true,
            ];
        }

        return [
            'id' => $this->id,
            'locked' => false,
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
            /* ⚠️ **„მთავარად დაყენებას" backend წყვეტს და არა ფრონტი** (Tasks
               BUG-20). SPA `category !== 'actor'`-ს უყურებდა, ე.ი. ღილაკს
               სიმღერაზე/წიგნზე/თამაშზეც ხატავდა, სადაც `poster_path` სვეტი
               საერთოდ არ არსებობს და დაჭერა **500-ს** აბრუნებდა. მშობლების
               რუკა `GalleryParent`-შია — მისი ასლი ფრონტზე ისევე დაშორდებოდა,
               როგორც `PRIVATE_ROOTS`-ის ასლი დაშორდებოდა დისკებს. */
            'supports_primary' => GalleryParent::supportsPrimary((string) $this->imageable_type),
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
