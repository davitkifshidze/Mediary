<?php

namespace App\Services\Import;

use App\Models\User;
use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\Mime\MimeTypes;
use ZipArchive;

/**
 * **Tasks §59.6 — „სრული ექსპორტის" ZIP-ის ფაილი → ჩემი საცავი.**
 *
 * ⚠️ **ფაილი მხოლოდ ZIP-იდან მოდის და არასდროს — ამ სერვერის დისკიდან.**
 * ფაილში ჩაწერილი გზა (`poster_path: "notes/…"`) სხვისი პრივატული ფაილი
 * შეიძლება იყოს; მისი „გადმოწერა" სხვის საიდუმლოს ჩემს ანგარიშზე
 * გადმოიტანდა. ამიტომ ცალკე JSON/CSV-ის იმპორტი ფაილებს **არ** იღებს.
 *
 * ⚠️ **ატვირთვის იგივე წესები**: ფორმატი შიგთავსიდან (`finfo`) და არა
 * სახელიდან, `UploadLimits`-ის სახეობის სიით (`svg`/`html` — არასდროს),
 * ჩაწერა კი `StorageMeter`-ით — კვოტა და მოდულის ლიმიტი (413) მოქმედებს.
 *
 * ⚠️ **საერთო ფაილი (TMDB-ის პოსტერი) კვოტის გარეშე იწერება** — ზუსტად ისე,
 * როგორც `MediaDownloader` წერს: იმავე გზაზე, თუ თავისუფალია; თუ იქ იგივე
 * ფაილია — ხელახლა არ იწერება; სხვა ფაილის შემთხვევაში ახალი სახელით.
 *
 * ⚠️ **ჩავარდნაზე უკან ბრუნდება** (`rollback()`): ჩანაწერის ტრანზაქცია
 * კვოტის მრიცხველს თვითონ აბრუნებს (`reserve()` იმავე კავშირზეა), დისკზე
 * დარჩენილ ბაიტებს კი აქ ვშლით.
 */
class MediaryFiles
{
    private ?ZipArchive $zip = null;

    /** @var list<string> ამ ჩანაწერისთვის ჩაწერილი ფაილები */
    private array $written = [];

    public function __construct(private readonly StorageMeter $meter) {}

    /** ახალი ჩანაწერის დასაწყისი */
    public function begin(?ZipArchive $zip): void
    {
        $this->zip = $zip;
        $this->written = [];
    }

    public function available(): bool
    {
        return $this->zip !== null;
    }

    /**
     * ZIP-ის ფაილი → ჩემი ატვირთვა (კვოტაში).
     *
     * @param  string  $kind  `UploadLimits`-ის სახეობა — ფორმატის სია
     * @return array{path: string, size: int, mime: string, name: string}|null
     */
    public function store(User $user, mixed $path, string $folder, string $kind): ?array
    {
        $temp = $this->extract($path);

        if ($temp === null) {
            return null;
        }

        try {
            $mime = $this->allowed($user, $temp, $kind);
            if ($mime === null) {
                return null;
            }

            $size = (int) filesize($temp);
            $stored = $this->meter->storeLocalFile($user, $temp, $folder, basename((string) $path));
            $this->written[] = $stored;

            return ['path' => $stored, 'size' => $size, 'mime' => $mime, 'name' => basename((string) $path)];
        } finally {
            @unlink($temp);
        }
    }

    /**
     * ZIP-ის ფაილი → **საერთო** ფაილი (TMDB-ის პოსტერი, მსახიობის ფოტო) — კვოტის გარეშე.
     */
    public function shared(mixed $path, string $folder): ?string
    {
        if (! is_string($path) || ! str_starts_with($path, $folder.'/')
            || ! preg_match('/^[A-Za-z0-9._-]+\.(jpe?g|png|webp|gif)$/i', substr($path, strlen($folder) + 1))) {
            return null;
        }

        $temp = $this->extract($path);
        if ($temp === null) {
            return null;
        }

        try {
            $mime = (string) (new \finfo(FILEINFO_MIME_TYPE))->file($temp);
            if (! in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true)) {
                return null;
            }

            $disk = Storage::disk(StorageFolder::diskFor($folder));
            $target = $path;

            if ($disk->exists($path)) {
                // ⚠️ იგივე ფაილი უკვე დევს (ჩვეულებრივ — იგივე TMDB-ის პოსტერი): ხელახლა არ იწერება
                if (hash_file('sha1', $temp) === sha1((string) $disk->get($path))) {
                    return $path;
                }

                $info = pathinfo($path);
                $target = $info['dirname'].'/'.$info['filename'].'-'.Str::lower(Str::random(6)).'.'.$info['extension'];
            }

            $stream = fopen($temp, 'rb');

            try {
                $disk->writeStream($target, $stream);
            } finally {
                if (is_resource($stream)) {
                    fclose($stream);
                }
            }

            $this->written[] = $target;

            return $target;
        } finally {
            @unlink($temp);
        }
    }

    /** ჩავარდნილი ჩანაწერის ფაილები — მხოლოდ დისკიდან (მრიცხველი ტრანზაქციამ დააბრუნა) */
    public function rollback(): void
    {
        foreach ($this->written as $path) {
            try {
                Storage::disk(StorageFolder::diskFor($path))->delete($path);
            } catch (\Throwable) {
                // ფაილი უკვე აღარაა
            }
        }

        $this->written = [];
    }

    /**
     * შიგთავსით ამოცნობილი ფორმატი სახეობის სიაშია? — `mime` ან `null`.
     *
     * ⚠️ `UploadLimits::rule()`-ის იგივე წესი: გაფართოება **შიგთავსიდან**
     * იცნობა, `NEVER` (svg, html…) კი არასდროს გადის.
     */
    private function allowed(User $user, string $temp, string $kind): ?string
    {
        $mime = (string) (new \finfo(FILEINFO_MIME_TYPE))->file($temp);
        $accepted = UploadLimits::accepted(UploadLimits::effective($kind, $user)['formats']);
        $extensions = MimeTypes::getDefault()->getExtensions($mime);

        if ($extensions === [] || array_intersect($extensions, UploadLimits::NEVER) !== []) {
            return null;
        }

        return array_intersect($extensions, $accepted) !== [] ? $mime : null;
    }

    /**
     * `files/<გზა>` → დროებითი ფაილი.
     *
     * ⚠️ **ზომა ორჯერ მოწმდება**: ZIP-ის სათაური ტყუილი შეიძლება იყოს, ამიტომ
     * კოპირება ნათქვამ ზომაზე ერთი ბაიტით მეტზე ჩერდება და ზედმეტი უარყოფილია.
     */
    private function extract(mixed $path): ?string
    {
        if ($this->zip === null || ! is_string($path) || $path === '' || str_contains($path, '..') || str_contains($path, '\\')) {
            return null;
        }

        $name = 'files/'.ltrim($path, '/');
        $stat = $this->zip->statName($name);

        if ($stat === false || (int) $stat['size'] > UploadLimits::CEILING_KB * 1024) {
            return null;
        }

        $in = $this->zip->getStream($name);
        if ($in === false) {
            return null;
        }

        $temp = (string) tempnam(sys_get_temp_dir(), 'mediary-import-');
        $out = fopen($temp, 'wb');

        try {
            $copied = $out ? stream_copy_to_stream($in, $out, (int) $stat['size'] + 1) : false;
        } finally {
            fclose($in);
            if ($out) {
                fclose($out);
            }
        }

        if ($copied === false || $copied !== (int) $stat['size']) {
            @unlink($temp);

            return null;
        }

        return $temp;
    }
}
