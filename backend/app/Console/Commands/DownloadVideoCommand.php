<?php

namespace App\Console\Commands;

use App\Models\Video;
use App\Services\Video\VideoDownloader;
use Illuminate\Console\Command;

/**
 * **`php artisan videos:download {video}` — Tasks §7.1.**
 *
 * ⚠️ ეს ბრძანება **ორივე გზაზეა**: მას SPA-ც უშვებს (ფონურად,
 * `VideoDownloader::start()`-იდან) და ხელითაც შეიძლება გაეშვას. ერთი
 * შესასრულებელი კოდი ორივესთვის — თორემ „ღილაკით სხვანაირად ჩამოდის"
 * გამოიკვეთებოდა.
 *
 * ⚠️ CLI-ზე `Auth::id()` ცარიელია, ე.ი. `owner` scope გამორთულია და ვიდეო
 * id-ით პირდაპირ იძებნება (იგივე, რაც `media:redownload`-ს აქვს).
 */
class DownloadVideoCommand extends Command
{
    protected $signature = 'videos:download {video : ვიდეოს id}';

    protected $description = 'ვიდეოს ლოკალურად ჩამოწერა yt-dlp-ით (Tasks §7.1)';

    public function handle(VideoDownloader $downloader): int
    {
        $video = Video::find((int) $this->argument('video'));

        if (! $video) {
            $this->error('ასეთი ვიდეო არ არსებობს.');

            return self::FAILURE;
        }

        $this->info("ჩამოწერა: {$video->title}");

        if (! $downloader->run($video)) {
            // მიზეზი ჩანაწერშია — ფონურ გაშვებაზე კონსოლს ვერავინ კითხულობს
            $this->error($video->fresh()?->download_error ?? 'ჩამოწერა ჩავარდა.');

            return self::FAILURE;
        }

        $this->info('მზადაა: '.($video->fresh()?->download_format ?? ''));

        return self::SUCCESS;
    }
}
