<?php

namespace App\Services\Import;

use App\Models\User;
use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Mime\MimeTypes;
use ZipArchive;

/**
 * **„სრული ექსპორტის" ZIP-ის ფაილი → ჩემი საცავი.**
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
 * ⚠️ **დისკზე ფაილის გაფართოებაც შიგთავსიდან მოდის.** ZIP-ის ჩანაწერის
 * სახელი ფაილის ავტორისაა: GIF-ის თავსართიანი `shell.php` შიგთავსით
 * სურათია და შემოწმებას გადის, საჯარო დისკზე კი `.php`-ად ჩაწერილს ვებ-
 * სერვერი შეასრულებდა (`.html` — შენახული XSS). ორიგინალი სახელი მხოლოდ
 * `name`-ად რჩება (ჩამოტვირთვის სახელი).
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
        /* ⚠️ **ზომა და კვოტა გაშლამდე** — ZIP-ის სათაურით. ადრე ფაილი 4 GB-მდე
           დროებით საქაღალდეში იშლებოდა და მხოლოდ მერე ირკვეოდა, რომ სახეობის
           ლიმიტს ან კვოტას აჭარბებს. სახეობაზე დიდი ფაილი გამოიტოვება; კვოტის
           გადაჭარბება `guard()`-ის 413-ია — ჩანაწერი მთლიანად რჩება გარეთ, როგორც
           შენახვისას. ⚠️ ტიპს **შიგთავსი** წყვეტს (`allowed()`), სახელი კი არა —
           ამიტომ ის გაშლის შემდეგ, უკვე შეზღუდულ ზომაზე მოწმდება. */
        $max = (int) UploadLimits::effective($kind, $user)['max_kb'] * 1024;
        $size = $this->size($path);

        if ($size === null || $size > $max) {
            return null;
        }

        $this->meter->guard($user, $size, $folder);

        $temp = $this->extract($path, $max);

        if ($temp === null) {
            return null;
        }

        try {
            $format = $this->allowed($user, $temp, $kind, basename((string) $path));
            if ($format === null) {
                return null;
            }

            $size = (int) filesize($temp);
            $stored = $this->meter->storeLocalFile($user, $temp, $folder, 'file.'.$format['extension']);
            $this->written[] = $stored;

            return ['path' => $stored, 'size' => $size, 'mime' => $format['mime'], 'name' => basename((string) $path)];
        } finally {
            @unlink($temp);
        }
    }

    /**
     * ZIP-ის ფაილი → **უკვე არსებული საერთო** ფაილი (TMDB-ის პოსტერი) — კვოტის გარეშე.
     *
     * ⚠️ **საერთო საქაღალდეში ფაილი ფაილიდან აღარ იწერება.** ადრე „საერთო"
     * პოსტერი კვოტისა და ზომის ჭერის გარეშე იწერებოდა — ხელით აწყობილი ფაილი
     * დისკს უსასრულოდ ავსებდა. ახლა მხოლოდ იდენტური ფაილი (იგივე გზა, იგივე
     * შიგთავსი) ერთვება; სხვა შემთხვევაში `null` — გამომძახებელი მას ჩემს
     * ატვირთვად ინახავს (`store()`: ლიმიტი და კვოტა).
     */
    public function shared(mixed $path, string $folder): ?string
    {
        if (! is_string($path) || ! str_starts_with($path, $folder.'/')
            || ! preg_match('/^[A-Za-z0-9._-]+\.(jpe?g|png|webp|gif)$/i', substr($path, strlen($folder) + 1))) {
            return null;
        }

        $disk = Storage::disk(StorageFolder::diskFor($folder));
        $max = (int) UploadLimits::KINDS['primary']['max_kb'] * 1024;
        $size = $this->size($path);

        if ($size === null || $size > $max || ! $disk->exists($path) || $disk->size($path) !== $size) {
            return null;
        }

        $temp = $this->extract($path, $max);
        if ($temp === null) {
            return null;
        }

        try {
            return hash_file('sha1', $temp) === sha1((string) $disk->get($path)) ? $path : null;
        } finally {
            @unlink($temp);
        }
    }

    /** ZIP-ის სათაურის ზომა (`files/<გზა>`), გაშლის გარეშე; `null` — ფაილი არ არის */
    private function size(mixed $path): ?int
    {
        if ($this->zip === null || ! is_string($path) || $path === '' || str_contains($path, '..') || str_contains($path, '\\')) {
            return null;
        }

        $stat = $this->zip->statName('files/'.ltrim($path, '/'));

        return $stat === false ? null : (int) $stat['size'];
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
     * შიგთავსით ამოცნობილი ფორმატი სახეობის სიაშია? — ტიპი და დისკის
     * გაფართოება, ან `null`.
     *
     * ⚠️ `UploadLimits::rule()`-ის იგივე წესი: გაფართოება **შიგთავსიდან**
     * იცნობა, `NEVER` (svg, html…) კი არასდროს გადის.
     *
     * ⚠️ **სახელის გაფართოება მხოლოდ მაშინ რჩება, როცა შიგთავსი მას
     * ადასტურებს** — პირდაპირ (`photo.jpeg` → `image/jpeg`) ან ფსევდონიმით
     * (`data.csv`, რომელსაც `finfo` `text/plain`-ად კითხულობს; `book.mobi` →
     * `prc`). სხვა შემთხვევაში იწერება შიგთავსის გაფართოება: `shell.php`
     * GIF-ის ბაიტებით → `.gif`.
     *
     * @return array{mime: string, extension: string}|null
     */
    private function allowed(User $user, string $temp, string $kind, string $name): ?array
    {
        $mime = (string) (new \finfo(FILEINFO_MIME_TYPE))->file($temp);
        $formats = UploadLimits::effective($kind, $user)['formats'];
        $extensions = MimeTypes::getDefault()->getExtensions($mime);

        if ($extensions === [] || array_intersect($extensions, UploadLimits::NEVER) !== []) {
            return null;
        }

        $matched = array_values(array_intersect($extensions, UploadLimits::accepted($formats)));

        if ($matched === []) {
            return null;
        }

        $named = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $confirmed = in_array($named, $matched, true)
            || (in_array($named, $formats, true) && array_intersect(UploadLimits::ALIASES[$named] ?? [], $matched) !== []);

        return ['mime' => $mime, 'extension' => $confirmed ? $named : $matched[0]];
    }

    /**
     * `files/<გზა>` → დროებითი ფაილი.
     *
     * ⚠️ **ზომა ორჯერ მოწმდება**: ZIP-ის სათაური ტყუილი შეიძლება იყოს, ამიტომ
     * კოპირება ნათქვამ ზომაზე ერთი ბაიტით მეტზე ჩერდება და ზედმეტი უარყოფილია.
     */
    private function extract(mixed $path, int $maxBytes): ?string
    {
        if ($this->zip === null || ! is_string($path) || $path === '' || str_contains($path, '..') || str_contains($path, '\\')) {
            return null;
        }

        $name = 'files/'.ltrim($path, '/');
        $stat = $this->zip->statName($name);

        if ($stat === false || (int) $stat['size'] > min($maxBytes, UploadLimits::CEILING_KB * 1024)) {
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
