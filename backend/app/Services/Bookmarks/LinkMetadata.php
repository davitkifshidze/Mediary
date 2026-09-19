<?php

namespace App\Services\Bookmarks;

use App\Support\SafeHttp;

/**
 * გვერდის მეტამონაცემი ბუკმარკის ფორმისთვის (Tasks §18 — ბუკმარკები).
 *
 * ბმულებზე გამამდიდრებელი API არ არსებობს (TMDB/RAWG/BGG-ის ანალოგი), ე.ი.
 * ერთადერთი წყარო თვითონ გვერდია: `<title>`, Open Graph და favicon.
 *
 * ⚠️ **HTML არასდროს ინახება** — იგივე წესი, რაც ვიდეოს embed-ზე (`VideoUrl`).
 * აქედან მხოლოდ **ტექსტური ველები** გამოდის; მარკაპი პასუხთან ერთად ქრება.
 *
 * ⚠️ **პასუხის ზომა შემოსაზღვრულია** (`MAX_BYTES`): `<head>` პირველ ასეულ
 * კილობაიტშია და მთელი გვერდის ჩამოტვირთვას აზრი არ აქვს — ერთი უზარმაზარი
 * გვერდი `php artisan serve`-ს (ერთი რექვესთი ერთდროულად) დაბლოკავდა.
 *
 * ⚠️ **ეს ჭერი 2026-09-14-მდე ტყუილი იყო** (აუდიტი §A3): `$res->body()` მთელ
 * პასუხს **უკვე** ჩამოტვირთავდა და `substr()` მხოლოდ ამის შემდეგ ჭრიდა.
 * ნამდვილ ჭერს ახლა `SafeHttp` აკეთებს — ნაკადს ლიმიტამდე კითხულობს და ჩერდება.
 *
 * ⚠️ **მისამართიც იქვე მოწმდება** (§A2): მომხმარებელს შეეძლო `http://127.0.0.1:3306`
 * ან cloud-ის `169.254.169.254` მიეთითებინა და სერვერი შიდა ქსელის სკანერად
 * ექცია. redirect-ებს `SafeHttp` ხელით ყვება, ე.ი. **ყოველი** ნახტომი მოწმდება.
 *
 * ⚠️ **ჩავარდნა ნორმალური შედეგია.** გვერდი შეიძლება 403-ს აბრუნებდეს ან
 * საერთოდ არ იხსნებოდეს; მაშინ ცარიელი ველები ბრუნდება და user ხელით ავსებს —
 * ეს არაა შეცდომა, ე.ი. endpoint 200-ს აბრუნებს და არა 5xx-ს.
 */
class LinkMetadata
{
    /** რამდენი ბაიტი წავიკითხოთ — `<head>` ამაზე ბევრად ადრე მთავრდება */
    private const MAX_BYTES = 200_000;

    public function __construct(private readonly SafeHttp $http) {}

    /**
     * @return array{title: ?string, description: ?string, image_url: ?string,
     *               favicon_url: ?string, site_name: ?string, domain: ?string}
     */
    public function fetch(string $url): array
    {
        $empty = [
            'title' => null,
            'description' => null,
            'image_url' => null,
            'favicon_url' => null,
            'site_name' => null,
            'domain' => $this->domain($url),
        ];

        $res = $this->http->fetch(
            $url,
            self::MAX_BYTES,
            // ბოტად აღქმული რექვესთი ხშირად 403-ს იღებს; ბრაუზერული UA ამას ხსნის
            [
                'User-Agent' => 'Mozilla/5.0 (compatible; Mediary/1.0; +personal library)',
                'Accept' => 'text/html,application/xhtml+xml',
            ],
            timeout: 12,
        );

        if ($res === null) {
            return $empty;
        }

        $html = $res['body'];
        // ⚠️ ფარდობითი ბმულები **საბოლოო** მისამართს ეყრდნობა და არა საწყისს:
        // redirect-ის შემდეგ `og:image="/x.png"` სხვა ჰოსტზე იქნებოდა
        $url = $res['url'];

        return [
            'title' => $this->firstOf($html, [
                fn () => $this->meta($html, 'og:title'),
                fn () => $this->meta($html, 'twitter:title'),
                fn () => $this->title($html),
            ]),
            'description' => $this->firstOf($html, [
                fn () => $this->meta($html, 'og:description'),
                fn () => $this->meta($html, 'twitter:description'),
                fn () => $this->meta($html, 'description'),
            ]),
            'image_url' => $this->absolute($url, $this->firstOf($html, [
                fn () => $this->meta($html, 'og:image'),
                fn () => $this->meta($html, 'twitter:image'),
            ])),
            'favicon_url' => $this->absolute($url, $this->favicon($html)) ?: $this->defaultFavicon($url),
            'site_name' => $this->meta($html, 'og:site_name'),
            'domain' => $empty['domain'],
        ];
    }

    /* ---------- დამხმარეები ---------- */

    /** @param  list<callable(): ?string>  $sources */
    private function firstOf(string $html, array $sources): ?string
    {
        foreach ($sources as $source) {
            if ($value = $source()) {
                return $value;
            }
        }

        return null;
    }

    /**
     * `<meta property="og:title" content="…">` — ატრიბუტების **ორივე რიგში**
     * (`property` ჯერ, მერე `content` და პირიქით): მინიფიცირებული გვერდები
     * ხშირად შებრუნებულად წერენ და ერთი regex მათ ვერ დაიჭერდა.
     */
    private function meta(string $html, string $name): ?string
    {
        $escaped = preg_quote($name, '/');

        $patterns = [
            '/<meta[^>]+(?:property|name)\s*=\s*["\']'.$escaped.'["\'][^>]*content\s*=\s*["\']([^"\']*)["\']/i',
            '/<meta[^>]+content\s*=\s*["\']([^"\']*)["\'][^>]*(?:property|name)\s*=\s*["\']'.$escaped.'["\']/i',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $html, $m)) {
                return $this->clean($m[1]);
            }
        }

        return null;
    }

    private function title(string $html): ?string
    {
        return preg_match('/<title[^>]*>(.*?)<\/title>/is', $html, $m) ? $this->clean($m[1]) : null;
    }

    private function favicon(string $html): ?string
    {
        // `apple-touch-icon` ჩვეულებრივ დიდი და გარკვეულია, ამიტომ ჯერ ის
        foreach (['apple-touch-icon', 'icon', 'shortcut icon'] as $rel) {
            $pattern = '/<link[^>]+rel\s*=\s*["\'][^"\']*'.preg_quote($rel, '/').'[^"\']*["\'][^>]*href\s*=\s*["\']([^"\']+)["\']/i';

            if (preg_match($pattern, $html, $m)) {
                return $this->clean($m[1]);
            }
        }

        return null;
    }

    /** `/favicon.ico` — სტანდარტი, როცა `<link>` საერთოდ არ წერია */
    private function defaultFavicon(string $url): ?string
    {
        $parts = parse_url($url);

        return isset($parts['scheme'], $parts['host'])
            ? "{$parts['scheme']}://".$this->authority($parts).'/favicon.ico'
            : null;
    }

    /**
     * შედარებითი გზა → აბსოლუტური (og:image ხშირად `/img/x.png`-ია).
     *
     * ⚠️ **დახრილის გარეშე დაწყებული გზა გვერდის საქაღალდეს ეკუთვნის და არა
     * ჰოსტის ფესვს** (RFC 3986 §5.2 — Tasks BUG-25). `img/x.png` გვერდზე
     * `https://site.ge/blog/post/` **`https://site.ge/blog/post/img/x.png`-ია**;
     * ძველი `$root.'/'.ltrim(...)` მას ფესვთან ითვლიდა და ბუკმარკის სურათი
     * (და favicon-იც, იმავე მეთოდზე რომ გადის) გატეხილი გამოდიოდა.
     *
     * ⚠️ **პორტიც მოჰყვება** — `parse_url` მას ცალკე ველად აბრუნებს, ე.ი. მისი
     * დავიწყება `http://host:8080/...`-ს ჩუმად 80-ზე გადაიყვანდა.
     */
    private function absolute(string $base, ?string $path): ?string
    {
        $path = trim((string) $path);

        if ($path === '') {
            return null;
        }
        if (preg_match('#^https?://#i', $path)) {
            return $path;
        }

        $parts = parse_url($base);

        if (! isset($parts['scheme'], $parts['host'])) {
            return null;
        }

        // `//cdn.example.com/x.png` — პროტოკოლის გარეშე
        if (str_starts_with($path, '//')) {
            return $parts['scheme'].':'.$path;
        }

        $root = "{$parts['scheme']}://".$this->authority($parts);

        // `/img/x.png` — ჰოსტის ფესვიდან
        if (str_starts_with($path, '/')) {
            return $root.$this->removeDotSegments($path);
        }

        return $root.$this->removeDotSegments($this->directory($parts['path'] ?? '/').$path);
    }

    /** `host` + `:port`, როცა პორტი ცხადად წერია */
    private function authority(array $parts): string
    {
        return $parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');
    }

    /** ბაზის გზის საქაღალდე: `/blog/post` → `/blog/`, `/blog/post/` → `/blog/post/` */
    private function directory(string $path): string
    {
        $cut = strrpos($path, '/');

        return $cut === false ? '/' : substr($path, 0, $cut + 1);
    }

    /** `.` და `..` სეგმენტების მოხსნა (RFC 3986 §5.2.4) */
    private function removeDotSegments(string $path): string
    {
        $segments = explode('/', $path);
        $last = array_key_last($segments);
        $out = [];

        foreach ($segments as $i => $segment) {
            if ($segment === '.' || $segment === '..') {
                // ⚠️ პირველი (ცარიელი) სეგმენტი გზას აბსოლუტურად ტოვებს — არ ვხსნით
                if ($segment === '..' && count($out) > 1) {
                    array_pop($out);
                }
                // ბოლო სეგმენტი იყო, ე.ი. გზა საქაღალდით სრულდება
                if ($i === $last) {
                    $out[] = '';
                }

                continue;
            }

            $out[] = $segment;
        }

        $result = implode('/', $out);

        return str_starts_with($result, '/') ? $result : '/'.$result;
    }

    private function domain(string $url): ?string
    {
        $host = parse_url($url, PHP_URL_HOST) ?: null;

        return $host ? preg_replace('/^www\./i', '', strtolower($host)) : null;
    }

    /** HTML entity-ები, ზედმეტი სივრცე და ჭერი — ბაზის სვეტებს რომ მოერგოს */
    private function clean(string $value): ?string
    {
        $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $value = trim(preg_replace('/\s+/u', ' ', $value) ?? '');

        return $value === '' ? null : mb_substr($value, 0, 500);
    }
}
