<?php

namespace App\Support;

use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\UploadedFile;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * **ატვირთული ფაილის უსაფრთხო გაცემა (Tasks SEC-04, 2026-09-17).**
 *
 * ⚠️ **ხვრელი**: ჩატის ფაილი `Content-Type`-ად **კლიენტის** multipart-ჰედერს
 * აბრუნებდა, `inline`-ით. A აგზავნიდა `.html`-ს `text/html`-ით, B დააჭერდა
 * ბმულს (`/api/chat/files/{id}`, **აპის origin-ზე**, B-ს ქუქით) — და A-ს
 * სკრიპტი B-ს სესიით ნებისმიერ endpoint-ს იძახდა. მონაწილეობის შემოწმება
 * არ შველოდა: B ლეგიტიმური მონაწილეა.
 *
 * სამი წესი, სამივე სავალდებულო:
 * - ⚠️ **MIME სერვერი ადგენს, შიგთავსიდან** (`finfo`, local adapter-ის
 *   `mimeType()`), და **არასდროს** — კლიენტის ჰედერიდან ან შენახულ სვეტიდან.
 *   სვეტი ძველ რიგზე ყალბი შეიძლება იყოს; ფაილი — არ ტყუის.
 * - ⚠️ **`inline` — მხოლოდ allow-list-იდან.** სია „ხატვადი, მაგრამ სკრიპტის
 *   არშემსრულებელი" ტიპებია: raster-სურათი, ვიდეო/აუდიო, PDF (ბრაუზერის
 *   sandbox-ვიუერი), უბრალო ტექსტი. ⚠️ **SVG, HTML, XML სიაში არ არიან და
 *   არც ერთ დღეს არ უნდა მოხვდნენ** — სამივე სკრიპტს ასრულებს. დანარჩენი
 *   ყველაფერი `application/octet-stream` + `attachment` — ბრაუზერი
 *   ჩამოტვირთავს და არ ხატავს.
 * - ⚠️ **`X-Content-Type-Options: nosniff` ყოველ პასუხზე** — თორემ ბრაუზერი
 *   `text/plain`-ში HTML-ს „გამოიცნობდა".
 *
 * ⚠️ allow-list-ში აპის **ყველა** ლეგიტიმური მედია-ფორმატი უნდა იყოს
 * (`UploadLimits`: ვიდეო mp4/webm/ogg/mov/m4v) — თორემ ფიქსი ჩატის ნორმალურ
 * ვიდეოს ჩამოსატვირთ ფაილად აქცევდა.
 */
final class SafeMime
{
    /** ბრაუზერში `inline` ხატვადი და სკრიპტის არშემსრულებელი ტიპები */
    public const INLINE = [
        // raster სურათები (⚠️ `image/svg+xml` განზრახ არ არის)
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp',
        // ვიდეო — `UploadLimits::KINDS['video']`-ის ფორმატები
        'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-m4v',
        // აუდიო
        'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mp4', 'audio/flac', 'audio/x-flac',
        // ბრაუზერის sandbox-ვიუერი
        'application/pdf',
        // ⚠️ უბრალო ტექსტი `nosniff`-ით ტექსტადვე იხატება; `text/html` — არა
        'text/plain', 'text/csv', 'application/json',
    ];

    /** fallback — ჩამოტვირთვა, და არასდროს ხატვა */
    public const DOWNLOAD = 'application/octet-stream';

    /**
     * ატვირთული ფაილის MIME **სერვერის** გამოცნობით (`finfo`), და არა
     * `getClientMimeType()`-ით — შესანახ სვეტისთვის.
     */
    public static function ofUpload(UploadedFile $file): string
    {
        return strtolower((string) ($file->getMimeType() ?: self::DOWNLOAD));
    }

    /** დისკზე მდგომ ფაილის MIME შიგთავსიდან; `null` — თუ ვერ დადგინდა */
    public static function detect(FilesystemAdapter $disk, string $path): ?string
    {
        $mime = $disk->mimeType($path);

        return is_string($mime) && $mime !== '' ? strtolower($mime) : null;
    }

    public static function isInline(?string $mime): bool
    {
        return $mime !== null && in_array($mime, self::INLINE, true);
    }

    /**
     * **ერთადერთი გზა ატვირთული ფაილის გასაცემად.** `$name` — ჩამოტვირთვის
     * სახელი (კლიენტის; ⚠️ Symfony მას `Content-Disposition`-ში ესქეიპავს).
     */
    public static function response(FilesystemAdapter $disk, string $path, ?string $name = null): StreamedResponse
    {
        $mime = self::detect($disk, $path);
        $inline = self::isInline($mime);

        return $disk->response(
            $path,
            $name,
            [
                'Content-Type' => $inline ? $mime : self::DOWNLOAD,
                'X-Content-Type-Options' => 'nosniff',
            ],
            $inline ? 'inline' : 'attachment',
        );
    }
}
