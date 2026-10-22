<?php

namespace App\Support;

/**
 * **Google Maps-ის ბმულის ამოკითხვა** — ქსელის გარეშე.
 *
 * შენი სიტყვები: „უშუალოდ რუკის ბმულის ჩაგდებითაც მინდა იყოს საშუალება, შეივსოს
 * ინფო". ბმულიდან იკითხება:
 * - **სახელი** — `/place/<სახელი>/`, `/search/<შეკითხვა>/`, `?q=`, მარშრუტის
 *   (`/maps/dir/<საიდან>/<სად>/`, `?daddr=`, `?destination=`) დანიშნულება;
 * - **კოორდინატები**: `!3d41.71!4d44.82` — თვითონ ადგილის წერტილი (ყველაზე
 *   ზუსტი); მარშრუტზე ბოლო გაჩერების `!1d<lng>!2d<lat>`; `@41.71,44.82,17z` —
 *   რუკის ხედის ცენტრი (მიახლოებითი); `?q=41.71,44.82` / `?ll=…` — ცხადი წერტილი;
 * - **Google-ის საკუთარი ID-ები** — ზუსტი ობიექტი სახელით ძებნის გარეშე:
 *   `cid` (`?cid=` ან FTID-ის `!1s0x…:0x<cid>` მეორე ნახევარი, ათობითად) და
 *   `place_id` (`!19sChIJ…`, `?q=place_id:…`, `query_place_id=`).
 *
 * ⚠️ მოკლე ბმული (`maps.app.goo.gl/…`, `goo.gl/maps/…`) აქ არ იხსნება —
 * `isShort()` ამბობს, რომ ჯერ `SafeHttp`-ით უნდა გაიშალოს (`PlaceSearch`);
 * EU-ს თანხმობის გვერდიდან (`consent.google.com?continue=…`) და 429-ის
 * „sorry" გვერდიდან (`google.com/sorry/index?continue=…`) ნამდვილ ბმულს
 * `unwrap()` იღებს.
 */
final class GoogleMapsLink
{
    /** მოკლე ბმული — გადამისამართება სჭირდება */
    public static function isShort(string $url): bool
    {
        $host = self::host($url);
        $path = (string) parse_url(trim($url), PHP_URL_PATH);

        return $host === 'maps.app.goo.gl' || ($host === 'goo.gl' && str_starts_with($path, '/maps'));
    }

    /** Google Maps-ის ბმულია? (მოკლეც) */
    public static function looksLike(string $url): bool
    {
        if (self::isShort($url)) {
            return true;
        }

        $host = self::host($url);
        $path = (string) parse_url(trim($url), PHP_URL_PATH);

        return (bool) preg_match('/^(maps\.)?google\.[a-z.]{2,6}$/', $host)
            && ($host !== '' && (str_starts_with($host, 'maps.') || str_starts_with($path, '/maps')));
    }

    /**
     * თანხმობის / „sorry" (429) გვერდი → ნამდვილი ბმული (`continue=`).
     *
     * ⚠️ 429-ზეც ბმული არ იკარგება: Google ჯერ გადაამისამართებს და `continue`-ში
     * სრული რუკის ბმული წერია — მისი წაკითხვა ქსელს აღარ სჭირდება.
     */
    public static function unwrap(string $url): string
    {
        $host = self::host($url);
        $path = (string) parse_url($url, PHP_URL_PATH);
        $wrapped = $host === 'consent.google.com'
            || (preg_match('/^google\.[a-z.]{2,6}$/', $host) && str_starts_with($path, '/sorry'));

        if (! $wrapped) {
            return $url;
        }

        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        $next = $query['continue'] ?? null;

        return is_string($next) && $next !== '' ? $next : $url;
    }

    /**
     * `null` — Google Maps-ის ბმული არ არის ან არაფერი იკითხება.
     *
     * @return array{name: ?string, lat: ?float, lng: ?float, cid: ?string, place_id: ?string}|null
     */
    public static function parse(string $url): ?array
    {
        $url = trim($url);
        if (! self::looksLike($url) || self::isShort($url)) {
            return null;
        }

        $path = rawurldecode((string) parse_url($url, PHP_URL_PATH));
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        $route = (bool) preg_match('~/maps/dir/~', $path);

        $name = null;
        if (preg_match('~/maps/(?:place|search)/([^/@]+)~u', $path, $m)) {
            $name = self::clean($m[1]);
        } elseif ($route) {
            $name = self::destination($path);
        }

        [$lat, $lng] = [null, null];
        // ⚠️ `!3d!4d` ადგილის წერტილია; მარშრუტზე — ბოლო გაჩერება; `@` — ხედის ცენტრი. ჯერ ზუსტი.
        if (preg_match('~!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)~', $url, $m)) {
            [$lat, $lng] = [(float) $m[1], (float) $m[2]];
        } elseif ($route && preg_match_all('~!1d(-?\d{1,3}\.\d+)!2d(-?\d{1,2}\.\d+)~', $url, $all)) {
            // ⚠️ მარშრუტის `data`-ში რიგი შებრუნებულია: `!1d` გრძედია, `!2d` — განედი
            [$lat, $lng] = [(float) end($all[2]), (float) end($all[1])];
        } elseif (preg_match('~@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)~', $path, $m)) {
            [$lat, $lng] = [(float) $m[1], (float) $m[2]];
        }

        $placeId = null;
        foreach (['q', 'query', 'll', 'center', 'destination', 'daddr'] as $key) {
            $value = $query[$key] ?? null;
            if (! is_string($value) || trim($value) === '') {
                continue;
            }
            if (preg_match('/^\s*place_id:([A-Za-z0-9_-]{10,300})\s*$/', $value, $m)) {
                $placeId ??= $m[1];
            } elseif (preg_match('/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/', $value, $m)) {
                $lat ??= (float) $m[1];
                $lng ??= (float) $m[2];
            } elseif (in_array($key, ['q', 'query', 'destination', 'daddr'], true)) {
                $name ??= self::clean($value);
            }
        }

        foreach (['query_place_id', 'place_id', 'destination_place_id'] as $key) {
            if (is_string($query[$key] ?? null) && preg_match('/^[A-Za-z0-9_-]{10,300}$/', $query[$key])) {
                $placeId ??= $query[$key];
            }
        }
        // `!19sChIJ…` — Google-ის Place ID ბმულის `data`-ში
        if ($placeId === null && preg_match('~!19s(ChIJ[A-Za-z0-9_-]{10,300})~', $url, $m)) {
            $placeId = $m[1];
        }

        $cid = null;
        if (is_string($query['cid'] ?? null) && preg_match('/^\d{1,20}$/', $query['cid'])) {
            $cid = $query['cid'];
        } elseif (preg_match_all('~(?:!1s|[?&]ftid=)0x[0-9a-f]+(?::|%3A)0x([0-9a-f]{1,16})~i', $url, $all)) {
            // ⚠️ მარშრუტზე FTID-ები გაჩერებების რიგითაა — ბოლო დანიშნულებაა
            $cid = self::decimal((string) end($all[1]));
        }
        // `0x0:0x0` — ცარიელი ჩანაცვლება და არა ადგილი
        if ($cid === '0') {
            $cid = null;
        }

        if ($lat !== null && (abs($lat) > 90 || abs((float) $lng) > 180)) {
            [$lat, $lng] = [null, null];
        }

        if ($name === null && $lat === null && $cid === null && $placeId === null) {
            return null;
        }

        return ['name' => $name, 'lat' => $lat, 'lng' => $lng, 'cid' => $cid, 'place_id' => $placeId];
    }

    /** `/maps/dir/<საიდან>/<სად>/@…/data=…` → ბოლო გაჩერება (კოორდინატი სახელი არ არის) */
    private static function destination(string $path): ?string
    {
        $stops = array_values(array_filter(
            explode('/', (string) preg_replace('~^.*?/maps/dir/~', '', $path)),
            fn (string $part) => trim($part) !== '' && ! str_starts_with($part, '@') && ! str_starts_with($part, 'data='),
        ));
        $last = $stops === [] ? null : self::clean((string) end($stops));

        return $last !== null && ! preg_match('/^-?\d{1,2}\.\d+\s*,\s*-?\d{1,3}\.\d+$/', $last) ? $last : null;
    }

    /**
     * თექვსმეტობითი → ათობითი, სტრიქონად.
     *
     * ⚠️ CID 64-ბიტიანი **უნიშნო** რიცხვია — PHP-ის `int`-ში არ ეტევა და
     * `hexdec()` მას `float`-ად დაამრგვალებდა, ე.ი. სხვა ადგილს ვიკითხავდით.
     */
    private static function decimal(string $hex): string
    {
        $digits = [0];

        foreach (str_split(strtolower($hex)) as $char) {
            $carry = (int) hexdec($char);
            foreach ($digits as $i => $digit) {
                $value = $digit * 16 + $carry;
                $digits[$i] = $value % 10;
                $carry = intdiv($value, 10);
            }
            while ($carry > 0) {
                $digits[] = $carry % 10;
                $carry = intdiv($carry, 10);
            }
        }

        return ltrim(implode('', array_reverse($digits)), '0') ?: '0';
    }

    private static function clean(string $value): ?string
    {
        $value = trim(str_replace('+', ' ', $value));

        return $value === '' ? null : mb_substr($value, 0, 255);
    }

    private static function host(string $url): string
    {
        $host = strtolower((string) parse_url(trim($url), PHP_URL_HOST));

        return preg_replace('/^www\./', '', $host) ?: '';
    }
}
