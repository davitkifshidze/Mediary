<?php

namespace App\Console\Commands;

use App\Models\Video;
use App\Services\Video\VideoDownloader;
use Illuminate\Console\Command;

/**
 * **`php artisan videos:download {video*}` — ვიდეოს (ან რიგის) ჩამოტვირთვა.**
 *
 * რამდენიმე id — კურსის ჯგუფური ჩამოტვირთვა: რიგრიგობით, ერთი `yt-dlp`
 * ერთდროულად (`VideoDownloader::runQueue()`).
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
    protected $signature = 'videos:download {video* : ვიდეოს id (რამდენიმე — რიგრიგობით)}';

    protected $description = 'ვიდეოს ლოკალურად ჩამოწერა yt-dlp-ით';

    public function handle(VideoDownloader $downloader): int
    {
        $ids = array_map('intval', (array) $this->argument('video'));

        if (count($ids) === 1 && ! Video::find($ids[0])) {
            $this->error('ასეთი ვიდეო არ არსებობს.');

            return self::FAILURE;
        }

        $failed = 0;

        $downloader->runQueue($ids, function (Video $video, bool $ok) use (&$failed) {
            if ($ok) {
                $this->info("მზადაა: {$video->title} · ".($video->fresh()?->download_format ?? ''));

                return;
            }

            $failed++;
            // მიზეზი ჩანაწერშია — ფონურ გაშვებაზე კონსოლს ვერავინ კითხულობს
            $this->error("{$video->title}: ".($video->fresh()?->download_error ?? 'ჩამოწერა ჩავარდა.'));
        });

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
