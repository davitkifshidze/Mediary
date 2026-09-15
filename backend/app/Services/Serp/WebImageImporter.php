<?php

namespace App\Services\Serp;

use App\Models\GalleryImage;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use App\Services\Web\WikimediaImages;
use App\Support\SafeHttp;
use App\Support\StorageFolder;
use Illuminate\Database\Eloquent\Model;

/**
 * **ვებიდან ნაპოვნი ფოტოს ჩამოტვირთვა და მიმაგრება (Tasks §7.6.5)**.
 *
 * ⚠️ **ჩამოტვირთული ფაილი კვოტას ეხება** და ეს TMDB-ის პოსტერისგან მთავარი
 * განსხვავებაა. TMDB-ის ფაილი **საზიაროა** (ერთი და იგივე სურათი ყველა
 * ანგარიშზე ერთია და ჩანაწერის წაშლისას არ იშლება), ვებიდან ჩამოწერილი კი
 * **შენი ატვირთვის ტოლფასია** — შენ აირჩიე, შენს დისკზე ჯდება, შენს კვოტას
 * ხარჯავს. ამიტომ გზა `StorageMeter::storeContents()`-ზეა და წაშლისას
 * `StoredFile`-ის hook კვოტას ათავისუფლებს.
 *
 * ⚠️ **ამოწურვაზე 413 და უკვე ჩამოტვირთული რჩება** — გალერეის არსებული
 * ქცევა (`GalleryFetcher`): ნახევარი პარტიის უკან დაბრუნება ჩამოტვირთვის
 * ხელახლა გაშვებას ნიშნავდა, ე.ი. ტრაფიკის ორმაგ ხარჯვას.
 *
 * ⚠️ **`original` ხშირად კვდება ან 403-ს აბრუნებს** (hotlink-ის დაცვა) —
 * ეს ნორმაა და არა შეცდომა. ასეთ დროს **ესკიზი ჩამოიწერება სათადარიგოდ**
 * და `is_thumbnail = true` ცხადად ამბობს, რომ ესკიზია: ცარიელი ჩანაწერი
 * ან უხილავი ხარისხის დაცემა ორივე უარესია.
 *
 * ⚠️ **HTML არასდროს ინახება** (`VideoUrl`-ის წესი): პასუხის `content-type`
 * მოწმდება და არა-სურათი უბრალოდ არ ჩამოიწერება — თორემ 403-ის გვერდი
 * „სურათად" შეინახებოდა და ბადეში გატეხილი უჯრა გამოჩნდებოდა.
 *
 * ⚠️ **ჩამოტვირთვა `SafeHttp`-ზე გადის** (აუდიტი 2026-09-14, §A2/§A3). ორი
 * მიზეზი: მისამართი **მომხმარებლის ნაკარნახევია** (ძებნის შედეგიდან მოდის,
 * მაგრამ სხეულს კლიენტი აგზავნის), ე.ი. `http://127.0.0.1:…` სერვერს შიდა
 * ქსელის სკანერად აქცევდა; და `MAX_BYTES` **ჩამოტვირთვის შემდეგ** მოწმდებოდა,
 * ე.ი. 2 GB-იანი ფაილი მეხსიერებას ამოწურავდა სანამ ჭერამდე მივიდოდით.
 */
class WebImageImporter
{
    /**
     * ერთი ფოტოს ჭერი. ვებში 20 MB-იანი PNG-იც გვხვდება, და ის ერთ ჩანაწერზე
     * მთელ კვოტას შეჭამდა.
     */
    private const MAX_BYTES = 15_000_000;

    public function __construct(
        private readonly StorageMeter $meter,
        private readonly SafeHttp $http,
    ) {}

    /**
     * მონიშნული ფოტოები ერთ მშობელზე.
     *
     * @param  list<array<string, mixed>>  $images
     * @return array{added: int, skipped: int, failed: int, thumbnails: int, bytes: int, quota_exceeded: bool}
     */
    public function import(User $user, Model $parent, array $images, string $category): array
    {
        $result = ['added' => 0, 'skipped' => 0, 'failed' => 0, 'thumbnails' => 0, 'bytes' => 0, 'quota_exceeded' => false];

        if (! $images) {
            return $result;
        }

        // დუბლი ორიგინალი ლინკით იჭრება — ხელახლა გაშვება იმავე ფოტოს არ ამატებს
        $existing = $parent->galleryImages()
            ->withoutGlobalScope('owner')
            ->where('user_id', $user->getKey())
            ->pluck('remote_path')
            ->filter()
            ->flip();

        $sort = (int) $parent->galleryImages()->withoutGlobalScope('owner')->max('sort_order');

        foreach ($images as $image) {
            $original = $this->httpUrl($image['original'] ?? null);
            $thumbnail = $this->httpUrl($image['thumbnail'] ?? null);
            // ერთეულის ვინაობა ორიგინალია; ესკიზი მხოლოდ სათადარიგო წყაროა
            $identity = $original ?? $thumbnail;

            if ($identity === null) {
                $result['failed']++;

                continue;
            }

            if (isset($existing[$identity])) {
                $result['skipped']++;

                continue;
            }

            $file = $original ? $this->download($original) : null;
            $fromThumbnail = false;

            // ⚠️ ორიგინალი ჩავარდა → ესკიზი, და ეს ცხადად აღინიშნება
            if ($file === null && $thumbnail !== null && $thumbnail !== $original) {
                $file = $this->download($thumbnail);
                $fromThumbnail = $file !== null;
            }

            if ($file === null) {
                $result['failed']++;

                continue;
            }

            // ⚠️ ნამდვილი ზომა მხოლოდ ჩამოტვირთვის შემდეგ ვიცით — ციკლს აქ
            // ვწყვეტთ, რომ 413 შუა გზაზე არ ამოვარდეს და ნახევარი პარტია
            // დაუწერელი არ დარჩეს (`GalleryFetcher`-ის ზუსტი ქცევა)
            if (! $this->meter->fits($user, strlen($file['body']))) {
                $result['quota_exceeded'] = true;

                return $result;
            }

            $path = $this->meter->storeContents($user, $file['body'], StorageFolder::GALLERY_IMAGES, $file['extension']);

            GalleryImage::create([
                'user_id' => $user->getKey(),
                'imageable_type' => $parent->getMorphClass(),
                'imageable_id' => $parent->getKey(),
                // §7.6.5 — რომელმა engine-მა მოიტანა; მერე გაფილტვრაც შეიძლება
                'source' => $this->source($image),
                'category' => $category,
                'path' => $path,
                'remote_path' => $identity,
                // გვერდი, სადაც ფოტო იდო — წყაროს მითითებისთვის
                'source_url' => $this->httpUrl($image['link'] ?? null),
                'original_name' => $this->name($image, $file['extension']),
                'mime' => $file['mime'],
                'size' => strlen($file['body']),
                'width' => $fromThumbnail ? null : $this->int($image['width'] ?? null),
                'height' => $fromThumbnail ? null : $this->int($image['height'] ?? null),
                'is_thumbnail' => $fromThumbnail,
                'sort_order' => ++$sort,
            ]);

            $existing[$identity] = true;
            $result['added']++;
            $result['bytes'] += strlen($file['body']);

            if ($fromThumbnail) {
                $result['thumbnails']++;
            }
        }

        return $result;
    }

    /**
     * ფაილის ჩამოტვირთვა. ⚠️ **ჩავარდნა ნორმაა** — ბევრი საიტი hotlink-ს
     * კრძალავს, ე.ი. `null` აქ შეცდომა არ არის და 500-ად არ იქცევა.
     *
     * @return array{body: string, mime: string, extension: string}|null
     */
    private function download(string $url): ?array
    {
        $res = $this->http->fetch(
            $url,
            self::MAX_BYTES,
            // hotlink-ის დაცვა ბოტს აგდებს; ბრაუზერული UA ამას ხსნის
            [
                'User-Agent' => 'Mozilla/5.0 (compatible; Mediary/1.0; +personal library)',
                'Accept' => 'image/avif,image/webp,image/*,*/*;q=0.8',
            ],
            timeout: 25,
        );

        if ($res === null) {
            return null;
        }

        $mime = (string) $res['mime'];
        $extension = $this->extension($mime);

        // ⚠️ არა-სურათი არ ინახება: 403-ის HTML გვერდი „ფოტოდ" შეინახებოდა
        if ($extension === null) {
            return null;
        }

        /* ⚠️ **მოჭრილი სურათი არ ინახება.** ტექსტისგან განსხვავებით ნახევარი
           ფაილი აქ გატეხილი ფაილია — ის ბადეში გატეხილ უჯრად დაიხატებოდა და
           კვოტასაც დახარჯავდა. `SafeHttp` ცხადად გვეუბნება, შეწყდა თუ
           დასრულდა (`truncated`) — სწორედ ამისთვის კითხულობს ერთი ბაიტით მეტს. */
        if ($res['body'] === '' || $res['truncated']) {
            return null;
        }

        return ['body' => $res['body'], 'mime' => $mime, 'extension' => $extension];
    }

    /** ცნობილი სურათის ტიპები; სხვა ყველაფერი უარყოფილია (`null`) */
    private function extension(string $mime): ?string
    {
        return match ($mime) {
            'image/jpeg', 'image/jpg', 'image/pjpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            'image/avif' => 'avif',
            default => null,
        };
    }

    /**
     * წყარო `serpapi:<engine>` ფორმაში (§7.6.5). ⚠️ **მხოლოდ ჩვენ ვწერთ** —
     * ფრონტის მოტანილი ტექსტი აქ არ ჯდება, თორემ სვეტში ნებისმიერი სტრიქონი
     * მოხვდებოდა და „საიდან მოვიდა" ფილტრი უაზრო გახდებოდა.
     *
     * @param  array<string, mixed>  $image
     */
    private function source(array $image): string
    {
        $engine = is_string($image['engine'] ?? null) ? $image['engine'] : null;

        // ⚠️ უფასო კატალოგს **`serpapi:` პრეფიქსი არ ეკუთვნის** — ის SerpApi-ს
        // არ გაუვლია და ასეთი წარწერა „საიდან მოვიდა" ფილტრს დაატყუებდა
        if ($engine === WikimediaImages::KEY) {
            return WikimediaImages::KEY;
        }

        $known = array_merge(
            array_keys(SerpApiClient::IMAGE_ENGINES),
            array_keys(SerpApiClient::VIDEO_ENGINES),
        );

        return $engine !== null && in_array($engine, $known, true) ? 'serpapi:'.$engine : 'web';
    }

    /** @param  array<string, mixed>  $image */
    private function name(array $image, string $extension): string
    {
        $title = is_string($image['title'] ?? null) ? trim($image['title']) : '';
        $title = $title === '' ? 'web-image' : mb_substr($title, 0, 120);

        return $title.'.'.$extension;
    }

    private function httpUrl(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);

        return $value !== '' && preg_match('~^https?://~i', $value) && mb_strlen($value) <= 1000
            ? $value
            : null;
    }

    private function int(mixed $value): ?int
    {
        return is_numeric($value) ? max(0, (int) $value) : null;
    }
}
