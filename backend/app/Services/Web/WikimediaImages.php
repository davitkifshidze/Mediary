<?php

namespace App\Services\Web;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * **Wikimedia Commons — უფასო კატალოგი (Tasks §7.5, წყარო „დ")**.
 *
 * ⚠️ **ეს ნაგულისხმევი წყაროა და არა სათადარიგო** — სწორედ ასე წერია §7.5-ში.
 * მიზეზი ფულია: SerpApi-ს 250 ძებნა აქვს **თვეში მთელ ანგარიშზე**, აქ კი
 * არც გასაღები სჭირდება და არც ლიმიტი აქვს. ე.ი. ჯერ აქ ვეძებთ, SerpApi კი
 * მაშინ, როცა ტეგით ძებნა მართლა გჭირდება.
 *
 * ⚠️ **სამაგიეროდ ტეგით ძებნა აქ სუსტია** და ესეც §7.5-შია დაწერილი: Commons
 * ფაილის **სახელსა და აღწერაზე** ეძებს და არა სურათის შიგთავსზე, ე.ი.
 * „წითელი ხალიჩა" იმუშავებს მხოლოდ თუ ვინმემ ფაილს ასე დაარქვა. სწორედ
 * ამიტომ რჩება SerpApi სიაში.
 *
 * ⚠️ **`User-Agent` სავალდებულოა.** მის გარეშე Wikimedia **403**-ს აბრუნებს
 * (გადამოწმებულია 2026-09-11) — ე.ი. წყარო ჩუმად „მიუწვდომელი" იქნებოდა და
 * მიზეზი სადმე ლოგში დაიკარგებოდა. ეს მათი ცხადი პოლიტიკაა და არა ბოტების
 * ბრმა ბლოკირება.
 *
 * ⚠️ **ლიცენზია ჩანს** (`CC BY-SA 2.0` და მისთანანი) — ამ წყაროს მთელი აზრი
 * სწორედ ისაა, რომ სურათი ლიცენზირებულია; მისი დამალვა უპირატესობას შლის.
 */
class WikimediaImages
{
    public const KEY = 'wikimedia';

    private const URL = 'https://commons.wikimedia.org/w/api.php';

    /** ⚠️ ლიმიტი არ აქვს, მაგრამ ქეში მაინც რჩება — ერთსა და იმავე შეკითხვაზე
        გარეთ გასვლა ზედმეტია. ჩავარდნა **არ** ქეშირდება. */
    private const CACHE_HOURS = 24;

    /**
     * ძებნა.
     *
     * @return array{ok: bool, cached: bool, engine: string, items: list<array<string, mixed>>, dropped: int}
     */
    public function search(string $query, int $limit = 20): array
    {
        $query = trim($query);
        $limit = max(1, min($limit, 50));

        if ($query === '') {
            return $this->blank();
        }

        $cacheKey = 'wikimedia:'.sha1($query.'|'.$limit);
        $cached = Cache::get($cacheKey);

        if (is_array($cached)) {
            return ['ok' => true, 'cached' => true, 'engine' => self::KEY, 'items' => $cached['items'], 'dropped' => $cached['dropped']];
        }

        try {
            $res = Http::timeout(20)
                // ⚠️ Windows-ის cURL-ს CA bundle არ აქვს (არსებული წესი)
                ->withOptions(['verify' => storage_path('cacert.pem')])
                // ⚠️ ამის გარეშე 403 (იხ. ზემოთ)
                ->withHeaders(['User-Agent' => 'Mediary/1.0 (personal media library)'])
                ->get(self::URL, [
                    'action' => 'query',
                    'format' => 'json',
                    'generator' => 'search',
                    'gsrsearch' => $query,
                    // namespace 6 = File: — სხვა namespace-ები სტატიებია და არა სურათები
                    'gsrnamespace' => 6,
                    'gsrlimit' => $limit,
                    'prop' => 'imageinfo',
                    'iiprop' => 'url|size|mime|extmetadata',
                    'iiurlwidth' => 400,
                ]);
        } catch (Throwable) {
            return $this->blank(false);
        }

        if (! $res->successful()) {
            return $this->blank(false);
        }

        $pages = $res->json('query.pages');
        $items = [];
        $dropped = 0;

        foreach (is_array($pages) ? $pages : [] as $page) {
            $item = $this->item(is_array($page) ? $page : []);

            if ($item) {
                $items[] = $item;
            } else {
                // იპოვა, მაგრამ გამოუსადეგარია (მაგ. PDF ან ხმოვანი ფაილი)
                $dropped++;
            }
        }

        Cache::put($cacheKey, ['items' => $items, 'dropped' => $dropped], now()->addHours(self::CACHE_HOURS));

        return ['ok' => true, 'cached' => false, 'engine' => self::KEY, 'items' => $items, 'dropped' => $dropped];
    }

    /**
     * @param  array<string, mixed>  $page
     * @return array<string, mixed>|null
     */
    private function item(array $page): ?array
    {
        $info = $page['imageinfo'][0] ?? null;

        if (! is_array($info) || ! is_string($info['url'] ?? null)) {
            return null;
        }

        // ⚠️ Commons-ში მხოლოდ სურათები არ დევს — PDF-ები, ვიდეოები და ხმაც.
        // არა-სურათი გალერეაში ვერ ჩაჯდება, ე.ი. აქვე იჭრება.
        if (! str_starts_with((string) ($info['mime'] ?? ''), 'image/')) {
            return null;
        }

        $title = is_string($page['title'] ?? null)
            // „File:Keanu Reeves.jpg" → „Keanu Reeves.jpg"
            ? preg_replace('~^File:~i', '', $page['title'])
            : null;

        return [
            'engine' => self::KEY,
            'source' => self::KEY,
            'title' => $title,
            'original' => $info['url'],
            'thumbnail' => is_string($info['thumburl'] ?? null) ? $info['thumburl'] : $info['url'],
            // გვერდი Commons-ზე — ავტორი და ლიცენზია იქ წერია
            'link' => is_string($info['descriptionurl'] ?? null) ? $info['descriptionurl'] : null,
            'domain' => 'commons.wikimedia.org',
            'width' => is_numeric($info['width'] ?? null) ? (int) $info['width'] : null,
            'height' => is_numeric($info['height'] ?? null) ? (int) $info['height'] : null,
            // ⚠️ ლიცენზია ამ წყაროს მთავარი უპირატესობაა — ცხადად ჩანს
            'license' => is_string($info['extmetadata']['LicenseShortName']['value'] ?? null)
                ? $info['extmetadata']['LicenseShortName']['value']
                : null,
        ];
    }

    /** @return array{ok: bool, cached: bool, engine: string, items: list<array<string, mixed>>, dropped: int} */
    private function blank(bool $ok = true): array
    {
        return ['ok' => $ok, 'cached' => false, 'engine' => self::KEY, 'items' => [], 'dropped' => 0];
    }
}
