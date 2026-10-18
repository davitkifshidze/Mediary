<?php

namespace App\Services\Personal;

use App\Services\Video\YtDlp;
use App\Support\AppTime;
use App\Support\ProcessEnv;
use Illuminate\Support\Carbon;
use Symfony\Component\Process\ExecutableFinder;
use Symfony\Component\Process\Process;

/**
 * **ატვირთული ფოტოს/ვიდეოს შემოწმება — ზომები, თარიღი, ესკიზი.**
 *
 * ⚠️ **ფოტოს ესკიზი GD-თია და არა ffmpeg-ით**: ffmpeg EXIF-ის ორიენტაციას
 * ყოველთვის არ კითხულობს, ბრაუზერი კი ორიგინალს ორიენტაციით ხატავს — ე.ი.
 * ესკიზი გვერდზე წოლილი გამოვიდოდა, გახსნილი ფოტო კი სწორი. აქ ორიენტაცია
 * ხელით ბრუნდება (`exif_read_data`), GD კი ყველგან არის.
 *
 * ⚠️ **მეხსიერება დროებით იზრდება**: 48-მეგაპიქსელიანი ფოტო GD-ში ~200 MB-ია,
 * `memory_limit` კი 128M — ესკიზი სწორედ დიდ ფოტოზე ჩავარდებოდა. ზღვარზე
 * მეტი (`MAX_PIXELS`) საერთოდ არ იკითხება.
 *
 * ⚠️ **ვიდეოს ესკიზი და ზომები ffmpeg/ffprobe-ითაა** (`.env`-ის
 * `FFMPEG_BINARY`, ffprobe იმავე საქაღალდიდან). მათ გარეშე ვიდეო მაინც
 * ინახება — უბრალოდ ესკიზის გარეშე (ბადე ხატულას ხატავს); ჩავარდნა
 * ატვირთვას არასდროს აჩერებს (`LinkMetadata`-ს წესი: მეტამონაცემი ჩანაწერს
 * არ ბლოკავს).
 */
class MediaInspector
{
    /** ესკიზის გრძელი გვერდი (px) — ბადის უჯრა ~300 px-ია, retina-ზე ორმაგი */
    public const THUMB_EDGE = 640;

    public const THUMB_QUALITY = 80;

    /** ამაზე დიდ ფოტოს GD-ში არ ვხსნით (~400 MB მეხსიერება) */
    private const MAX_PIXELS = 100_000_000;

    private const PROCESS_TIMEOUT = 60;

    public function __construct(private YtDlp $ytdlp) {}

    /**
     * @return array{width: ?int, height: ?int, duration: ?int, taken_at: ?Carbon, thumb: ?string}
     */
    public function inspect(string $absolutePath, string $kind): array
    {
        try {
            return $kind === 'video' ? $this->video($absolutePath) : $this->photo($absolutePath);
        } catch (\Throwable) {
            return ['width' => null, 'height' => null, 'duration' => null, 'taken_at' => null, 'thumb' => null];
        }
    }

    /* ================= ფოტო ================= */

    /**
     * @return array{width: ?int, height: ?int, duration: null, taken_at: ?Carbon, thumb: ?string}
     */
    private function photo(string $path): array
    {
        $info = @getimagesize($path);
        $width = $info ? (int) $info[0] : null;
        $height = $info ? (int) $info[1] : null;
        $type = $info ? (int) $info[2] : null;

        $exif = $type === IMAGETYPE_JPEG && function_exists('exif_read_data') ? (@exif_read_data($path) ?: []) : [];
        $orientation = (int) ($exif['Orientation'] ?? 1);

        // 5–8 — კადრი 90°-ითაა მობრუნებული: ნაჩვენები ზომები ადგილს იცვლის
        if ($orientation >= 5 && $orientation <= 8 && $width && $height) {
            [$width, $height] = [$height, $width];
        }

        return [
            'width' => $width,
            'height' => $height,
            'duration' => null,
            'taken_at' => $this->exifDate($exif),
            'thumb' => $width && $height && $width * $height <= self::MAX_PIXELS
                ? $this->photoThumb($path, $orientation)
                : null,
        ];
    }

    /** EXIF-ის თარიღი (`2024:05:01 10:00:00`) — კამერის ადგილობრივი დრო, ზონის გარეშე */
    private function exifDate(array $exif): ?Carbon
    {
        foreach (['DateTimeOriginal', 'DateTimeDigitized', 'DateTime'] as $key) {
            $raw = is_string($exif[$key] ?? null) ? trim($exif[$key]) : '';

            if ($raw === '' || str_starts_with($raw, '0000')) {
                continue;
            }

            try {
                return Carbon::createFromFormat('Y:m:d H:i:s', substr($raw, 0, 19), AppTime::zone()) ?: null;
            } catch (\Throwable) {
                continue;
            }
        }

        return null;
    }

    private function photoThumb(string $path, int $orientation): ?string
    {
        $previous = ini_get('memory_limit');
        $this->raiseMemory('512M');

        try {
            $contents = @file_get_contents($path);
            $image = $contents === false ? false : @imagecreatefromstring($contents);
            unset($contents);

            if (! $image) {
                return null;
            }

            $image = $this->orient($image, $orientation);
            $thumb = $this->fit($image);

            return $this->encode($thumb);
        } finally {
            if ($previous !== false) {
                @ini_set('memory_limit', $previous);
            }
        }
    }

    /** EXIF-ის რვა ორიენტაცია → ნორმალური კადრი */
    private function orient(\GdImage $image, int $orientation): \GdImage
    {
        $rotated = match ($orientation) {
            3, 4 => imagerotate($image, 180, 0),
            5, 6 => imagerotate($image, -90, 0),
            7, 8 => imagerotate($image, 90, 0),
            default => $image,
        };

        if (in_array($orientation, [2, 4, 5, 7], true)) {
            imageflip($rotated, IMG_FLIP_HORIZONTAL);
        }

        return $rotated ?: $image;
    }

    private function fit(\GdImage $image): \GdImage
    {
        $w = imagesx($image);
        $h = imagesy($image);
        $scale = min(1, self::THUMB_EDGE / max($w, $h, 1));

        if ($scale >= 1) {
            return $image;
        }

        return imagescale($image, max(1, (int) round($w * $scale)), max(1, (int) round($h * $scale)), IMG_BICUBIC) ?: $image;
    }

    private function encode(\GdImage $image): ?string
    {
        ob_start();
        $ok = function_exists('imagewebp')
            ? imagewebp($image, null, self::THUMB_QUALITY)
            : imagejpeg($image, null, self::THUMB_QUALITY);
        $bytes = (string) ob_get_clean();

        return $ok && $bytes !== '' ? $bytes : null;
    }

    private function raiseMemory(string $to): void
    {
        $current = (string) ini_get('memory_limit');

        if ($current === '-1' || $this->bytes($current) >= $this->bytes($to)) {
            return;
        }

        @ini_set('memory_limit', $to);
    }

    private function bytes(string $value): int
    {
        $value = trim($value);
        $number = (int) $value;

        return match (strtolower(substr($value, -1))) {
            'g' => $number * 1024 ** 3,
            'm' => $number * 1024 ** 2,
            'k' => $number * 1024,
            default => $number,
        };
    }

    /** ესკიზის გაფართოება — `encode()`-ის ფორმატი */
    public function thumbExtension(): string
    {
        return function_exists('imagewebp') ? 'webp' : 'jpg';
    }

    /* ================= ვიდეო ================= */

    /**
     * @return array{width: ?int, height: ?int, duration: ?int, taken_at: ?Carbon, thumb: ?string}
     */
    private function video(string $path): array
    {
        $probe = $this->probe($path);
        $duration = $probe['duration'];

        return [
            'width' => $probe['width'],
            'height' => $probe['height'],
            'duration' => $duration,
            'taken_at' => $probe['taken_at'],
            // ⚠️ პირველი წამი და არა 0 — პირველი კადრი ხშირად შავია
            'thumb' => $this->frame($path, $duration !== null && $duration < 2 ? 0 : 1)
                ?? $this->frame($path, 0),
        ];
    }

    /**
     * @return array{width: ?int, height: ?int, duration: ?int, taken_at: ?Carbon}
     */
    private function probe(string $path): array
    {
        $empty = ['width' => null, 'height' => null, 'duration' => null, 'taken_at' => null];
        $ffprobe = $this->ffprobe();

        if (! $ffprobe) {
            return $empty;
        }

        $process = new Process(
            [$ffprobe, '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', $path],
            null,
            ProcessEnv::for(),
        );
        $process->setTimeout(self::PROCESS_TIMEOUT);
        $process->run();

        if (! $process->isSuccessful()) {
            return $empty;
        }

        $json = json_decode($process->getOutput(), true);

        if (! is_array($json)) {
            return $empty;
        }

        $stream = collect($json['streams'] ?? [])->firstWhere('codec_type', 'video') ?? [];
        $width = isset($stream['width']) ? (int) $stream['width'] : null;
        $height = isset($stream['height']) ? (int) $stream['height'] : null;

        // ტელეფონის ვერტიკალური ვიდეო ჰორიზონტალურად იწერება და ბრუნვის ნიშანს ატარებს
        $sideData = collect($stream['side_data_list'] ?? [])->first(fn ($row) => is_array($row) && isset($row['rotation']));
        $rotation = abs((int) ($stream['tags']['rotate'] ?? $sideData['rotation'] ?? 0));
        if (in_array($rotation % 360, [90, 270], true) && $width && $height) {
            [$width, $height] = [$height, $width];
        }

        $seconds = $json['format']['duration'] ?? ($stream['duration'] ?? null);
        $created = $json['format']['tags']['creation_time'] ?? ($stream['tags']['creation_time'] ?? null);

        return [
            'width' => $width,
            'height' => $height,
            'duration' => is_numeric($seconds) ? (int) round((float) $seconds) : null,
            'taken_at' => $this->isoDate($created),
        ];
    }

    /** ვიდეოს `creation_time` UTC-შია — აპის ზონაში გადაგვაქვს (`AppTime`) */
    private function isoDate(mixed $value): ?Carbon
    {
        if (! is_string($value) || trim($value) === '' || str_starts_with($value, '1970') || str_starts_with($value, '1904')) {
            return null;
        }

        try {
            return AppTime::at(Carbon::parse($value));
        } catch (\Throwable) {
            return null;
        }
    }

    /** ერთი კადრი, `THUMB_EDGE`-მდე შემცირებული */
    private function frame(string $path, int $second): ?string
    {
        $ffmpeg = $this->ytdlp->ffmpeg();

        if (! $ffmpeg) {
            return null;
        }

        $extension = $this->thumbExtension();
        $out = tempnam(sys_get_temp_dir(), 'mediary-frame-');

        if ($out === false) {
            return null;
        }

        $target = $out.'.'.$extension;
        @unlink($out);

        try {
            $edge = self::THUMB_EDGE;
            $process = new Process([
                $ffmpeg, '-hide_banner', '-loglevel', 'error', '-y',
                '-ss', (string) $second,
                '-i', $path,
                '-frames:v', '1',
                '-vf', "scale=w={$edge}:h={$edge}:force_original_aspect_ratio=decrease",
                ...($extension === 'webp' ? ['-quality', (string) self::THUMB_QUALITY] : ['-q:v', '4']),
                $target,
            ], null, ProcessEnv::for());
            $process->setTimeout(self::PROCESS_TIMEOUT);
            $process->run();

            if (! $process->isSuccessful() || ! is_file($target) || filesize($target) === 0) {
                return null;
            }

            $bytes = file_get_contents($target);

            return $bytes === false || $bytes === '' ? null : $bytes;
        } finally {
            @unlink($target);
        }
    }

    private function ffprobe(): ?string
    {
        $ffmpeg = $this->ytdlp->ffmpeg();

        if ($ffmpeg) {
            foreach (['ffprobe.exe', 'ffprobe'] as $name) {
                $candidate = dirname($ffmpeg).DIRECTORY_SEPARATOR.$name;

                if (is_file($candidate)) {
                    return $candidate;
                }
            }
        }

        return (new ExecutableFinder)->find('ffprobe');
    }
}
