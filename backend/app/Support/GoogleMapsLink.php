<?php

namespace App\Support;

/**
 * **Google Maps-ის ბმულის ამოკითხვა** (Tasks §57.3) — ქსელის გარეშე.
 *
 * შენი სიტყვები: „უშუალოდ რუკის ბმულის ჩაგდებითაც მინდა იყოს საშუალება, შეივსოს
 * ინფო". ბმულიდან ორი რამ იკითხება: **სახელი** (`/place/<სახელი>/` ან
 * `/search/<შეკითხვა>/`, `?q=`) და **კოორდინატები**:
 * - `!3d41.71!4d44.82` — თვითონ ადგილის წერტილი (ყველაზე ზუსტი);
 * - `@41.71,44.82,17z` — რუკის ხედის ცენტრი (მიახლოებითი);
 * - `?q=41.71,44.82` / `?ll=41.71,44.82` — ცხადი წერტილი.
 *
 * ⚠️ მოკლე ბმული (`maps.app.goo.gl/…`, `goo.gl/maps/…`) აქ არ იხსნება —
 * `isShort()` ამბობს, რომ ჯერ `SafeHttp`-ით უნდა გაიშალოს (`PlaceSearch`);
 * EU-ს თანხმობის გვერდიდან (`consent.google.com?continue=…`) ნამდვილ ბმულს
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

    /** თანხმობის გვერდი → ნამდვილი ბმული (`continue=`) */
    public static function unwrap(string $url): string
    {
        if (self::host($url) !== 'consent.google.com') {
            return $url;
        }

        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        $next = $query['continue'] ?? null;

        return is_string($next) && $next !== '' ? $next : $url;
    }

    /**
     * @return array{name: ?string, lat: ?float, lng: ?float}|null `null` — Google Maps-ის ბმული არ არის ან არაფერი იკითხება
     */
    public static function parse(string $url): ?array
    {
        $url = trim($url);
        if (! self::looksLike($url) || self::isShort($url)) {
            return null;
        }

        $path = rawurldecode((string) parse_url($url, PHP_URL_PATH));
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        $name = null;
        if (preg_match('~/maps/(?:place|search)/([^/@]+)~u', $path, $m)) {
            $name = self::clean($m[1]);
        }

        [$lat, $lng] = [null, null];
        // ⚠️ `!3d!4d` ადგილის წერტილია; `@` — ხედის ცენტრი. ჯერ ზუსტი.
        if (preg_match('~!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)~', $url, $m)) {
            [$lat, $lng] = [(float) $m[1], (float) $m[2]];
        } elseif (preg_match('~@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)~', $path, $m)) {
            [$lat, $lng] = [(float) $m[1], (float) $m[2]];
        }

        foreach (['q', 'query', 'll', 'center', 'destination'] as $key) {
            $value = $query[$key] ?? null;
            if (! is_string($value) || trim($value) === '') {
                continue;
            }
            if (preg_match('/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/', $value, $m)) {
                $lat ??= (float) $m[1];
                $lng ??= (float) $m[2];
            } elseif ($key === 'q' || $key === 'query') {
                $name ??= self::clean($value);
            }
        }

        if ($lat !== null && (abs($lat) > 90 || abs((float) $lng) > 180)) {
            [$lat, $lng] = [null, null];
        }

        return $name === null && $lat === null ? null : ['name' => $name, 'lat' => $lat, 'lng' => $lng];
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
