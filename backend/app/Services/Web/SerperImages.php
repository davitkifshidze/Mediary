<?php

namespace App\Services\Web;

use App\Services\Credentials\CredentialStore;
use App\Support\CredentialProviders;
use App\Support\SourceLog;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * **Serper.dev — Google Images მესამე წყაროდ (2026-09-14).**
 *
 * `WikimediaImages` უფასოა, მაგრამ მისი ძებნა სუსტია (ფაილის სახელსა და
 * აღწერას ეძებს); SerpApi ძლიერია, მაგრამ თვეში 250 ძებნაა. Serper იმავე
 * Google Images-ს აბრუნებს, ოღონდ გაცილებით იაფად — ამიტომ ის მესამე
 * პარალელური წყაროა და არავის ანაცვლებს.
 *
 * ⚠️ **გვერდები ხელით შეიყვანება** (`pages`), და ეს არჩევანი ფულს ხარჯავს:
 * **თითო გვერდი = ერთი credit**. სწორედ ამიტომ არის ნაგულისხმევი მცირე და
 * რიცხვი ცხადად ჩანს ინტერფეისში — „50 გვერდი" ერთი დაჭერით 50 credit-ია.
 *
 * ⚠️ **დუბლი გვერდებს შორის აქვე იჭრება** (`original`-ის მიხედვით): Google
 * მეზობელ გვერდებზე ერთსა და იმავე სურათს ხშირად იმეორებს, ე.ი. „1000 ფოტო"
 * სხვაგვარად ნახევრად გამეორება იქნებოდა.
 *
 * ⚠️ **ჩავარდნა არ ქეშირდება** — ერთი ცუდი წამი მთელი დღით „მიუწვდომელს"
 * გახდიდა წყაროს (`SerpApiClient`/`GeorgianShops`-ის წესი).
 *
 * ⚠️ Windows-ის cURL-ს CA bundle არ აქვს — `verify` ყოველ გამავალ ძახილზე.
 */
class SerperImages
{
    public const KEY = 'serper';

    private const URL = 'https://google.serper.dev/images';

    /** Serper ერთ გვერდზე 100-მდე შედეგს აბრუნებს */
    private const PER_PAGE = 100;

    /** ⚠️ ჭერი ხარჯზეა და არა შედეგზე: 100 გვერდი = 100 credit ერთ დაჭერაზე */
    public const MAX_PAGES = 100;

    /** მთლიანი შედეგის ჭერი — ინტერფეისში ხელით შეიყვანება */
    public const MAX_LIMIT = 1000;

    private const CACHE_HOURS = 24;

    public function configured(): bool
    {
        return (string) CredentialStore::value(CredentialProviders::SERPER) !== '';
    }

    /**
     * ძებნა.
     *
     * ## „კიდევ ჩამოიტანე" (Tasks §19.4)
     * ⚠️ **`$fromPage` მხოლოდ ახალ გვერდებს ითხოვს.** „მეტის" გაგება
     * უფრო დიდი `limit`-ით იგივე შეკითხვის ხელახლა გაშვება იქნებოდა —
     * ქეშის გასაღები იცვლება, ე.ი. **უკვე ნაყიდი გვერდები თავიდან
     * დაიხარჯებოდა**. აქ მეორე ნაწილი ზუსტად ერთ ახალ credit-ს ღირს.
     *
     * ⚠️ **`next` = შემდეგი ჯერ არ მოთხოვნილი გვერდი**, `null` = მეტი
     * აღარაფერია. „ნაკლები 100-ზე" დასასრული **არ არის**: Google გვერდზე
     * ხშირად 40–60 სურათს აბრუნებს და შემდეგზე ისევ აქვს (ქართულ
     * შეკითხვაზე გადამოწმებულია: 113 სურათი სამ გვერდზე). დასასრულს
     * მხოლოდ ცარიელი გვერდი ამბობს — ან ჭერი (`MAX_PAGES`).
     *
     * @param  int  $limit  სულ რამდენი სურათი (დუბლის მოჭრის შემდეგ)
     * @param  int  $pages  რამდენი გვერდი მოვითხოვოთ — **თითო ერთი credit**
     * @param  int  $fromPage  რომელი გვერდიდან (1 = ახალი ძებნა)
     * @return array{ok: bool, cached: bool, engine: string, items: list<array<string, mixed>>, dropped: int, spent: int, next: int|null}
     */
    public function search(string $query, int $limit = 100, int $pages = 1, bool $safe = false, int $fromPage = 1): array
    {
        $query = trim($query);
        $limit = max(1, min($limit, self::MAX_LIMIT));
        $pages = max(1, min($pages, self::MAX_PAGES));
        $fromPage = max(1, min($fromPage, self::MAX_PAGES));

        if ($query === '' || ! $this->configured()) {
            return $this->blank($this->configured());
        }

        // ⚠️ ზედმეტ გვერდს არ ვითხოვთ: 200 სურათს ორი გვერდი ჰყოფნის და
        // დანარჩენი უბრალოდ დახარჯული credit-ები იქნებოდა
        $pages = min($pages, (int) ceil($limit / self::PER_PAGE));
        // ⚠️ ჭერი ბოლო გვერდზეცაა — გაგრძელება `MAX_PAGES`-ს ვერ გადასცდება
        $lastPage = min($fromPage + $pages - 1, self::MAX_PAGES);

        /* ⚠️ პირველ ნაწილს ძველი გასაღები რჩება — თორემ ამ ცვლილებამდე
           ქეშირებული ძებნა 24 საათის განმავლობაში credit-ებს თავიდან დახარჯავდა */
        $cacheKey = 'serper:'.sha1($query.'|'.$limit.'|'.$pages.'|'.($safe ? 1 : 0).($fromPage > 1 ? '|'.$fromPage : ''));
        $cached = Cache::get($cacheKey);

        if (is_array($cached)) {
            return [
                'ok' => true, 'cached' => true, 'engine' => self::KEY,
                'items' => $cached['items'], 'dropped' => $cached['dropped'], 'spent' => 0,
                'next' => $cached['next'] ?? null,
            ];
        }

        $items = [];
        $dropped = 0;
        $spent = 0;
        $seen = [];
        $next = $lastPage < self::MAX_PAGES ? $lastPage + 1 : null;

        for ($page = $fromPage; $page <= $lastPage; $page++) {
            $rows = $this->page($query, $page, $safe);

            // ⚠️ `null` = წყარო ჩავარდა. თუ პირველივე გვერდია, ეს „მიუწვდომელია";
            // შუაში კი ვჩერდებით და **უკვე მოტანილს ვინახავთ** (გალერეის 413-ის წესი).
            // ჩავარდნილი გვერდი `next`-ად რჩება — „კიდევ" სწორედ მას სცდის თავიდან.
            if ($rows === null) {
                if ($page === $fromPage) {
                    return $this->blank(false);
                }

                $next = $page;

                break;
            }

            $spent++;

            foreach ($rows as $row) {
                $item = $this->item(is_array($row) ? $row : []);

                if (! $item) {
                    $dropped++;

                    continue;
                }

                // დუბლი გვერდებს შორის — Google მათ ხშირად იმეორებს
                if (isset($seen[$item['original']])) {
                    continue;
                }

                $seen[$item['original']] = true;
                $items[] = $item;

                if (count($items) >= $limit) {
                    // ⚠️ ამ გვერდის კუდი იკარგება, გაგრძელება კი შემდეგიდან იწყება —
                    // ჭერი მომხმარებლის არჩევანია და ერთი გვერდის ხელახლა ყიდვა ზედმეტია
                    $next = $page < self::MAX_PAGES ? $page + 1 : null;

                    break 2;
                }
            }

            // გვერდი ცარიელი — შემდეგზე გადასვლა credit-ის ფლანგვაა, და მეტიც აღარაფერია
            if (! $rows) {
                $next = null;

                break;
            }
        }

        Cache::put($cacheKey, ['items' => $items, 'dropped' => $dropped, 'next' => $next], now()->addHours(self::CACHE_HOURS));

        return [
            'ok' => true, 'cached' => false, 'engine' => self::KEY,
            'items' => $items, 'dropped' => $dropped, 'spent' => $spent, 'next' => $next,
        ];
    }

    /**
     * ერთი გვერდი. `null` = წყარო არ პასუხობს (ცარიელი მასივისგან განსხვავებით,
     * რაც „ამ გვერდზე აღარაფერია"-ს ნიშნავს).
     *
     * @return list<mixed>|null
     */
    private function page(string $query, int $page, bool $safe): ?array
    {
        try {
            $res = SourceLog::request(25)
                ->withHeaders(['X-API-KEY' => (string) CredentialStore::value(CredentialProviders::SERPER)])
                ->post(self::URL, [
                    'q' => $query,
                    'num' => self::PER_PAGE,
                    'page' => $page,
                    /* ⚠️ **`off` ცხადად იგზავნება და პარამეტრი არ გამოტოვდება**
                       (2026-09-14). გამოტოვებულზე Google თავის ნაგულისხმევს
                       იყენებს, ის კი 2023-იდან **ბუნდოვანს ხდის** მონიშნულ
                       სურათებს — ზუსტად ის „ბლარი", რომელიც ეკრანზე ჩანდა.
                       §7.5-ის პირობა კი პირიქითაა: „რასაც ტეგში დაწერს, ის
                       ჩამოიწეროს". იგივე წესი `SerpApiClient`-საც აქვს. */
                    'safe' => $safe ? 'active' : 'off',
                ]);
        } catch (Throwable $e) {
            return SourceLog::threw('serper', $e, ['query' => $query, 'page' => $page]);
        }

        /* ⚠️ **Serper-ზე თითო გვერდი კრედიტია** (§7.5), ე.ი. ჩავარდნილი
           გვერდი დახარჯული ფულია — მიზეზი აუცილებლად უნდა ჩანდეს. */
        if (! $res->successful()) {
            return SourceLog::status('serper', $res->status(), $res->body(), ['query' => $query, 'page' => $page]);
        }

        $rows = $res->json('images');

        return is_array($rows) ? array_values($rows) : [];
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>|null
     */
    private function item(array $row): ?array
    {
        $original = $row['imageUrl'] ?? null;

        // ⚠️ ბმულის გარეშე ერთეული გამოუსადეგარია — ის `dropped`-ში ითვლება
        // და არა „ვერაფერი ვიპოვე"-ში (სამი მდგომარეობის წესი)
        if (! is_string($original) || $original === '') {
            return null;
        }

        $link = is_string($row['link'] ?? null) ? $row['link'] : null;

        return [
            'engine' => self::KEY,
            'source' => self::KEY,
            'title' => is_string($row['title'] ?? null) ? $row['title'] : null,
            'original' => $original,
            'thumbnail' => is_string($row['thumbnailUrl'] ?? null) ? $row['thumbnailUrl'] : $original,
            // გვერდი, სადაც სურათი დევს — „საიდან მოვიდა" კითხვის პასუხი
            'link' => $link,
            'domain' => is_string($row['domain'] ?? null)
                ? $row['domain']
                : ($link ? parse_url($link, PHP_URL_HOST) : null),
            'width' => is_numeric($row['imageWidth'] ?? null) ? (int) $row['imageWidth'] : null,
            'height' => is_numeric($row['imageHeight'] ?? null) ? (int) $row['imageHeight'] : null,
            // ლიცენზია Google-ს არ მოჰყვება — `null` და არა გამოგონილი ტექსტი
            'license' => null,
        ];
    }

    /** @return array{ok: bool, cached: bool, engine: string, items: list<array<string, mixed>>, dropped: int, spent: int, next: null} */
    private function blank(bool $ok = true): array
    {
        return ['ok' => $ok, 'cached' => false, 'engine' => self::KEY, 'items' => [], 'dropped' => 0, 'spent' => 0, 'next' => null];
    }
}
