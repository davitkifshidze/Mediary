<?php

namespace App\Support;

use App\Models\User;

/**
 * **ატვირთვის ლიმიტები — ერთი რუკა მთელი აპისთვის (2026-09-14 → Tasks §34).**
 *
 * ⚠️ **შვიდი კონტროლერი ერთსა და იმავეს იმეორებდა** (2026-09-14) და კიდევ ხუთი
 * ადგილი ხელით წერდა თავისას (§34.3 — ავატარი და მთავარი ფოტოები `max:4096`,
 * პოსტერები `max:8192`, დამატებითი ველები, CSV-ის იმპორტი, ჩატის ფაილი). ახლა
 * **ყოველი ატვირთვის ღილაკი აქედან იღებს** ზომასაც და ფორმატსაც — ცხრილში
 * მოცემული სახეობით (`KINDS`).
 *
 * **სამი ფენა** (§34.2, §34.6), ქვემოდან ზემოთ:
 *  1. **კოდის ნაგულისხმევი** — `KINDS`;
 *  2. **ინსტალაციის მნიშვნელობა** — სუპერადმინი `/settings`-ზე ცვლის
 *     (`app_settings.uploads`, `AppSettings`); ბაზაში **მხოლოდ ცვლილება** დევს;
 *  3. **პირადი გამონაკლისი** — `users.upload_overrides`, დამტკიცებული
 *     მოთხოვნიდან (`ApprovalRequest::TYPE_UPLOAD`) ან ადმინის ხელით.
 * ეფექტური = ინსტალაციის ფორმატები ∪ პირადი ფორმატები, ზომა — ორიდან დიდი.
 *
 * ⚠️ **რეალური ჭერი მაინც PHP-საც ითვალისწინებს** (`effectiveKb()`):
 * `php.ini`-ში 2M რომ ეწეროს, „მაქს. 100 MB" ვიდეოზე ტყუილი იქნებოდა —
 * ამიტომ სუპერადმინის რედაქტორი ორივე რიცხვს აჩვენებს.
 *
 * ⚠️ **ფორმატი სიიდან ირჩევა და ხელით არ იწერება** (`CATALOG`), აქტიური
 * შიგთავსი კი (`NEVER` — svg, html, xml, js, php…) **ვერც ერთი არჩევანით
 * ვერ ჩაირთვება**: ყოველი წყარო (ინსტალაციის, პირადი, მოთხოვნის) ჯერ
 * `selectable()`-ზე გადის. `CustomFieldTest::test_no_upload_rule_accepts_active_content`
 * სამივე წყაროს ამოწმებს — ბაზაში ხელით ჩაწერილ მნიშვნელობასაც.
 *
 * ⚠️ **სახეობა ≠ მოდული**: `doc`/`image`/`video` საერთოა, `book` (ე-წიგნი) და
 * `rules` (ბორდგეიმის წესები) კი კონკრეტული მოდულისაა — ერთ სიაში იმიტომ
 * არიან, რომ კითხვა ერთია: „ამ ღილაკით რა და რამდენი აიტვირთება".
 */
final class UploadLimits
{
    /**
     * **ფორმატების კატალოგი — რისი ჩართვაც საერთოდ შეიძლება** (§34.2).
     *
     * ⚠️ `image` ოჯახი **Laravel-ის `image` წესის ზუსტი სიაა** (§34.4):
     * ბლოკზე აქამდე „ნებისმიერი ფორმატი" ეწერა, `image` წესი კი მხოლოდ ამ
     * რვას იღებდა (`jpeg` `jpg`-ის ფსევდონიმია — `ALIASES`). SVG — არა.
     *
     * ⚠️ **`fb2` განზრახ არ არის**: ის XML-ია, `finfo` მას `text/xml`-ად
     * კითხულობს, XML კი აქტიური შიგთავსია — ე-წიგნების სიაში ის აქამდე
     * ეწერა და **ყოველთვის** 422-ს იღებდა. `md`/`log` ცალკე არ წერია:
     * `finfo` მათ `text/plain`-ად ცნობს, ე.ი. `txt` ფარავს.
     *
     * @var array<string, list<string>>
     */
    public const CATALOG = [
        'image' => ['jpg', 'png', 'gif', 'webp', 'bmp', 'avif', 'heic', 'heif'],
        'document' => ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'xls', 'xlsx', 'ods', 'csv', 'ppt', 'pptx', 'odp'],
        'archive' => ['zip', '7z', 'rar'],
        'video' => ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'mkv', 'avi'],
        'audio' => ['mp3', 'wav', 'm4a', 'aac', 'flac', 'oga', 'opus'],
        'ebook' => ['epub', 'mobi', 'azw3', 'djvu'],
    ];

    /**
     * **ფორმატები, რომლებიც არასდროს ჩაირთვება** — ბრაუზერი მათ დოკუმენტად
     * ხატავს და სკრიპტს ასრულებს (საჯარო დისკზე — stored XSS, SEC-05).
     *
     * ⚠️ კატალოგში ისინი ისედაც არ არის; ეს **მეორე ფენაა**: ხვალ ვინმემ
     * კატალოგს `svg` რომ დაუმატოს, `selectable()` მას მაინც ამოაგდებს —
     * და ტესტი გაწითლდება.
     */
    public const NEVER = [
        'svg', 'svgz', 'html', 'htm', 'xhtml', 'xht', 'xml', 'xsl', 'xslt',
        'js', 'mjs', 'php', 'phtml', 'phar', 'shtml', 'swf',
    ];

    /**
     * ფორმატი → გაფართოებები, რომლებსაც სერვერი **იმავე ფაილს** შეიძლება
     * დაარქმევს (`mimes:` გაფართოებას შიგთავსიდან იცნობს, `guessExtension()`).
     *
     * ⚠️ **ხელით და არა ავტომატურად** — ნამდვილ ფაილზე `finfo`-ს პასუხი
     * წყვეტს და არა Symfony-ის რუკის პირველი ჩანაწერი. გადამოწმებულია:
     * `.mobi` და `.azw3` → `application/x-mobipocket-ebook` → `prc` (ე.ი.
     * ე-წიგნების სიის `mobi` აქამდე **ყოველთვის** 422-ს იღებდა); Ogg-ვიდეო
     * → `video/ogg` → `ogv`; AAC → `audio/aac` → `adts`; CSV ზოგჯერ
     * `text/plain`-ად იკითხება.
     *
     * @var array<string, list<string>>
     */
    public const ALIASES = [
        'jpg' => ['jpeg'],
        'csv' => ['txt'],
        'ogg' => ['oga', 'ogv'],
        'oga' => ['ogg'],
        'opus' => ['ogg', 'oga'],
        'm4v' => ['mp4'],
        'aac' => ['adts'],
        'mobi' => ['prc'],
        'azw3' => ['prc'],
    ];

    /**
     * **სახეობები — კოდის ნაგულისხმევი.**
     *
     * `families` — რომელი ოჯახიდან შეიძლება ფორმატის ჩართვა (`null` = ყველა):
     * სურათის სახეობა მხოლოდ სურათს იღებს (ის `<img>`-ად იხატება), ვიდეო —
     * მხოლოდ ვიდეოს (`<video>`). `locked` — ფორმატი **ფიქსირებულია**:
     * იმპორტი მხოლოდ CSV-ს კითხულობს, ე.ი. სხვა ფორმატის ჩართვა ღილაკი
     * იქნებოდა, რომელიც არაფერს აკეთებს; ზომა კი ცვლადია.
     *
     * ⚠️ `primary` (მთავარი ფოტო, პოსტერი, ავატარი) **8 MB-ია** — აქამდე
     * პოსტერს 8 ეწერა, დანარჩენს 4. ერთ სახეობად გაერთიანებისას დიდი
     * დარჩა, რომ ვინმეს ლიმიტი ჩუმად არ შემცირებოდა.
     *
     * ⚠️ `chat` **მთელი კატალოგია** — ჩატში ფაილს აქამდე ფორმატი საერთოდ
     * არ ეზღუდებოდა (§34.4: „ნებისმიერის" ნაცვლად ნამდვილი სია). სურათი
     * და ვიდეო ჩატში თავის სახეობაზე გადის; აქ ის რჩება, რისი ტიპიც
     * ბრაუზერმა ვერ თქვა (მაგ. `HEIC`).
     *
     * @var array<string, array{max_kb: int, formats: list<string>, families: list<string>|null, locked?: bool}>
     */
    public const KINDS = [
        'image' => ['max_kb' => 8192, 'formats' => self::CATALOG['image'], 'families' => ['image']],
        'primary' => ['max_kb' => 8192, 'formats' => self::CATALOG['image'], 'families' => ['image']],
        'video' => ['max_kb' => 102400, 'formats' => ['mp4', 'webm', 'ogg', 'mov', 'm4v'], 'families' => ['video']],
        'doc' => [
            'max_kb' => 20480,
            'formats' => ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'zip'],
            'families' => null,
        ],
        // წიგნის ფაილი — ე-წიგნის ფორმატები (Tasks §12)
        'book' => ['max_kb' => 51200, 'formats' => ['pdf', 'epub', 'mobi', 'azw3', 'djvu', 'txt'], 'families' => null],
        // ბორდგეიმის წესები — მხოლოდ PDF (Tasks §14)
        'rules' => ['max_kb' => 30720, 'formats' => ['pdf'], 'families' => null],
        // §6 ფაზა 4b — დამატებითი ველის ფაილი (ადრე `CustomFields::FILE_*`)
        'field' => [
            'max_kb' => 25600,
            'formats' => [
                'jpg', 'png', 'webp', 'gif', 'pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'xls', 'xlsx', 'csv',
                'ppt', 'pptx', 'zip', 'epub', 'mp3', 'mp4', 'webm',
            ],
            'families' => null,
        ],
        'chat' => [
            'max_kb' => 20480,
            'formats' => [
                ...self::CATALOG['image'], ...self::CATALOG['document'], ...self::CATALOG['archive'],
                ...self::CATALOG['video'], ...self::CATALOG['audio'], ...self::CATALOG['ebook'],
            ],
            'families' => null,
        ],
        // FEAT-07 — CSV-ის იმპორტი (ადრე `ImportSource::MAX_KB`)
        'import' => ['max_kb' => 10240, 'formats' => ['csv', 'txt'], 'families' => [], 'locked' => true],
    ];

    /** ერთ მოთხოვნაში რამდენი ფაილი — `max_file_uploads`-საც ეთანხმება */
    public const MAX_FILES = 20;

    /** ერთი სახეობის ქვედა ზღვარი — 1 MB (ნაკლები ატვირთვას პრაქტიკულად კეტავს) */
    public const MIN_KB = 1024;

    /** ზედა ზღვარი — 4 GB; მის ზემოთ რიცხვს PHP ისედაც ვერ მიიღებს */
    public const CEILING_KB = 4194304;

    /** `app_settings`-ის გასაღები — `['kinds' => [kind => ['max_kb', 'formats']]]` */
    public const SETTING = 'uploads';

    /* ================================================================
       კითხვა
       ================================================================ */

    /** ვალიდაციის წესი — ერთი გამოსახულება ყველა ატვირთვის ღილაკისთვის */
    public static function rule(string $kind, ?User $user): array
    {
        $limit = self::effective($kind, $user);

        return [
            'file',
            'max:'.min($limit['max_kb'], self::serverMaxKb()),
            'mimes:'.implode(',', self::accepted($limit['formats'])),
        ];
    }

    /** აპის წესი ამ მომხმარებლისთვის — ინსტალაციისა და პირადი გამონაკლისის მაქსიმუმი */
    public static function maxKb(string $kind, ?User $user): int
    {
        return self::effective($kind, $user)['max_kb'];
    }

    /**
     * **ნამდვილი ჭერი** — აპისა და PHP-ის მინიმუმი.
     *
     * ⚠️ ვალიდაციაც ამას იყენებს და არა `maxKb()`-ს: თუ `php.ini` უფრო მკაცრია,
     * მაშინ 422 („ზომა აღემატება") უფრო გასაგებია, ვიდრე ჩუმად ჩამოგდებული
     * მოთხოვნა, რომელზეც „ფაილი სავალდებულოა" წერია.
     */
    public static function effectiveKb(string $kind, ?User $user): int
    {
        return min(self::maxKb($kind, $user), self::serverMaxKb());
    }

    /**
     * **ეფექტური ლიმიტი** — ინსტალაციის ∪ პირადი (§34.6).
     *
     * @return array{max_kb: int, formats: list<string>}
     */
    public static function effective(string $kind, ?User $user): array
    {
        $kind = self::kindKey($kind);
        $installation = self::installation($kind);
        $own = self::personal($kind, $user);

        if ($own === null) {
            return $installation;
        }

        return [
            'max_kb' => max($installation['max_kb'], $own['max_kb'] ?? 0),
            'formats' => self::ordered([...$installation['formats'], ...$own['formats']]),
        ];
    }

    /**
     * კოდის ნაგულისხმევი.
     *
     * @return array{max_kb: int, formats: list<string>}
     */
    public static function defaults(string $kind): array
    {
        $kind = self::kindKey($kind);

        return [
            'max_kb' => self::KINDS[$kind]['max_kb'],
            'formats' => self::ordered(self::KINDS[$kind]['formats']),
        ];
    }

    /**
     * **ინსტალაციის მნიშვნელობა** — სუპერადმინის ცვლილება ან ნაგულისხმევი.
     *
     * ⚠️ შენახული მნიშვნელობა **ხელახლა მოწმდება**: ბაზაში ხელით ჩაწერილი
     * `svg` ან უაზრო ზომა ჩუმად ნაგულისხმევზე ბრუნდება და არა ვალიდაციაში.
     *
     * @return array{max_kb: int, formats: list<string>}
     */
    public static function installation(string $kind): array
    {
        $kind = self::kindKey($kind);
        $default = self::defaults($kind);
        $stored = self::stored()[$kind] ?? null;

        if (! is_array($stored)) {
            return $default;
        }

        return [
            'max_kb' => self::cleanKb($stored['max_kb'] ?? null) ?? $default['max_kb'],
            'formats' => self::isLocked($kind)
                ? $default['formats']
                : (self::cleanFormats($kind, $stored['formats'] ?? null) ?: $default['formats']),
        ];
    }

    /**
     * **პირადი გამონაკლისი** (§34.6) — `null`, თუ არ აქვს.
     *
     * @return array{max_kb: int|null, formats: list<string>}|null
     */
    public static function personal(string $kind, ?User $user): ?array
    {
        if (! $user instanceof User) {
            return null;
        }

        $kind = self::kindKey($kind);
        $all = self::cleanOverrides($user->upload_overrides);

        return $all[$kind] ?? null;
    }

    /** აქვს თუ არა სახეობას ფიქსირებული ფორმატი (იმპორტი) */
    public static function isLocked(string $kind): bool
    {
        return (bool) (self::KINDS[self::kindKey($kind)]['locked'] ?? false);
    }

    /**
     * **რომელი ფორმატის ჩართვა შეიძლება ამ სახეობაზე** — კატალოგის რიგით.
     *
     * ⚠️ ერთადერთი კარი: რედაქტორიც, მოთხოვნაც და პირადი გამონაკლისიც აქ
     * გადის, ე.ი. `NEVER`-ის ფორმატს ვერც ერთი ვერ ჩართავს.
     *
     * @return list<string>
     */
    public static function selectable(string $kind): array
    {
        $kind = self::kindKey($kind);

        if (self::isLocked($kind)) {
            return self::defaults($kind)['formats'];
        }

        $families = self::KINDS[$kind]['families'];
        $formats = [];

        foreach (self::CATALOG as $family => $list) {
            if ($families === null || in_array($family, $families, true)) {
                array_push($formats, ...$list);
            }
        }

        return array_values(array_diff(array_unique($formats), self::NEVER));
    }

    /**
     * ფორმატები, რომლებიც ამ სახეობის არჩევანში **არ არის** — რედაქტორი,
     * მოთხოვნა და ადმინის ხელით ჩასწორება მათ **422**-ით აბრუნებს და არა
     * ჩუმად აგდებს („შენახულია" იმაზე, რაც არ ჩაირთო, ტყუილი იქნებოდა).
     *
     * @param  array<mixed>  $formats
     * @return list<string>
     */
    public static function outside(string $kind, array $formats): array
    {
        $formats = array_map(fn ($f) => is_string($f) ? strtolower(trim($f)) : '', $formats);

        return array_values(array_diff($formats, self::selectable($kind)));
    }

    /**
     * ფორმატები + მათი ფსევდონიმები — ის, რასაც `mimes:` უნდა ელოდეს.
     *
     * @param  list<string>  $formats
     * @return list<string>
     */
    public static function accepted(array $formats): array
    {
        $out = $formats;

        foreach ($formats as $format) {
            array_push($out, ...(self::ALIASES[$format] ?? []));
        }

        return array_values(array_diff(array_unique($out), self::NEVER));
    }

    /** PHP-ის ჭერი ერთ ფაილზე (ბაიტებში) */
    public static function serverMaxBytes(): int
    {
        return max(1, min(
            self::iniBytes('upload_max_filesize'),
            self::iniBytes('post_max_size'),
        ));
    }

    /** PHP-ის ჭერი კილობაიტებში — ბაზის ასლის ატვირთვა მხოლოდ ამას ემორჩილება */
    public static function serverMaxKb(): int
    {
        return max(1, intdiv(self::serverMaxBytes(), 1024));
    }

    /**
     * API-სთვის — ინტერფეისი ზუსტად იმას წერს, რასაც სერვერი **ამ
     * მომხმარებლისგან** მიიღებს (§34.6: `GET /api/uploads/limits` შესულის
     * ეფექტურ ლიმიტს აბრუნებს).
     */
    public static function all(?User $user): array
    {
        $serverKb = self::serverMaxKb();
        $out = [];

        foreach (array_keys(self::KINDS) as $kind) {
            $limit = self::effective($kind, $user);
            $effectiveKb = min($limit['max_kb'], $serverKb);

            $out[] = [
                'kind' => $kind,
                'max_kb' => $limit['max_kb'],
                'max_bytes' => $effectiveKb * 1024,
                // ⚠️ ცხადად ვამბობთ, ჭერი PHP-მ ჩამოწია თუ არა — თორემ
                // „რატომ 2 MB, როცა 100 წერია" უპასუხო კითხვა იქნებოდა
                'capped_by_server' => $effectiveKb < $limit['max_kb'],
                // ⚠️ **ნამდვილი სია**, არასდროს ცარიელი (§34.4)
                'mimes' => $limit['formats'],
                // ბრაუზერის შემოწმებისა და `accept`-ისთვის — ფსევდონიმებითაც
                'extensions' => self::accepted($limit['formats']),
                'locked' => self::isLocked($kind),
                'selectable' => self::selectable($kind),
                'installation' => self::installation($kind),
                'personal' => self::personal($kind, $user),
                'default' => self::defaults($kind),
            ];
        }

        return [
            'kinds' => $out,
            'catalog' => self::CATALOG,
            'max_files' => self::MAX_FILES,
            'min_kb' => self::MIN_KB,
            'ceiling_kb' => self::CEILING_KB,
            'server' => [
                'upload_max_filesize' => ini_get('upload_max_filesize'),
                'post_max_size' => ini_get('post_max_size'),
                'max_bytes' => self::serverMaxBytes(),
            ],
        ];
    }

    /* ================================================================
       ჩაწერა
       ================================================================ */

    /**
     * **სუპერადმინის რედაქტორი** (§34.2) — მხოლოდ მოსულ სახეობებს ეხება.
     *
     * ⚠️ **ნაგულისხმევის ტოლი რიგი ბაზიდან იშლება**: „ნაგულისხმევზე
     * დაბრუნება" ცალკე endpoint არ სჭირდება, და კოდში ნაგულისხმევის
     * შეცვლა ყველა შეუცვლელ ინსტალაციას თავისით მისწვდება.
     *
     * @param  array<string, array{max_kb?: int, formats?: list<string>}>  $kinds  უკვე შემოწმებული
     */
    public static function saveInstallation(array $kinds, ?User $by): void
    {
        $stored = self::stored();

        foreach ($kinds as $kind => $values) {
            if (! isset(self::KINDS[$kind])) {
                continue;
            }

            $current = self::installation($kind);
            $next = [
                'max_kb' => self::cleanKb($values['max_kb'] ?? null) ?? $current['max_kb'],
                'formats' => self::isLocked($kind)
                    ? self::defaults($kind)['formats']
                    : (self::cleanFormats($kind, $values['formats'] ?? null) ?: $current['formats']),
            ];

            if ($next == self::defaults($kind)) {
                unset($stored[$kind]);
            } else {
                $stored[$kind] = $next;
            }
        }

        $stored === []
            ? AppSettings::forget(self::SETTING)
            : AppSettings::put(self::SETTING, ['kinds' => $stored], $by);
    }

    /**
     * **ინსტალაციის ლიმიტის გაფართოება** — „ყველასთვის" დამტკიცებული მოთხოვნა.
     * ფორმატი ემატება, ზომა მხოლოდ იზრდება.
     *
     * @param  list<string>  $formats
     */
    public static function widenInstallation(string $kind, array $formats, ?int $maxKb, ?User $by): void
    {
        $current = self::installation($kind);

        self::saveInstallation([$kind => [
            'max_kb' => max($current['max_kb'], $maxKb ?? 0),
            'formats' => self::ordered([...$current['formats'], ...$formats]),
        ]], $by);
    }

    /**
     * **პირადი გამონაკლისის გაფართოება** — „მხოლოდ მას" დამტკიცებული მოთხოვნა.
     *
     * @param  list<string>  $formats
     */
    public static function widenPersonal(User $user, string $kind, array $formats, ?int $maxKb): void
    {
        $all = self::cleanOverrides($user->upload_overrides) ?? [];
        $own = $all[$kind] ?? ['max_kb' => null, 'formats' => []];

        $all[$kind] = [
            'max_kb' => $maxKb === null ? $own['max_kb'] : max($own['max_kb'] ?? 0, $maxKb),
            'formats' => self::ordered([...$own['formats'], ...$formats]),
        ];

        $user->forceFill(['upload_overrides' => self::cleanOverrides($all)])->save();
    }

    /**
     * პირადი გამონაკლისების გაწმენდა — უცნობი სახეობა, კატალოგის გარეთ
     * მდგომი ფორმატი და უაზრო ზომა ქრება; ცარიელი რუკა — `null`.
     *
     * @return array<string, array{max_kb: int|null, formats: list<string>}>|null
     */
    public static function cleanOverrides(mixed $overrides): ?array
    {
        if (! is_array($overrides)) {
            return null;
        }

        $out = [];

        foreach ($overrides as $kind => $values) {
            if (! is_string($kind) || ! isset(self::KINDS[$kind]) || ! is_array($values)) {
                continue;
            }

            $formats = self::isLocked($kind) ? [] : (self::cleanFormats($kind, $values['formats'] ?? null) ?? []);
            $maxKb = self::cleanKb($values['max_kb'] ?? null);

            if ($formats === [] && $maxKb === null) {
                continue;
            }

            $out[$kind] = ['max_kb' => $maxKb, 'formats' => $formats];
        }

        return $out === [] ? null : $out;
    }

    /* ================================================================
       დამხმარეები
       ================================================================ */

    /** უცნობი სახეობა `doc`-ზე ეშვება და არა შეცდომაზე */
    private static function kindKey(string $kind): string
    {
        return isset(self::KINDS[$kind]) ? $kind : 'doc';
    }

    /** @return array<string, mixed> */
    private static function stored(): array
    {
        $value = AppSettings::get(self::SETTING);

        return is_array($value) && is_array($value['kinds'] ?? null) ? $value['kinds'] : [];
    }

    /** ზომა დასაშვებ ფარგლებში, ან `null` */
    private static function cleanKb(mixed $value): ?int
    {
        if (! is_numeric($value)) {
            return null;
        }

        $kb = (int) $value;

        return $kb >= self::MIN_KB && $kb <= self::CEILING_KB ? $kb : null;
    }

    /**
     * ფორმატები მხოლოდ ამ სახეობის არჩევანიდან; მასივის გარდა — `null`.
     *
     * @return list<string>|null
     */
    private static function cleanFormats(string $kind, mixed $formats): ?array
    {
        if (! is_array($formats)) {
            return null;
        }

        $formats = array_map(fn ($f) => is_string($f) ? strtolower(trim($f)) : '', $formats);

        return array_values(array_intersect(self::selectable($kind), $formats));
    }

    /**
     * უნიკალური, **კატალოგის რიგით** — ერთი სახეობა ყოველთვის ერთნაირად იხატება.
     *
     * @param  list<string>  $formats
     * @return list<string>
     */
    private static function ordered(array $formats): array
    {
        $all = array_merge(...array_values(self::CATALOG));

        return array_values(array_intersect($all, array_unique($formats)));
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
