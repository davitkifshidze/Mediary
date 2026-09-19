<?php

namespace App\Services\Gallery;

use App\Models\Anime;
use App\Models\CastMember;
use App\Models\Movie;
use App\Models\Series;
use App\Models\User;
use App\Services\Media\MediaDownloader;
use App\Services\Storage\StorageMeter;
use App\Services\Tmdb\TmdbClient;
use App\Support\MediaDomain;
use App\Support\Redact;
use App\Support\StorageFolder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Throwable;

/**
 * გალერეის ჩამოტვირთვა TMDB-დან (Tasks 10 → §8.2).
 *
 * ორი სახის ფოტო, ორ სხვადასხვა მშობელზე:
 *  · **ჩანაწერის** ფოტოები (კადრები `stills`, პოსტერები, ლოგოები) →
 *    `gallery_images` ფილმზე/სერიალზე/ანიმეზე;
 *  · **მსახიობის** ფოტოები → `gallery_images` **`cast_members`-ზე**, ე.ი. იგივე
 *    გალერეა მსახიობის გვერდზეც ჩანს და ორ ფილმს შორის არ დუბლირდება.
 *
 * ორივე ერთ ცხრილშია, ე.ი. კვოტის მრიცხველი (17) და წაშლის კასკადი
 * ავტომატურად მუშაობს — ჩაწერა მხოლოდ `StorageMeter::storeContents()`-ზე გადის.
 *
 * ერთი ჩანაწერი = ერთი გამოძახება (`fetch()`), ციკლს **ფრონტი** მართავს
 * (იგივე მიდგომა, რაც `/sync`-ზე: `php artisan serve` ერთ რექვესთს ემსახურება).
 *
 * ## რა შეიცვალა §8.2-ში და რატომ
 *
 * ⚠️ **რაოდენობა და ზომა თითო სახეს თავისი აქვს.** აქამდე ერთი `limit`
 * კადრებსაც ეხებოდა და პოსტერებსაც: კანდიდატები ერთ სიად იკვრებოდა
 * (ჯერ კადრები, მერე პოსტერები) და **მერე** იჭრებოდა. შედეგი — 20-ზე
 * დაყენებულ ლიმიტზე, სადაც TMDB-ს 40 კადრი აქვს, **პოსტერი საერთოდ არ
 * ჩამოდიოდა**. ახლა `limits`/`sizes` სახეობის რუკებია.
 *
 * ⚠️ **ზომების სია სახეობიდან მოდის** (TMDB `configuration`, ცოცხლად
 * გადამოწმებული 2026-09-12): `backdrop` = `w300·w780·w1280·original`,
 * `poster` = `w185·w342·w500·w780·original`, `logo` = `w154·w300·w500·original`,
 * `profile` = `w45·w185·h632·original`. CDN სხვა გასაღებსაც იღებს (პოსტერი
 * `w1280`-ზე 200-ს აბრუნებს), მაგრამ **არარსებული გასაღები 400-ია** —
 * ე.ი. სია აზრიანი უნდა იყოს და არა შემთხვევითი.
 *
 * ⚠️ **მსახიობს ორი წყარო აქვს** (`cast_source`): `profiles` — პორტრეტები
 * (`/person/{id}/images`, ხშირად სულ 3–5 ცალი) და **`tagged`** —
 * `/person/{id}/tagged_images`, ე.ი. იმ ფილმების კადრები/პოსტერები, სადაც
 * ეს მსახიობია მონიშნული (ათეულობით). სწორედ ესაა პასუხი იმაზე, რომ
 * „ოფიციალურ წყაროზე მსახიობს ცოტა ფოტო აქვს".
 */
class GalleryFetcher
{
    /**
     * ჩანაწერის ფოტოების სახეები — user ირჩევს, რომელი ჩამოვიდეს.
     *
     * ⚠️ **`logos` ამოღებულია 2026-09-14-ს** (შენი მითითება: „ეს
     * ნაწილი საერთოდ არ მცირდება“). `gallery_images.category`-ში
     * `logo` **რჩება** — ძველი რიგები არსებობს და გალერეაში
     * ისინივე წესით იხატება; ამოღებულია **არჩევანი** და არა
     * ბიბლიოთეკა.
     */
    public const SUBJECTS = ['stills', 'posters'];

    /**
     * სახეობა → TMDB-ის bucket და ჩვენი `category`.
     *
     * ⚠️ `category` მხოლოდ ოთხი მნიშვნელობაა (`backdrop|poster|logo|actor`) —
     * ეს სქემის და ფილტრების არსებული სია და აქ მისი გაფართოება არ ხდება.
     */
    private const SUBJECT_BUCKETS = [
        'stills' => ['backdrops', 'backdrop'],
        'posters' => ['posters', 'poster'],
    ];

    /** სახეობა → დასაშვები ზომები (TMDB `configuration`-ის ზუსტი სიები) */
    public const SUBJECT_SIZES = [
        'stills' => ['w300', 'w780', 'w1280', 'original'],
        'posters' => ['w185', 'w342', 'w500', 'w780', 'original'],
    ];

    /** სახეობა → ნაგულისხმევი ზომა */
    public const SUBJECT_DEFAULT_SIZE = [
        'stills' => 'w780',
        'posters' => 'w500',
    ];

    /** მსახიობების არჩევანი (user-ის მოთხოვნა: ყველა / ქალი / კაცი / კონკრეტული) */
    public const CAST_MODES = ['none', 'all', 'female', 'male', 'selected'];

    /**
     * **მსახიობის ფოტოს წყარო (§8.2).**
     *
     * `profiles` — სტუდიური პორტრეტები; `tagged` — კადრები ფილმებიდან;
     * `both` — ჯერ პორტრეტები, მერე კადრები (პორტრეტი ჯობია პირველი,
     * რადგან ის „მსახიობის ფოტოა", კადრი კი ფილმის).
     */
    public const CAST_SOURCES = ['profiles', 'tagged', 'both'];

    public const DEFAULT_CAST_SOURCE = 'profiles';

    /**
     * **მსახიობის ფოტოს ზომა — ცალკე პარამეტრი (Tasks §3.2).**
     *
     * ⚠️ TMDB-ს პორტრეტებისთვის **სხვა ზომები** აქვს (`profile`): `w780`
     * იქ საერთოდ არ არსებობს. ე.ი. ერთი საერთო `size` ორივეს ვერ ემსახურება.
     *
     * ⚠️ იგივე ზომა `tagged` კადრებზეც გამოიყენება და ეს განზრახაა:
     * `h632` **სიმაღლეს** ზღუდავს, ე.ი. პორტრეტზეც და ფართო კადრზეც
     * აზრიან შედეგს იძლევა (გადამოწმებულია — CDN ორივეზე 200-ს აბრუნებს).
     */
    public const CAST_SIZES = ['w185', 'h632', 'original'];

    public const DEFAULT_CAST_SIZE = 'h632';

    /**
     * რამდენი ფოტო ჩანაწერზე, **თითო სახეობაზე**.
     *
     * ⚠️ **ჭერი 50-იდან 1000-ზე ავიდა** (user-ის მოთხოვნა): 50 ხელოვნური
     * ზღვარი იყო და TMDB-ს ხშირად მეტი აქვს. ნამდვილი შემზღუდველი
     * **კვოტაა** (17) და არა ეს რიცხვი.
     */
    public const DEFAULT_LIMIT = 20;

    public const MAX_LIMIT = 1000;

    /** მსახიობზე რამდენი ფოტო და მაქსიმუმ რამდენი მსახიობი ერთ გაშვებაზე */
    public const DEFAULT_PER_ACTOR = 3;

    public const MAX_PER_ACTOR = 200;

    public const DEFAULT_ACTORS = 12;

    /**
     * ⚠️ **ფრონტი 200-მდე რიცხვს გვთავაზობდა, backend კი 50-ზე ჭრიდა** —
     * „აირჩიე 200 მსახიობი" ჩუმად 50-ად იქცეოდა. ორივე მხარე ერთ რიცხვზე
     * დგას (ფრონტი ამ კონსტანტს `api/gallery.ts`-იდან იმეორებს).
     */
    public const MAX_ACTORS = 500;

    /**
     * `tagged_images`-ის მაქსიმალური გვერდი ერთ მსახიობზე.
     *
     * ⚠️ თითო გვერდი **ერთი TMDB-ის რექვესთია** (20 ცალი). 10 გვერდი =
     * 200 ფოტო, რაც `MAX_PER_ACTOR`-ს უდრის — ე.ი. ჭერი ორივე მხრიდან
     * ერთსა და იმავე რიცხვზე დგას და ციკლი უსასრულოდ ვერ წავა.
     */
    private const MAX_TAGGED_PAGES = 10;

    /**
     * ⚠️ **სავარაუდო** ზომები. TMDB სურათების სიაში `Content-Length`-ს არ
     * იძლევა, ე.ი. ზუსტი ჯამი მხოლოდ ჩამოტვირთვის შემდეგ ვიცით. ეს რიცხვები
     * ლიმიტის წინასწარი შეფასებისთვისაა (17.3) და არა აღრიცხვისთვის —
     * მრიცხველი ყოველთვის რეალურ ბაიტებს ითვლის.
     *
     * ⚠️ **ერთი ცხრილი ყველა სახეობაზე.** ზომის გასაღები (`w780`) ერთსა და
     * იმავეს ნიშნავს კადრზეც და პოსტერზეც; ცალკე ცხრილები მხოლოდ იმ
     * კითხვას დაბადებდა, რომელი რომელს ეხება.
     */
    private const AVG_BYTES = [
        'w45' => 4 * 1024,
        'w154' => 20 * 1024,
        'w185' => 25 * 1024,
        'w300' => 40 * 1024,
        'w342' => 50 * 1024,
        'w500' => 80 * 1024,
        'w780' => 150 * 1024,
        'w1280' => 300 * 1024,
        'h632' => 70 * 1024,
        'original' => 900 * 1024,
    ];

    public function __construct(
        private TmdbClient $tmdb,
        private MediaDownloader $downloader,
        private StorageMeter $meter,
    ) {}

    public function configured(): bool
    {
        return $this->tmdb->configured();
    }

    /**
     * პარამეტრების ნორმალიზება — ერთი წყარო `plan()`-ისთვისაც და `fetch()`-ისთვისაც.
     *
     * ⚠️ **`limit`/`size` ისევ მიიღება** და არჩეულ ყველა სახეობაზე ვრცელდება.
     * ეს არა მხოლოდ თავსებადობაა: „ყველაფერი 20 ცალი, w780" სრულიად
     * აზრიანი მოთხოვნაა და მისთვის სამი ველის შევსება ზედმეტი იქნებოდა.
     * `limits`/`sizes` მას **გადაწერს** იმ სახეობაზე, სადაც ცხადად წერია.
     */
    public function options(array $input): array
    {
        $subjects = array_values(array_intersect(
            self::SUBJECTS,
            is_array($input['subjects'] ?? null) ? $input['subjects'] : ['stills'],
        ));

        $cast = in_array($input['cast'] ?? null, self::CAST_MODES, true) ? $input['cast'] : 'none';
        $castIds = array_values(array_unique(array_map('intval', $input['cast_ids'] ?? [])));

        // „კონკრეტული მსახიობი" id-ების გარეშე აზრს კარგავს
        if ($cast === 'selected' && ! $castIds) {
            $cast = 'none';
        }

        $fallbackLimit = $this->clamp($input['limit'] ?? self::DEFAULT_LIMIT, self::MAX_LIMIT, self::DEFAULT_LIMIT, true);
        $fallbackSize = is_string($input['size'] ?? null) ? $input['size'] : null;

        $limits = [];
        $sizes = [];

        foreach (self::SUBJECTS as $subject) {
            // ⚠️ არჩევანში არმყოფი სახეობა **0-ია და არა ნაგულისხმევი** —
            // თორემ ჩიპის მოხსნა ჩამოტვირთვას არ შეაჩერებდა
            $limits[$subject] = in_array($subject, $subjects, true)
                ? $this->clamp($input['limits'][$subject] ?? $fallbackLimit, self::MAX_LIMIT, $fallbackLimit, true)
                : 0;

            $sizes[$subject] = $this->subjectSize(
                $subject,
                $input['sizes'][$subject] ?? $fallbackSize,
            );
        }

        return [
            // ორივე ცარიელი = არაფერი ჩამოვიდეს; controller-ი ამას ვალიდაციით იჭერს
            'subjects' => $subjects,
            // ⚠️ **სამივე გასაღები ყოველთვის არის** — გამომძახებელს `isset`-ის
            // შემოწმება არ სჭირდება და „აკლია" ვერასდროს იქნება „ნაგულისხმევი"
            'limits' => $limits,
            'sizes' => $sizes,
            'cast' => $cast,
            'cast_ids' => $castIds,
            'cast_source' => in_array($input['cast_source'] ?? null, self::CAST_SOURCES, true)
                ? $input['cast_source']
                : self::DEFAULT_CAST_SOURCE,
            'cast_size' => in_array($input['cast_size'] ?? null, self::CAST_SIZES, true)
                ? $input['cast_size']
                : self::DEFAULT_CAST_SIZE,
            // ⚠️ **`per_actor`-ზე 0 „არცერთია" და არა „ნაგულისხმევი"** (Tasks §3.6)
            'per_actor' => $this->clamp($input['per_actor'] ?? self::DEFAULT_PER_ACTOR, self::MAX_PER_ACTOR, self::DEFAULT_PER_ACTOR, true),
            // მსახიობების **რაოდენობა** 0-ს არ იღებს — „არცერთი მსახიობი"
            // `cast = none`-ია და ორი გზა ერთი და იმავე მდგომარეობისკენ
            // ადრე თუ გვიან ერთმანეთს გაცდებოდა
            'actors' => $this->clamp($input['actors'] ?? self::DEFAULT_ACTORS, self::MAX_ACTORS, self::DEFAULT_ACTORS),
        ];
    }

    /** ზომა სახეობის სიიდან; უცნობი/ცარიელი → სახეობის ნაგულისხმევი */
    private function subjectSize(string $subject, mixed $requested): string
    {
        $allowed = self::SUBJECT_SIZES[$subject] ?? self::SUBJECT_SIZES['stills'];

        return is_string($requested) && in_array($requested, $allowed, true)
            ? $requested
            : self::SUBJECT_DEFAULT_SIZE[$subject];
    }

    private function clamp(mixed $value, int $max, int $fallback, bool $zeroAllowed = false): int
    {
        // ⚠️ ცარიელი/არარიცხვითი მნიშვნელობა ნაგულისხმევზე უნდა დაბრუნდეს და
        // არა 0-ზე — `(int) 'abc'` სწორედ 0-ია
        if ($value === null || $value === '' || ! is_numeric($value)) {
            return $fallback;
        }

        $value = (int) $value;

        if ($zeroAllowed && $value === 0) {
            return 0;
        }

        return $value > 0 ? min($value, $max) : $fallback;
    }

    /**
     * ერთი ჩანაწერის სავარაუდო მოცულობა (17.3). ზედა ზღვარია: ლიმიტზე
     * ნაკლები ფოტო შეიძლება არსებობდეს, უკვე ჩამოტვირთული კი გამოტოვდება.
     */
    public function estimateItem(array $opts): int
    {
        $bytes = 0;

        foreach ($opts['subjects'] as $subject) {
            $bytes += ($opts['limits'][$subject] ?? 0) * $this->avgBytes($opts['sizes'][$subject] ?? null);
        }

        if ($opts['cast'] !== 'none' && $opts['per_actor'] > 0) {
            $actors = $opts['cast'] === 'selected' ? count($opts['cast_ids']) : $opts['actors'];
            $bytes += $actors * $opts['per_actor'] * $this->avgBytes($opts['cast_size']);
        }

        return $bytes;
    }

    /**
     * ერთი **მსახიობის** სავარაუდო მოცულობა — „მსახიობების" სამიზნეს სჭირდება
     * (მთელი ბიბლიოთეკიდან ერთ ან რამდენიმე მსახიობზე ჩამოტვირთვა).
     */
    public function estimateActor(array $opts): int
    {
        return $opts['per_actor'] * $this->avgBytes($opts['cast_size'] ?? self::DEFAULT_CAST_SIZE);
    }

    private function avgBytes(?string $size): int
    {
        return self::AVG_BYTES[$size ?? ''] ?? self::AVG_BYTES['w780'];
    }

    /**
     * ერთი ჩანაწერის გალერეის ჩამოტვირთვა (ჩანაწერის ფოტოები + მსახიობები).
     *
     * კვოტა **ყოველ ფოტოზე** მოწმდება: ამოწურვაზე ციკლი ჩერდება და
     * `quota_exceeded`-ით ბრუნდება (და არა ჩუმად ნახევრად დატოვებით).
     *
     * @return array{ok: bool, added: int, skipped: int, bytes: int, quota_exceeded: bool, error: ?string}
     */
    public function fetch(User $user, Movie|Series|Anime $record, array $opts): array
    {
        $opts = $this->options($opts);
        $result = $this->blank();

        if (! $record->tmdb_id) {
            return [...$result, 'ok' => false, 'error' => 'no_tmdb_id'];
        }

        // 1. ჩანაწერის საკუთარი ფოტოები (თითო სახეს თავისი რაოდენობა/ზომა)
        if ($this->wantsRecordPhotos($opts)) {
            try {
                $candidates = $this->recordCandidates($record, $opts);
            } catch (Throwable $e) {
                return [...$result, 'ok' => false, 'error' => Redact::secrets($e->getMessage())];
            }

            $result = $this->download($user, $record, $candidates, $result);

            if ($result['quota_exceeded']) {
                return $result;
            }
        }

        // 2. მსახიობების ფოტოები — მშობელი თვითონ მსახიობია
        //    (`per_actor = 0` — „არცერთი", §3.6)
        if ($opts['cast'] !== 'none' && $opts['per_actor'] > 0) {
            foreach ($this->castFor($record, $opts) as $member) {
                try {
                    $candidates = $this->actorCandidates($member, $opts);
                } catch (Throwable) {
                    // ერთი მსახიობის ჩავარდნა მთელ ჩანაწერს არ აგდებს
                    $result['skipped']++;

                    continue;
                }

                $result = $this->download($user, $member, $candidates, $result);

                if ($result['quota_exceeded']) {
                    return $result;
                }
            }
        }

        return $result;
    }

    /** არჩეულია სახეობა, რომელსაც დადებითი რაოდენობა აქვს? */
    private function wantsRecordPhotos(array $opts): bool
    {
        foreach ($opts['subjects'] as $subject) {
            if (($opts['limits'][$subject] ?? 0) > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * მხოლოდ ერთი მსახიობის გალერეა — მსახიობის გვერდიდან (Tasks 10).
     *
     * @return array{ok: bool, added: int, skipped: int, bytes: int, quota_exceeded: bool, error: ?string}
     */
    public function fetchActor(User $user, CastMember $member, array $opts): array
    {
        $opts = $this->options($opts);
        $result = $this->blank();

        if (! $member->tmdb_person_id) {
            return [...$result, 'ok' => false, 'error' => 'no_tmdb_id'];
        }

        try {
            $candidates = $this->actorCandidates($member, $opts);
        } catch (Throwable $e) {
            return [...$result, 'ok' => false, 'error' => Redact::secrets($e->getMessage())];
        }

        return $this->download($user, $member, $candidates, $result);
    }

    /** @return array{ok: bool, added: int, skipped: int, bytes: int, quota_exceeded: bool, error: ?string} */
    private function blank(): array
    {
        return ['ok' => true, 'added' => 0, 'skipped' => 0, 'bytes' => 0, 'quota_exceeded' => false, 'error' => null];
    }

    /**
     * ჩამოტვირთვა და მიმაგრება ერთ მშობელზე. დუბლი `remote_path`-ით იჭრება,
     * ე.ი. ხელახლა გაშვება იმავე ფოტოს არ ამატებს.
     *
     * ⚠️ **ზომა კანდიდატზეა და არა გამოძახებაზე** (§8.2): ერთ პარტიაში
     * კადრიც შეიძლება იყოს და პოსტერიც, თითოს კი თავისი ზომა აქვს.
     *
     * @param  list<array{remote_path: string, category: string, name: string, width: ?int, height: ?int, size: string}>  $candidates
     */
    private function download(User $user, Model $parent, array $candidates, array $result): array
    {
        if (! $candidates) {
            return $result;
        }

        $existing = $parent->galleryImages()
            ->withoutGlobalScope('owner')->withoutGlobalScope('album_lock')
            ->where('user_id', $user->getKey())
            ->pluck('remote_path')
            ->filter()
            ->flip();

        $sort = (int) $parent->galleryImages()->withoutGlobalScope('owner')->withoutGlobalScope('album_lock')->max('sort_order');

        foreach ($candidates as $candidate) {
            if (isset($existing[$candidate['remote_path']])) {
                $result['skipped']++;

                continue;
            }

            $extension = $this->extension($candidate['remote_path']);

            // ⚠️ **აქტიური შიგთავსი არ ჩამოიტვირთება** (Tasks SEC-17): ეს ფაილი
            // **საჯარო დისკზე** ჯდება, ე.ი. `.svg` `/storage/...`-ით ავტორიზაციის
            // გარეშე გაიხსნებოდა, `image/svg+xml`-ად, აპის საკუთარ origin-ზე —
            // SEC-05/SEC-08-ის ზუსტად ის სცენარი, რომელიც იქ დაიხურა. შემოწმება
            // **ჩამოტვირთვამდეა**: უარყოფილი კანდიდატი რექვესთსაც არ ღირს.
            if ($extension === null) {
                $result['skipped']++;

                continue;
            }

            $body = $this->downloader->contents($candidate['remote_path'], $candidate['size']);

            if ($body === null) {
                $result['skipped']++;

                continue;
            }

            // ⚠️ ჩამოტვირთვის შემდეგ ვიცით რეალური ზომა — აქ ვწყვეტთ ციკლს,
            // რომ 413 შუა გზაზე არ ამოვარდეს და ნახევარი პარტია არ დარჩეს
            if (! $this->meter->fits($user, strlen($body))) {
                $result['quota_exceeded'] = true;

                return $result;
            }

            $path = $this->meter->storeContents($user, $body, StorageFolder::GALLERY_IMAGES, $extension);

            $parent->galleryImages()->create([
                'user_id' => $user->getKey(),
                'source' => 'tmdb',
                'category' => $candidate['category'],
                'path' => $path,
                'remote_path' => $candidate['remote_path'],
                'original_name' => $candidate['name'],
                'mime' => $this->mime($extension),
                'size' => strlen($body),
                'width' => $candidate['width'],
                'height' => $candidate['height'],
                'sort_order' => ++$sort,
            ]);

            $existing[$candidate['remote_path']] = true;
            $result['added']++;
            $result['bytes'] += strlen($body);
        }

        return $result;
    }

    /**
     * ჩანაწერის ფოტოები — **თითო სახეობა თავის ლიმიტამდე**.
     *
     * ⚠️ **თემატური კატეგორიები** (კონკრეტული სცენა, ჩხუბი და ა.შ.) TMDB-ს
     * არ აქვს (§4.5-ში საერთოდ მოიხსნა). არჩევანი TMDB-ის საკუთარი
     * bucket-ებია — კადრები, პოსტერები, ლოგოები — ხმის მიცემით დალაგებული.
     *
     * @return list<array{remote_path: string, category: string, name: string, width: ?int, height: ?int, size: string}>
     */
    private function recordCandidates(Movie|Series|Anime $record, array $opts): array
    {
        // ⚠️ ანიმეც `/tv/*`-ზე ზის — `instanceof Series` მას ჩუმად ფილმად კითხულობდა
        $images = MediaDomain::isTv(MediaDomain::typeOf($record))
            ? $this->tmdb->tvImages($record->tmdb_id)
            : $this->tmdb->images($record->tmdb_id);

        $out = [];

        foreach ($opts['subjects'] as $subject) {
            $limit = (int) ($opts['limits'][$subject] ?? 0);

            if ($limit <= 0) {
                continue;
            }

            [$bucket, $category] = self::SUBJECT_BUCKETS[$subject];
            $size = $opts['sizes'][$subject];

            $rows = collect($images[$bucket] ?? [])
                ->sortByDesc(fn ($row) => (float) ($row['vote_average'] ?? 0))
                ->values();

            $taken = 0;

            foreach ($rows as $row) {
                if ($taken >= $limit) {
                    break;
                }
                if (empty($row['file_path'])) {
                    continue;
                }

                $out[] = [
                    'remote_path' => $row['file_path'],
                    'category' => $category,
                    'name' => $category.'-'.ltrim($row['file_path'], '/'),
                    'width' => isset($row['width']) ? (int) $row['width'] : null,
                    'height' => isset($row['height']) ? (int) $row['height'] : null,
                    'size' => $size,
                ];
                $taken++;
            }
        }

        return $out;
    }

    /**
     * ერთი მსახიობის ფოტოები — `profiles` და/ან `tagged_images` (§8.2).
     *
     * ⚠️ **`both`-ზე ჯერ პორტრეტები მოდის** და მერე კადრები: `per_actor`
     * საერთო ჭერია, ე.ი. „3 ფოტო" პირველ რიგში პორტრეტს ნიშნავს — ის
     * მსახიობის ფოტოა, კადრი კი ფილმისა, სადაც ის მონაწილეობს.
     *
     * @return list<array{remote_path: string, category: string, name: string, width: ?int, height: ?int, size: string}>
     */
    private function actorCandidates(CastMember $member, array $opts): array
    {
        if (! $member->tmdb_person_id) {
            return [];
        }

        $perActor = (int) $opts['per_actor'];

        if ($perActor <= 0) {
            return [];
        }

        $size = $opts['cast_size'];
        $source = $opts['cast_source'] ?? self::DEFAULT_CAST_SOURCE;
        $out = [];

        if ($source === 'profiles' || $source === 'both') {
            $out = $this->profileCandidates($member, $perActor, $size);
        }

        if (($source === 'tagged' || $source === 'both') && count($out) < $perActor) {
            $out = array_merge($out, $this->taggedCandidates($member, $perActor - count($out), $size));
        }

        return array_slice($out, 0, $perActor);
    }

    /**
     * სტუდიური პორტრეტები — `/person/{id}/images`.
     *
     * @return list<array{remote_path: string, category: string, name: string, width: ?int, height: ?int, size: string}>
     */
    private function profileCandidates(CastMember $member, int $limit, string $size): array
    {
        $profiles = collect($this->tmdb->personImages($member->tmdb_person_id)['profiles'] ?? [])
            ->sortByDesc(fn ($row) => (float) ($row['vote_average'] ?? 0))
            ->values();

        $out = [];

        foreach ($profiles as $row) {
            if (count($out) >= $limit) {
                break;
            }
            if (empty($row['file_path'])) {
                continue;
            }

            $out[] = [
                'remote_path' => $row['file_path'],
                'category' => 'actor',
                'name' => $member->name,
                'width' => isset($row['width']) ? (int) $row['width'] : null,
                'height' => isset($row['height']) ? (int) $row['height'] : null,
                'size' => $size,
            ];
        }

        return $out;
    }

    /**
     * **კადრები ფილმებიდან, სადაც ეს მსახიობია მონიშნული** —
     * `/person/{id}/tagged_images` (§8.2).
     *
     * ⚠️ **პასუხი გვერდიანია** (20 ცალი), ე.ი. მეტი ფოტო = მეტი რექვესთი.
     * ციკლი ჩერდება სამივე შემთხვევაში: საკმარისი შეგროვდა · გვერდები
     * გათავდა · `MAX_TAGGED_PAGES`.
     *
     * ⚠️ **`category` TMDB-ის `image_type`-იდან მოდის** და არა `'actor'`-ად
     * იწერება: ეს მართლა ფილმის პოსტერი/კადრია, უბრალოდ მსახიობზე მიბმული.
     * ასე მსახიობის გვერდზე ჩიპები აზრიანია — „პორტრეტები" და „კადრები"
     * ერთმანეთისგან განსხვავდება. `still` → `backdrop`, რადგან ჩვენი
     * `category` ოთხმნიშვნელოვანია და მესამე სახელი ფილტრებს გატეხდა.
     *
     * ⚠️ **სახელში ფილმის სათაური იწერება** — ფოტოს „რა ვიცით" პანელი
     * სწორედ აქედან პასუხობს კითხვას „ეს რომელი ფილმიდანაა".
     *
     * @return list<array{remote_path: string, category: string, name: string, width: ?int, height: ?int, size: string}>
     */
    private function taggedCandidates(CastMember $member, int $limit, string $size): array
    {
        $out = [];
        $page = 1;

        while (count($out) < $limit && $page <= self::MAX_TAGGED_PAGES) {
            $payload = $this->tmdb->personTaggedImages($member->tmdb_person_id, $page);
            $rows = $payload['results'] ?? [];

            if (! $rows) {
                break;
            }

            foreach ($rows as $row) {
                if (count($out) >= $limit) {
                    break;
                }
                if (empty($row['file_path'])) {
                    continue;
                }

                $title = $row['media']['title'] ?? ($row['media']['name'] ?? $member->name);

                $out[] = [
                    'remote_path' => $row['file_path'],
                    'category' => $this->taggedCategory($row['image_type'] ?? null),
                    'name' => $title,
                    'width' => isset($row['width']) ? (int) $row['width'] : null,
                    'height' => isset($row['height']) ? (int) $row['height'] : null,
                    'size' => $size,
                ];
            }

            $totalPages = (int) ($payload['total_pages'] ?? 1);

            if ($page >= $totalPages) {
                break;
            }

            $page++;
        }

        return $out;
    }

    private function taggedCategory(?string $imageType): string
    {
        return match ($imageType) {
            'poster' => 'poster',
            'logo' => 'logo',
            // `backdrop` და `still` — ორივე ფილმის კადრია
            default => 'backdrop',
        };
    }

    /**
     * არჩეული მსახიობები: ყველა · ქალი · კაცი · კონკრეტული.
     *
     * ⚠️ სქესი TMDB-დან მოდის და ძველ ჩანაწერებზე შეიძლება ცარიელი იყოს —
     * ამიტომ გენდერული ფილტრის წინ ერთი `credits` რექვესთით ვავსებთ
     * (`backfillGenders`), რომ სრული resync არ დასჭირდეს.
     *
     * @return Collection<int, CastMember>
     */
    public function castFor(Movie|Series|Anime $record, array $opts): Collection
    {
        $cast = $record->cast()->get();

        if (in_array($opts['cast'], ['female', 'male'], true) && $cast->contains(fn ($m) => $m->gender === null)) {
            $this->backfillGenders($record, $cast);
        }

        $filtered = match ($opts['cast']) {
            'female' => $cast->where('gender', CastMember::GENDER_FEMALE),
            'male' => $cast->where('gender', CastMember::GENDER_MALE),
            'selected' => $cast->whereIn('id', $opts['cast_ids']),
            default => $cast,
        };

        // მხოლოდ ისინი, ვისაც TMDB-ის პირის id აქვს — სხვაზე გალერეა ვერ მოვა
        $filtered = $filtered->filter(fn (CastMember $m) => (bool) $m->tmdb_person_id)->values();

        return $opts['cast'] === 'selected' ? $filtered : $filtered->take($opts['actors']);
    }

    /**
     * სქესის შევსება **ჩანაწერის მიხედვით**, ჩამოტვირთვის გარეშე.
     *
     * ⚠️ „ქალი/კაცი" ფილტრს სქესი სჭირდება, ხოლო `cast_members.gender`
     * 2026-09-03-მდე სინქრონიზებულ ჩანაწერებზე ცარიელია. მსახიობების
     * **ტაბი** (Tasks §3.2) ჩანაწერზე გავლით აღარ ჩამოტვირთავს, ე.ი.
     * `castFor()`-ის შიდა შევსებამდე აღარ მიდის — გეგმა მას პირდაპირ იძახებს.
     */
    public function backfillGendersForRecord(Movie|Series|Anime $record): void
    {
        $cast = $record->cast()->get();

        if ($cast->contains(fn ($m) => $m->gender === null)) {
            $this->backfillGenders($record, $cast);
        }
    }

    /** სქესის შევსება TMDB-ის credits-იდან (ერთი რექვესთი ჩანაწერზე) */
    private function backfillGenders(Movie|Series|Anime $record, Collection $cast): void
    {
        try {
            $credits = MediaDomain::isTv(MediaDomain::typeOf($record))
                ? $this->tmdb->tvCredits($record->tmdb_id)
                : $this->tmdb->credits($record->tmdb_id);
        } catch (Throwable) {
            return;
        }

        $byPerson = collect($credits['cast'] ?? [])->keyBy('id');

        foreach ($cast as $member) {
            if ($member->gender !== null || ! $member->tmdb_person_id) {
                continue;
            }
            $gender = $byPerson->get($member->tmdb_person_id)['gender'] ?? null;
            if ($gender !== null) {
                $member->forceFill(['gender' => (int) $gender])->save();
            }
        }
    }

    /**
     * **კანდიდატის გაფართოება — allow-სია, და არა „აკრძალულების" სია** (Tasks SEC-17).
     *
     * ⚠️ `null` ნიშნავს „არ ჩამოვტვირთოთ". სიის allow-ად წერა განზრახულია:
     * აკრძალულების სია ახალ ფორმატს ჩუმად უშვებს, allow-სია კი — არა.
     * `WebImageImporter::extension()`-ის იგივე წესია, ოღონდ იქ MIME-ზე, აქ
     * გაფართოებაზე: TMDB-ის `file_path` `.jpg`/`.png`/`.svg`-ია და MIME-ს
     * CDN ისედაც ჩვენი გაფართოებიდან იღებს.
     *
     * ⚠️ **გაფართოების გარეშე მოსული გზა `jpg`-ია** — ეს ძველი ქცევაა და
     * უსაფრთხოა: ყველაზე ვიწრო რასტრული ტიპი.
     */
    private function extension(string $remotePath): ?string
    {
        $extension = strtolower(pathinfo($remotePath, PATHINFO_EXTENSION) ?: 'jpg');

        return in_array($extension, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'], true)
            ? $extension
            : null;
    }

    private function mime(string $extension): string
    {
        return match (strtolower($extension)) {
            'png' => 'image/png',
            'webp' => 'image/webp',
            'gif' => 'image/gif',
            'avif' => 'image/avif',
            default => 'image/jpeg',
        };
    }
}
