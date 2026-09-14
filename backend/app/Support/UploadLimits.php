<?php

namespace App\Support;

/**
 * **ატვირთვის ლიმიტები — ერთი რუკა მთელი აპისთვის (2026-09-14).**
 *
 * ⚠️ **შვიდი კონტროლერი ერთსა და იმავეს იმეორებდა**: `image` 8192, `doc` 20480
 * და თითქმის იდენტური `DOC_MIMES` (განსხვავება ზოგან მხოლოდ `zip` იყო).
 * ე.ი. „რა ზომა შეიძლება" პასუხი შვიდგან მოდიოდა და ინტერფეისს საერთოდ
 * არსად ეწერა — მომხმარებელი 422-ს ხედავდა და მიზეზს ვერ ხვდებოდა.
 *
 * ⚠️ **რეალური ჭერი ორი რიცხვის მინიმუმია** — აპის წესისა და **PHP-ის**
 * (`upload_max_filesize` / `post_max_size`). ამიტომ არსებობს `effectiveKb()`:
 * `php.ini`-ში 2M რომ ეწეროს, „მაქს. 100 MB" ვიდეოზე ტყუილი იქნებოდა
 * (ზუსტად ასე ვარდებოდა დიდი PDF და რამდენიმე ფოტო ერთად).
 *
 * ⚠️ **სახეობა ≠ მოდული**: `doc`/`image`/`video` საერთოა, `book` (ე-წიგნი) და
 * `rules` (ბორდგეიმის წესები) კი კონკრეტული მოდულისაა — ერთ სიაში იმიტომ
 * არიან, რომ კითხვა ერთია: „ამ ღილაკით რა და რამდენი აიტვირთება".
 */
final class UploadLimits
{
    /**
     * ⚠️ `image`-ს `mimes` **განზრახ არ აქვს** — მას Laravel-ის `image` წესი
     * იცავს (ის ნამდვილ სურათს ამოწმებს და არა გაფართოებას).
     *
     * @var array<string, array{max_kb: int, mimes: ?string}>
     */
    public const KINDS = [
        'image' => ['max_kb' => 8192, 'mimes' => null],
        'doc' => ['max_kb' => 20480, 'mimes' => 'pdf,doc,docx,txt,rtf,odt,xls,xlsx,csv,ppt,pptx,zip'],
        'video' => ['max_kb' => 102400, 'mimes' => 'mp4,webm,ogg,mov,m4v'],
        // წიგნის ფაილი — ე-წიგნის ფორმატები (Tasks §12)
        'book' => ['max_kb' => 51200, 'mimes' => 'pdf,epub,mobi,azw3,fb2,djvu,txt'],
        // ბორდგეიმის წესები — მხოლოდ PDF (Tasks §14)
        'rules' => ['max_kb' => 30720, 'mimes' => 'pdf'],
    ];

    /** ერთ მოთხოვნაში რამდენი ფაილი — `max_file_uploads`-საც ეთანხმება */
    public const MAX_FILES = 20;

    /** ვალიდაციის წესი — ერთი გამოსახულება შვიდივე კონტროლერისთვის */
    public static function rule(string $kind): array
    {
        $limit = self::KINDS[$kind] ?? self::KINDS['doc'];
        $rules = ['file', 'max:'.self::effectiveKb($kind)];

        if ($kind === 'image') {
            // ⚠️ `image` წესი გაფართოებას კი არა, ნამდვილ სურათს ამოწმებს
            array_splice($rules, 1, 0, 'image');
        } elseif ($limit['mimes'] !== null) {
            $rules[] = 'mimes:'.$limit['mimes'];
        }

        return $rules;
    }

    /** აპის წესი — რაც კოდშია დაწერილი */
    public static function maxKb(string $kind): int
    {
        return self::KINDS[$kind]['max_kb'] ?? self::KINDS['doc']['max_kb'];
    }

    /**
     * **ნამდვილი ჭერი** — აპისა და PHP-ის მინიმუმი.
     *
     * ⚠️ ვალიდაციაც ამას იყენებს და არა `maxKb()`-ს: თუ `php.ini` უფრო მკაცრია,
     * მაშინ 422 („ზომა აღემატება") უფრო გასაგებია, ვიდრე ჩუმად ჩამოგდებული
     * მოთხოვნა, რომელზეც „ფაილი სავალდებულოა" წერია.
     */
    public static function effectiveKb(string $kind): int
    {
        return min(self::maxKb($kind), (int) (self::serverMaxBytes() / 1024));
    }

    /** PHP-ის ჭერი ერთ ფაილზე (ბაიტებში) */
    public static function serverMaxBytes(): int
    {
        return max(1, min(
            self::iniBytes('upload_max_filesize'),
            self::iniBytes('post_max_size'),
        ));
    }

    /** API-სთვის — ინტერფეისი ზუსტად იმას წერს, რასაც სერვერი მიიღებს */
    public static function all(): array
    {
        $out = [];

        foreach (self::KINDS as $kind => $limit) {
            $out[$kind] = [
                'kind' => $kind,
                'max_kb' => self::maxKb($kind),
                'max_bytes' => self::effectiveKb($kind) * 1024,
                // ⚠️ ცხადად ვამბობთ, ჭერი PHP-მ ჩამოწია თუ არა — თორემ
                // „რატომ 2 MB, როცა 100 წერია" უპასუხო კითხვა იქნებოდა
                'capped_by_server' => self::effectiveKb($kind) < self::maxKb($kind),
                'mimes' => $limit['mimes'] === null ? [] : explode(',', $limit['mimes']),
            ];
        }

        return [
            'kinds' => array_values($out),
            'max_files' => self::MAX_FILES,
            'server' => [
                'upload_max_filesize' => ini_get('upload_max_filesize'),
                'post_max_size' => ini_get('post_max_size'),
                'max_bytes' => self::serverMaxBytes(),
            ],
        ];
    }

    /** „8M" / „256K" / „1G" → ბაიტები */
    private static function iniBytes(string $key): int
    {
        $raw = trim((string) ini_get($key));

        if ($raw === '' || $raw === '-1') {
            return PHP_INT_MAX;
        }

        $value = (int) $raw;

        return match (strtolower(substr($raw, -1))) {
            'g' => $value * 1024 * 1024 * 1024,
            'm' => $value * 1024 * 1024,
            'k' => $value * 1024,
            default => $value,
        };
    }
}
