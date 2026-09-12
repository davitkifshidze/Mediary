<?php

namespace App\Services\Video;

use App\Models\Video;
use App\Services\Storage\StorageMeter;
use App\Support\BackgroundProcess;
use App\Support\StorageFolder;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * **ვიდეოს ლოკალურად ჩამოწერის ორკესტრი (Tasks §7.1).**
 *
 * ორი შესასვლელი აქვს და ისინი განზრახ გაყოფილია:
 *  · `start()` — HTTP-დან: ამოწმებს, ნიშნავს `running`-ს და **ფონურ**
 *    `artisan videos:download`-ს უშვებს. მყისიერად ბრუნდება.
 *  · `run()` — იმ ბრძანების შიგნიდან: მართლა წერს, ითვლის და ჩანაწერს ავსებს.
 *
 * ⚠️ **კვოტა ორჯერ მოწმდება და ორივე საჭიროა.** ჩამოწერამდე — სავარაუდო
 * ზომით, რომ ნახევარსაათიანი ჩამოწერა ტყუილად არ დაიწყოს; ჩამოწერის შემდეგ —
 * ნამდვილით, რადგან სავარაუდო ცდება. მეორეზე ჩავარდნისას ფაილი **იშლება**:
 * კვოტა ლიმიტია და არა რჩევა, ე.ი. მისი გადალახვა ვერ დარჩება.
 */
class VideoDownloader
{
    public function __construct(
        private readonly YtDlp $ytdlp,
        private readonly StorageMeter $meter,
        private readonly BackgroundProcess $background,
    ) {}

    /**
     * HTTP-ის მხარე: შემოწმება + ფონური გაშვება.
     *
     * @throws HttpResponseException 503 (პროგრამა არ არის) / 409 (უკვე მიმდინარეობს) / 413 (კვოტა)
     */
    public function start(Video $video): void
    {
        if (! $this->ytdlp->available()) {
            throw new HttpResponseException(response()->json([
                'message' => 'ytdlp_unavailable',
            ], 503));
        }

        // ⚠️ „უკვე მიმდინარეობს" **ცალკე პასუხია** და არა ჩუმი მეორე გაშვება:
        // ორი პარალელური yt-dlp ერთსა და იმავე ვიდეოზე ორჯერ დახარჯავდა კვოტას.
        if ($video->download_status === Video::DOWNLOAD_RUNNING) {
            throw new HttpResponseException(response()->json([
                'message' => 'download_already_running',
            ], 409));
        }

        // წინა ასლი (თუ იყო) ჯერ თავისუფლდება — ორი ფაილი ერთ ვიდეოზე არ არსებობს
        $video->deleteDownload();

        $approx = $this->ytdlp->probe($video->url)['filesize'];
        if ($approx) {
            // იგივე `guard()`, რაც ატვირთვას აქვს: ანგარიშიც და მოდულის ლიმიტიც
            $this->meter->guard($video->user, $approx, StorageFolder::VIDEO_DOWNLOADS);
        }

        $video->forceFill([
            'download_status' => Video::DOWNLOAD_RUNNING,
            'download_error' => null,
        ])->save();

        $launched = $this->background->dispatch([
            PHP_BINARY,
            base_path('artisan'),
            'videos:download',
            (string) $video->getKey(),
        ]);

        if (! $launched) {
            // ⚠️ `running`-ად დატოვება იმას ნიშნავდა, რომ UI სამუდამოდ დაელოდებოდა
            $video->forceFill([
                'download_status' => Video::DOWNLOAD_FAILED,
                'download_error' => 'ფონური პროცესი ვერ გაეშვა (popen/exec გამორთულია)',
            ])->save();

            throw new HttpResponseException(response()->json([
                'message' => 'ytdlp_unavailable',
            ], 503));
        }
    }

    /**
     * ნამდვილი სამუშაო — `artisan videos:download`-ის შიგნიდან.
     *
     * ⚠️ **არასდროს აგდებს გამონაკლისს გარეთ**: ეს ფონური პროცესია და მისი
     * ჩავარდნა მხოლოდ ჩანაწერში ჩანს. ამიტომ ყველა შეცდომა `failed` +
     * `download_error`-ად იწერება — „ვცადეთ და ვერ გამოვიდა, აი რატომ".
     */
    public function run(Video $video): bool
    {
        $temp = storage_path('app/ytdlp/'.Str::random(16));

        try {
            $result = $this->ytdlp->download($video->url, $temp);

            // ნამდვილი ზომა — სავარაუდო ცდება და კვოტა ლიმიტია
            $this->meter->guard($video->user, $result['size'], StorageFolder::VIDEO_DOWNLOADS);

            $path = $this->meter->storeLocalFile(
                $video->user,
                $result['path'],
                StorageFolder::VIDEO_DOWNLOADS,
                $result['name'],
            );

            $video->forceFill([
                'download_path' => $path,
                'download_name' => $result['name'],
                'download_size' => $result['size'],
                'download_format' => $result['format'],
                'download_status' => Video::DOWNLOAD_READY,
                'download_error' => null,
                'downloaded_at' => now(),
            ])->save();

            return true;
        } catch (HttpResponseException $e) {
            // `guard()` 413-ს აგდებს — ფონურ პროცესში ეს უბრალოდ მიზეზია
            $this->fail($video, $this->quotaReason($e));

            return false;
        } catch (\Throwable $e) {
            $this->fail($video, $e->getMessage());

            return false;
        } finally {
            // ⚠️ დროებითი საქაღალდე **ყოველთვის** ქრება: ის `storage/app`-შია და
            // კვოტაში არ ითვლება, ე.ი. იქ დარჩენილი გიგაბაიტები უხილავი იქნებოდა
            File::deleteDirectory($temp);
        }
    }

    private function fail(Video $video, string $reason): void
    {
        Log::warning('videos:download failed', ['video' => $video->getKey(), 'reason' => $reason]);

        $video->forceFill([
            'download_status' => Video::DOWNLOAD_FAILED,
            'download_error' => mb_substr($reason, 0, 500),
            'download_path' => null,
            'download_size' => 0,
        ])->save();
    }

    private function quotaReason(HttpResponseException $e): string
    {
        $payload = $e->getResponse()->getContent();
        $data = json_decode(is_string($payload) ? $payload : '', true);

        return is_array($data) && isset($data['message'])
            ? (string) $data['message']
            : 'storage_quota_exceeded';
    }
}
