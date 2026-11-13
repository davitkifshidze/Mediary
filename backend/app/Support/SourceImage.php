<?php

namespace App\Support;

/**
 * **გარე წყაროს სურათის ჩამოტვირთვა მისამართით** — RAWG-ის/IGDB-ის ყდა,
 * BGG-ის ფოტო.
 *
 * ⚠️ **მისამართი მოთხოვნიდან მოდის** (ფორმა ძებნის შედეგის ბმულს უკან
 * აგზავნის), ე.ი. ის მომხმარებლის ნაკარნახევია და არა წყაროსი. ამიტომ სამი
 * ფენა, სამივე აუცილებელი:
 *
 * - **ჰოსტი წყაროს საკუთარი CDN-ია** (`HOSTS`) და სქემა `https` — სხვა
 *   მისამართი საერთოდ არ იხსნება. ფაილის სახელი წყაროს id-ია და ანგარიშებს
 *   შორის საერთოა: უცხო ჰოსტის სურათი სხვის ყდადაც იქცეოდა.
 * - **`SafeHttp`** — შიდა ქსელის ფილტრი ყოველ ნახტომზე, DNS-ის მიბმა და
 *   ზომის ნამდვილი ჭერი (`SourceLog::request()` სამივეს გარეშე მუშაობდა).
 * - **შიგთავსი სურათია** (`finfo`) — საჯარო დისკზე `.jpg` სახელით სხვა
 *   რამ არ იწერება.
 *
 * ⚠️ **ჩავარდნა ნორმაა და ლოგში ჩანს**: ჩანაწერი ყდის გარეშე ინახება,
 * „ყდა რატომ არ ჩამოვიდა" კი `sources.log`-ში იკითხება.
 */
class SourceImage
{
    /** ერთი ყდის ჭერი — წყაროების ორიგინალები რამდენიმე მეგაბაიტია */
    public const MAX_BYTES = 12 * 1024 * 1024;

    /** ამაზე მცირე პასუხი ყდა არ არის — CDN ხანდახან შეცდომის პატარა სურათს აბრუნებს 200-ით */
    public const MIN_BYTES = 1000;

    /**
     * წყარო → მისი CDN-ის დომენები (თვითონ დომენი და ქვედომენები).
     *
     * @var array<string, list<string>>
     */
    public const HOSTS = [
        'rawg' => ['rawg.io'],
        'igdb' => ['igdb.com'],
        'bgg' => ['geekdo-images.com', 'geekdo-static.com', 'boardgamegeek.com'],
    ];

    private const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

    public function __construct(private readonly SafeHttp $http) {}

    /** მისამართი ამ წყაროს CDN-ზეა? */
    public static function trusted(string $source, string $url): bool
    {
        $parts = parse_url($url);

        if (! is_array($parts) || strtolower((string) ($parts['scheme'] ?? '')) !== 'https') {
            return false;
        }

        $host = strtolower((string) ($parts['host'] ?? ''));

        foreach (self::HOSTS[$source] ?? [] as $domain) {
            if ($host === $domain || str_ends_with($host, '.'.$domain)) {
                return true;
            }
        }

        return false;
    }

    /** სურათის ბაიტები, ან `null` (მიზეზი — `sources.log`-ში) */
    public function fetch(string $source, string $url): ?string
    {
        if (! self::trusted($source, $url)) {
            return SourceLog::failed($source, 'cover host not allowed', ['url' => $url]);
        }

        $res = $this->http->fetch($url, self::MAX_BYTES, ['Accept' => 'image/*'], timeout: 20);

        if ($res === null) {
            return SourceLog::failed($source, 'cover not fetched', ['url' => $url]);
        }

        $body = $res['body'];

        if ($res['truncated'] || strlen($body) <= self::MIN_BYTES) {
            return SourceLog::failed($source, $res['truncated'] ? 'cover too large' : 'cover too small', [
                'url' => $url,
                'bytes' => strlen($body),
            ]);
        }

        $mime = (string) (new \finfo(FILEINFO_MIME_TYPE))->buffer($body);

        if (! in_array($mime, self::MIMES, true)) {
            return SourceLog::failed($source, 'cover is not an image', ['url' => $url, 'mime' => $mime]);
        }

        return $body;
    }
}
