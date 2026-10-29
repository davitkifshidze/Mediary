<?php

namespace App\Services\Video;

use App\Models\Video;
use App\Services\Storage\StorageMeter;
use App\Support\BackgroundProcess;
use App\Support\Redact;
use App\Support\StorageFolder;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * **ვიდეოს ლოკალურად ჩამოწერის ორკესტრი.**
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

        /* ⚠️ „უკვე მიმდინარეობს" **ცალკე პასუხია** და არა ჩუმი მეორე გაშვება:
           ორი პარალელური yt-dlp ერთსა და იმავე ვიდეოზე ორჯერ დახარჯავდა კვოტას.

           ⚠️ **მაგრამ მხოლოდ მაშინ, თუ ის მართლა მიმდინარეობს**.
           ფონური პროცესი შეიძლება მოკვდეს — სერვერის
           ტერმინალის დახურვით, მანქანის გადატვირთვით, ფატალური შეცდომით —
           და მაშინ `running` სამუდამოდ რჩებოდა: `POST` 409-ს აბრუნებდა,
           `DELETE` ბილიკის არქონის გამო არაფერს აკეთებდა, ე.ი. ჩამოწერა ამ
           ვიდეოზე ხელით SQL-ის გარეშე **ვეღარასდროს გაეშვებოდა**. */
        if (in_array($video->download_status, [Video::DOWNLOAD_RUNNING, Video::DOWNLOAD_QUEUED], true) && ! $video->downloadStale()) {
            throw new HttpResponseException(response()->json([
                'message' => 'download_already_running',
            ], 409));
        }

        if ($video->downloadStale()) {
            Log::warning('videos:download stale run reclaimed', [
                'video' => $video->getKey(),
                'started_at' => $video->download_started_at?->toIso8601String(),
            ]);
        }

        /* ⚠️ **ჯერ კვოტა, მერე წაშლა**. ადრე პირიქით იყო: ძველი ასლი
           იშლებოდა და `guard()` მხოლოდ ამის შემდეგ ამოწმებდა — ე.ი. სავსე
           კვოტაზე „ხელახლა ჩამოტვირთვა" 413-ს აბრუნებდა და **ფაილს უკვე
           აღარ ჰქონდა**. სვეტები `save()`-მდე ვერ აღწევდა, ამიტომ ჩანაწერი
           კიდევ `ready`-ს ამბობდა და გახსნა 404-ს იძლეოდა.

           ⚠️ **ძველი ასლის ბაიტები კვოტიდან წინასწარ გამოიკლება**: ის სწორედ
           ამ ჩამოტვირთვას დაეთმობა. მის გარეშე ჩანაწერი საკუთარ ადგილს
           დაიკავებდა და ზუსტად სავსე კვოტაზე განახლება შეუძლებელი იქნებოდა.
           `needed` ამიტომ **სხვაობაა** — „კიდევ რამდენი მჭირდება" — და
           `remaining`-თან შედარება სწორად რჩება. */
        $approx = $this->ytdlp->probe($video->url)['filesize'];

        if ($approx) {
            // იგივე `guard()`, რაც ატვირთვას აქვს: ანგარიშიც და მოდულის ლიმიტიც
            $this->meter->guard(
                $video->user,
                max(0, $approx - $this->freedBytes($video)),
                StorageFolder::VIDEO_DOWNLOADS,
            );
        }

        // წინა ასლი (თუ იყო) თავისუფლდება — ორი ფაილი ერთ ვიდეოზე არ არსებობს
        $video->deleteDownload();

        $video->forceFill([
            'download_status' => Video::DOWNLOAD_RUNNING,
            'download_error' => null,
            // ⚠️ **ცალკე სვეტი და არა `updated_at`**: ეს ერთადერთი ფაქტია,
            // რომლითაც მკვდარი გაშვება ცოცხლისგან გაირჩევა (იხ. `downloadStale()`)
            'download_started_at' => now(),
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
                'download_error' => 'background_unavailable',
                'download_started_at' => null,
            ])->save();

            throw new HttpResponseException(response()->json([
                'message' => 'ytdlp_unavailable',
            ], 503));
        }
    }

    /**
     * **რამდენიმე ვიდეო ერთ ფონურ პროცესად, რიგრიგობით** (კურსის „ჩამოტვირთვა").
     *
     * ⚠️ ერთი `yt-dlp` ერთდროულად: ოცდაათი პარალელური პროცესი ქსელსაც და
     * დისკსაც გადატვირთავდა, `artisan serve` კი თითო `probe()`-ზე წუთობით
     * გაიჭედებოდა. ამიტომ წინასწარი ზომა აქ არ იზომება — მას გეგმა აჩვენებს
     * (`CoursePlaylistVideoController::plan()`), ნამდვილ კვოტას კი `run()` თითო ვიდეოზე.
     *
     * ყველა მაშინვე `queued`-ია (UI „რიგში"-ს წერს, მეორე გაშვება 409-ია);
     * მზა, მიმდინარე და ცოცხალ რიგში მდგომი გამოტოვდება.
     *
     * @param  iterable<Video>  $videos
     * @return list<int> რიგში ჩაყენებულების id-ები
     *
     * @throws HttpResponseException 503 (პროგრამა არ არის ან ფონური პროცესი ვერ გაეშვა)
     */
    public function startBatch(iterable $videos): array
    {
        if (! $this->ytdlp->available()) {
            throw new HttpResponseException(response()->json(['message' => 'ytdlp_unavailable'], 503));
        }

        $ids = [];

        foreach ($videos as $video) {
            $busy = in_array($video->download_status, [Video::DOWNLOAD_RUNNING, Video::DOWNLOAD_QUEUED], true);
            if ($video->hasDownload() || ($busy && ! $video->downloadStale())) {
                continue;
            }

            $video->forceFill([
                'download_status' => Video::DOWNLOAD_QUEUED,
                'download_error' => null,
                'download_started_at' => now(),
            ])->save();
            $ids[] = (int) $video->getKey();
        }

        if ($ids === []) {
            return [];
        }

        $launched = $this->background->dispatch([
            PHP_BINARY,
            base_path('artisan'),
            'videos:download',
            ...array_map('strval', $ids),
        ]);

        if (! $launched) {
            Video::query()->whereIn('id', $ids)->update([
                'download_status' => Video::DOWNLOAD_FAILED,
                'download_error' => 'background_unavailable',
                'download_started_at' => null,
            ]);

            throw new HttpResponseException(response()->json(['message' => 'ytdlp_unavailable'], 503));
        }

        return $ids;
    }

    /**
     * **რიგის დამუშავება** — `artisan videos:download {ids*}`-ის შიგნიდან.
     *
     * ერთი id — ჩვეულებრივი გაშვება (ღილაკიდან ან ხელით), სტატუსის მიუხედავად.
     * რამდენიმე — რიგი: მხოლოდ `queued`/`running` მუშავდება (ჩამოტვირთვის
     * მოხსნა რიგიდან სტატუსს ასუფთავებს და ვიდეო გამოტოვდება), ყოველი ვიდეოს
     * დასაწყისში კი რიგში დარჩენილებს „გულისცემა" ეხებათ (`download_started_at`).
     *
     * @param  list<int>  $ids
     * @param  callable(Video, bool): void|null  $report  ვიდეო და შედეგი (კონსოლისთვის)
     */
    public function runQueue(array $ids, ?callable $report = null): void
    {
        $single = count($ids) === 1;

        foreach (array_values($ids) as $i => $id) {
            $video = Video::query()->find($id);
            $waiting = $video && in_array($video->download_status, [Video::DOWNLOAD_RUNNING, Video::DOWNLOAD_QUEUED], true);

            if (! $video || (! $single && ! $waiting)) {
                continue;
            }

            $rest = array_slice($ids, $i + 1);
            if ($rest !== []) {
                Video::query()->whereIn('id', $rest)
                    ->where('download_status', Video::DOWNLOAD_QUEUED)
                    ->update(['download_started_at' => now()]);
            }

            if ($video->download_status === Video::DOWNLOAD_QUEUED) {
                $video->forceFill(['download_status' => Video::DOWNLOAD_RUNNING, 'download_started_at' => now()])->save();
            }

            $ok = $this->run($video);

            if ($report) {
                $report($video, $ok);
            }
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
            /* ⚠️ კვოტა უკვე სავსეა? — ჯგუფში წინასწარი ზომა არ იზომება, ე.ი.
               ამის გარეშე ყოველი შემდეგი ვიდეო ბოლომდე ჩამოიწერებოდა და მხოლოდ
               მერე წაიშლებოდა */
            $this->meter->guard($video->user, 1, StorageFolder::VIDEO_DOWNLOADS);

            $result = $this->ytdlp->download($video->url, $temp);

            // ნამდვილი ზომა — სავარაუდო ცდება და კვოტა ლიმიტია
            $this->meter->guard($video->user, $result['size'], StorageFolder::VIDEO_DOWNLOADS);

            $path = $this->meter->storeLocalFile(
                $video->user,
                $result['path'],
                StorageFolder::VIDEO_DOWNLOADS,
                $result['name'],
            );

            /* ⚠️ `videos:download {id}` უკვე ჩამოწერილზეც ეშვება (`start()`-ის გვერდის ავლით) —
               ძველი ასლი ჯერ თავისუფლდება, თორემ ფაილი ობლად და მისი ბაიტები მრიცხველში დარჩებოდა */
            $this->releaseDownload($video);

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
            $this->fail($video, Redact::secrets($e->getMessage()));

            return false;
        } finally {
            // ⚠️ დროებითი საქაღალდე **ყოველთვის** ქრება: ის `storage/app`-შია და
            // კვოტაში არ ითვლება, ე.ი. იქ დარჩენილი გიგაბაიტები უხილავი იქნებოდა
            File::deleteDirectory($temp);
        }
    }

    /**
     * **რამდენი ბაიტი გათავისუფლდება ძველი ასლის წაშლით**.
     *
     * ⚠️ `download_path`-ს ეკითხება და არა `download_size`-ს: ჩავარდნილი
     * გაშვების შემდეგ ზომა შეიძლება დარჩეს, ფაილი კი — არა, და მაშინ
     * ეს „კრედიტი" კვოტას მოჩვენებით გაზრდიდა.
     */
    private function freedBytes(Video $video): int
    {
        return $video->download_path ? (int) $video->download_size : 0;
    }

    /** არსებული ასლის ფაილი და მისი ბაიტები — სვეტებს არ ეხება (მათ გამომძახებელი წერს) */
    private function releaseDownload(Video $video): void
    {
        if (! $video->download_path) {
            return;
        }

        $this->meter->deleteUpload(null, $video->download_path);
        $this->meter->addFor((int) $video->user_id, -(int) $video->download_size);
    }

    private function fail(Video $video, string $reason): void
    {
        Log::warning('videos:download failed', ['video' => $video->getKey(), 'reason' => $reason]);

        // ⚠️ სვეტი ცარიელდება — ამიტომ ფაილიც და ბაიტებიც აქვე თავისუფლდება
        $this->releaseDownload($video);

        $video->forceFill([
            'download_status' => Video::DOWNLOAD_FAILED,
            'download_error' => mb_substr($reason, 0, 500),
            'download_path' => null,
            'download_size' => 0,
            'download_started_at' => null,
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
