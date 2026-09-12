<?php

namespace App\Services\Video;

use Illuminate\Support\Facades\File;
use Symfony\Component\Process\Exception\ProcessTimedOutException;
use Symfony\Component\Process\ExecutableFinder;
use Symfony\Component\Process\Process;

/**
 * **`yt-dlp` — ვიდეოს ლოკალურად ჩამოწერა (Tasks §7.1).**
 *
 * ⚠️ **ერთადერთი ადგილი, საიდანაც `yt-dlp` ეშვება.** იგივე წესი, რაც
 * `SerpApiClient`-ს აქვს: მეორე გზა ერთ დღეში სხვა დროშებით წავიდოდა და
 * „რატომ სხვა ხარისხი ჩამოვიდა" უპასუხოდ დარჩებოდა.
 *
 * ⚠️ **პროგრამის არქონა ცალკე მდგომარეობაა** და არა შეცდომა: `available()`
 * false-ს აბრუნებს, endpoint კი 503 `ytdlp_unavailable`-ს. „ინსტრუმენტი არ
 * გვაქვს" და „ვიდეო ვერ ჩამოვიდა" სხვადასხვა ფაქტებია (იგივე განსხვავება,
 * რაც `bgg_unavailable`-სა და ცარიელ სიას შორისაა).
 *
 * ⚠️ **ხარისხი — „საუკეთესო ხელმისაწვდომი"** (user-ის გადაწყვეტილება
 * 2026-09-12). `ffmpeg`-ით ეს ცალკე ვიდეო+აუდიო ნაკადების შერწყმაა,
 * მის გარეშე — საუკეთესო ერთფაილიანი (progressive) ვარიანტი. რომელი
 * მივიღეთ, `format()`-ით ბრუნდება და ჩანაწერში იწერება: „1080p" და „360p"
 * შორის განსხვავება მომხმარებელმა უნდა დაინახოს და არა გამოიცნოს.
 */
class YtDlp
{
    /** ⚠️ არგუმენტები **მასივია** და არა სტრიქონი — shell-ის escaping საერთოდ არ ერევა */
    public function available(): bool
    {
        return $this->binary() !== null;
    }

    /** სრული ბილიკი, ან `null` — თუ არც `.env`-შია და არც PATH-ზე */
    public function binary(): ?string
    {
        $configured = (string) config('mediary.ytdlp.binary', '');

        if ($configured !== '') {
            return is_file($configured) ? $configured : null;
        }

        return (new ExecutableFinder)->find('yt-dlp');
    }

    /** `ffmpeg` სურვილისამებრია: მისი არსებობა ხარისხის ჭერს განსაზღვრავს */
    public function ffmpeg(): ?string
    {
        $configured = (string) config('mediary.ytdlp.ffmpeg', '');

        if ($configured !== '') {
            return is_file($configured) ? $configured : null;
        }

        return (new ExecutableFinder)->find('ffmpeg');
    }

    public function version(): ?string
    {
        $binary = $this->binary();
        if (! $binary) {
            return null;
        }

        $process = new Process([$binary, '--version']);
        $process->setTimeout(20);

        try {
            $process->run();
        } catch (\Throwable) {
            return null;
        }

        return $process->isSuccessful() ? trim($process->getOutput()) ?: null : null;
    }

    /**
     * ჩამოწერამდე: სათაური და **სავარაუდო ზომა**.
     *
     * ⚠️ ეს არის ერთადერთი გზა, კვოტა ჩამოწერამდე შევამოწმოთ. სავარაუდოა
     * და არა ზუსტი — ამიტომ ნამდვილი ზომა ჩამოწერის **შემდეგაც** მოწმდება.
     * წაკითხვის ჩავარდნა აქ **შეცდომა არ არის**: `null` ზომა ნიშნავს „ვერ
     * გავიგე" და ჩამოწერას არ ბლოკავს — ეს იმავე ოჯახის წესია, რაც
     * `LinkMetadata`-ს აქვს (გატეხილი მეტამონაცემი ჩანაწერს არ აჩერებს).
     *
     * @return array{title: ?string, duration: ?int, filesize: ?int}
     */
    public function probe(string $url): array
    {
        $binary = $this->binary();
        if (! $binary) {
            return ['title' => null, 'duration' => null, 'filesize' => null];
        }

        $process = new Process([
            $binary,
            '--no-playlist',
            '--no-warnings',
            '--skip-download',
            '--print', '%(title)s',
            '--print', '%(duration)s',
            // ⚠️ `filesize` ხშირად ცარიელია (streaming manifest), `filesize_approx` — არა
            '--print', '%(filesize,filesize_approx)s',
            '-f', $this->formatSelector(),
            $url,
        ]);
        $process->setTimeout((int) config('mediary.ytdlp.probe_timeout', 60));

        try {
            $process->run();
        } catch (\Throwable) {
            return ['title' => null, 'duration' => null, 'filesize' => null];
        }

        if (! $process->isSuccessful()) {
            return ['title' => null, 'duration' => null, 'filesize' => null];
        }

        $lines = preg_split('/\R/', trim($process->getOutput())) ?: [];
        $value = fn (int $i) => isset($lines[$i]) && trim($lines[$i]) !== '' && trim($lines[$i]) !== 'NA'
            ? trim($lines[$i])
            : null;

        return [
            'title' => $value(0),
            'duration' => is_numeric($value(1) ?? '') ? (int) round((float) $value(1)) : null,
            'filesize' => is_numeric($value(2) ?? '') ? (int) $value(2) : null,
        ];
    }

    /**
     * ჩამოწერა **ცარიელ დროებით საქაღალდეში**.
     *
     * ⚠️ შედეგი საქაღალდის **სკანირებით** ბრუნდება და არა `yt-dlp`-ის
     * გამონატანის გარჩევით: `--print`-ის ფორმატები ვერსიებს შორის იცვლება,
     * ცარიელი საქაღალდე კი ცალსახა კონტრაქტია — რაც შიგნით გაჩნდა, ის
     * ჩამოვწერეთ. ერთზე მეტი ფაილი (ცალკე აუდიო, ქვესათაური) ზომით
     * ყველაზე დიდზე წყდება.
     *
     * @return array{path: string, name: string, size: int, format: ?string}
     *
     * @throws \RuntimeException
     */
    public function download(string $url, string $targetDir): array
    {
        $binary = $this->binary();
        if (! $binary) {
            throw new \RuntimeException('ytdlp_unavailable');
        }

        File::ensureDirectoryExists($targetDir);

        $args = [
            $binary,
            '--no-playlist',
            '--no-warnings',
            '--no-progress',
            // ჩამოწერის შეწყვეტისას ნახევრად ჩამოსული ფაილი არ დარჩეს
            '--no-continue',
            '--no-part',
            '-f', $this->formatSelector(),
            '-o', rtrim($targetDir, '/\\').DIRECTORY_SEPARATOR.'%(id)s.%(ext)s',
        ];

        if ($ffmpeg = $this->ffmpeg()) {
            // შერწყმა მხოლოდ ffmpeg-ით შეიძლება; ერთი კონტეინერი — ერთი ფაილი
            $args[] = '--ffmpeg-location';
            $args[] = $ffmpeg;
            $args[] = '--merge-output-format';
            $args[] = 'mp4';
        }

        $args[] = $url;

        $process = new Process($args);
        $process->setTimeout((int) config('mediary.ytdlp.timeout', 1800));

        try {
            $process->run();
        } catch (ProcessTimedOutException) {
            throw new \RuntimeException('ჩამოწერა დროში ვერ ჩაეტია');
        }

        if (! $process->isSuccessful()) {
            throw new \RuntimeException($this->reason($process));
        }

        $files = collect(File::files($targetDir))
            ->sortByDesc(fn ($f) => $f->getSize())
            ->values();

        if ($files->isEmpty()) {
            throw new \RuntimeException('yt-dlp დასრულდა, ფაილი კი არ შექმნილა');
        }

        $file = $files->first();

        return [
            'path' => $file->getPathname(),
            'name' => $file->getFilename(),
            'size' => (int) $file->getSize(),
            'format' => $this->format($url, $file->getFilename()),
        ];
    }

    /**
     * „საუკეთესო ხელმისაწვდომი" — user-ის არჩევანი (2026-09-12).
     *
     * ⚠️ `ffmpeg`-ის გარეშე `bv*+ba` **უბრალოდ ჩავარდებოდა** („requested merge
     * but ffmpeg is not installed"), ამიტომ მაშინ პირდაპირ ერთფაილიანს
     * ვთხოვთ. ორივე შემთხვევაში ბოლო `/b` არის „რაც არის, ის მომეცი" —
     * თორემ არასტანდარტული წყარო უშედეგოდ დამთავრდებოდა.
     */
    private function formatSelector(): string
    {
        return $this->ffmpeg() ? 'bv*+ba/b' : 'b';
    }

    /** „1080p · mp4" — რაც სინამდვილეში მივიღეთ (ფაილიდან, და არა დაპირებიდან) */
    private function format(string $url, string $filename): ?string
    {
        $binary = $this->binary();
        if (! $binary) {
            return null;
        }

        $extension = strtoupper(pathinfo($filename, PATHINFO_EXTENSION));

        $process = new Process([
            $binary, '--no-playlist', '--no-warnings', '--skip-download',
            '--print', '%(resolution)s',
            '-f', $this->formatSelector(),
            $url,
        ]);
        $process->setTimeout((int) config('mediary.ytdlp.probe_timeout', 60));

        try {
            $process->run();
        } catch (\Throwable) {
            return $extension ?: null;
        }

        $resolution = trim($process->getOutput());
        $resolution = $resolution !== '' && $resolution !== 'NA' ? explode("\n", $resolution)[0] : '';

        return trim(trim($resolution).($extension ? ' · '.$extension : '')) ?: null;
    }

    /**
     * ჩავარდნის მიზეზი **ადამიანისთვის**.
     *
     * ⚠️ `yt-dlp`-ის stderr ათეულობით სტრიქონია; ჩანაწერში მთელი მისი ჩაწერა
     * `download_error`-ს ლოგად აქცევდა. ვიღებთ პირველ `ERROR:` სტრიქონს —
     * სწორედ ის ამბობს, რატომ („Video unavailable", „Private video").
     */
    private function reason(Process $process): string
    {
        $output = trim($process->getErrorOutput()) ?: trim($process->getOutput());

        foreach (preg_split('/\R/', $output) ?: [] as $line) {
            if (str_contains($line, 'ERROR:')) {
                return trim(str_replace('ERROR:', '', $line));
            }
        }

        return mb_substr($output, 0, 500) ?: 'yt-dlp დაასრულა კოდით '.$process->getExitCode();
    }
}
