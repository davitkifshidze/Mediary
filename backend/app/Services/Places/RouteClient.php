<?php

namespace App\Services\Places;

use App\Support\SourceLog;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * **OSRM-ის საჯარო სერვერი — მარშრუტები უფასოდ და გასაღების გარეშე**.
 *
 * ⚠️ **გასაღები არ სჭირდება** — სწორედ ამიტომ აირჩა OpenRouteService-ისა და
 * Google Directions-ის ნაცვლად: Nominatim-ის იგივე
 * მიზეზი, იგივე სერვერის შუამავლობა (`SourceLog`, ქეში, 503 კოდი).
 *
 * ⚠️ **საწყისი წერტილი ყოველთვის მომხმარებლის მიმდინარე მდებარეობაა** —
 * კლიენტი მას ბრაუზერის გეოლოკაციიდან იღებს და აქ მხოლოდ რიცხვებად მოდის;
 * სერვერი მას არსად ინახავს (ქეშის გასაღებიც მომრგვალებულია).
 *
 * ⚠️ **გზების რაოდენობა შენი არჩევანია** (`$count`, 1–`MAX_ROUTES`):
 * OSRM-ს `alternatives=N-1` ეგზავნება (მთავარი + N-1 ალტერნატივა; ადრე ხისტად
 * `true`), პასუხი N-ზე იჭრება; OSRM იმდენს აბრუნებს, რამდენსაც პოულობს —
 * ნაკლები ნორმალურია (კლიენტი „ნაპოვნია 2 გზა"-ს ამბობს). პირველი უმოკლესია,
 * კლიენტი ყველას ხატავს და არჩევანს მომხმარებელს უტოვებს.
 * **გეომეტრია polyline-ად** (precision 5): კომპაქტურია და იმავე ფორმით
 * ინახება `place_routes.geometry`-ში.
 *
 * ⚠️ **ქეში 10 წუთი და მხოლოდ წარმატება**: მარშრუტი „ცოცხალი" ფაქტია
 * (საგზაო ვითარება), მაგრამ პროფილების გადართვა წამებში ხდება და ყოველი
 * დაწკაპუნება საჯარო სერვერზე არ უნდა მიდიოდეს. ჩავარდნა არ ქეშირდება —
 * Nominatim-ის იგივე წესი. გასაღები 4 ათწილადითაა (~11 მ): მდებარეობის
 * რყევა ახალ მოთხოვნას არ უშვებს.
 *
 * ⚠️ `NoRoute` **პასუხია და არა ჩავარდნა** — OSRM მას 400-ით აბრუნებს, მაგრამ
 * სერვერი მუშაობს: კლიენტი „მარშრუტი ვერ მოიძებნა"-ს ხედავს და არა 503-ს.
 *
 * ⚠️ საჯარო სერვერზე `foot`/`bike` პროფილები მიახლოებითია (მათი ცნობილი
 * შეზღუდვა) — ინტერფეისი ამას `i`-ით ამბობს; ღრმა ბმული Google Maps-ზე/
 * OSM-ზე ყოველთვის რჩება.
 */
class RouteClient
{
    public const PROFILES = ['driving', 'foot', 'bike'];

    private const URL = 'https://router.project-osrm.org/route/v1/%s/%s;%s';

    private const AGENT = 'Mediary/1.0 (personal media library)';

    private const CACHE_MINUTES = 10;

    private const TIMEOUT = 20;

    /** მეტი გზა საჯარო სერვერზე იშვიათად მოიძებნება და რუკას აჭრელებს */
    public const MAX_ROUTES = 5;

    /** ბოლო გამოძახება ჩავარდა? — „სერვერი არ პასუხობს" ≠ „მარშრუტი არ არის" */
    private bool $blocked = false;

    public function blocked(): bool
    {
        return $this->blocked;
    }

    /**
     * მარშრუტები `from` → `to`; `null` = სერვერი არ პასუხობს, `[]` = მარშრუტი არ არსებობს.
     *
     * @return list<array{index: int, distance_m: int, duration_s: int, geometry: string, summary: ?string}>|null
     */
    public function routes(float $fromLat, float $fromLng, float $toLat, float $toLng, string $profile = 'driving', int $count = 3): ?array
    {
        $this->blocked = false;
        $profile = in_array($profile, self::PROFILES, true) ? $profile : 'driving';
        $count = max(1, min(self::MAX_ROUTES, $count));

        // ⚠️ N გასაღებშია: „1 გზა"-ს ქეში „3 გზის" კითხვას არ უნდა უპასუხოს
        $cacheKey = sprintf('osrm:%s:%d:%.4F,%.4F;%.4F,%.4F', $profile, $count, $fromLat, $fromLng, $toLat, $toLng);
        $cached = Cache::get($cacheKey);

        if (is_array($cached)) {
            return $cached;
        }

        $url = sprintf(self::URL, $profile, $this->point($fromLng, $fromLat), $this->point($toLng, $toLat));

        try {
            $res = SourceLog::request(self::TIMEOUT)
                ->withHeaders(['User-Agent' => self::AGENT])
                ->get($url, [
                    'alternatives' => $count > 1 ? (string) ($count - 1) : 'false',
                    'overview' => 'full',
                    'geometries' => 'polyline',
                    'steps' => 'false',
                ]);
        } catch (Throwable $e) {
            SourceLog::threw('osrm', $e, ['profile' => $profile]);
            $this->blocked = true;

            return null;
        }

        $body = $res->json();
        $code = is_array($body) ? ($body['code'] ?? null) : null;

        if (in_array($code, ['NoRoute', 'NoSegment', 'NoMatch'], true)) {
            Cache::put($cacheKey, [], now()->addMinutes(self::CACHE_MINUTES));

            return [];
        }

        if (! $res->successful() || $code !== 'Ok') {
            SourceLog::status('osrm', $res->status(), $res->body(), ['profile' => $profile]);
            $this->blocked = true;

            return null;
        }

        $routes = [];

        foreach (array_values(array_filter($body['routes'] ?? [], 'is_array')) as $index => $route) {
            if (! is_string($route['geometry'] ?? null) || $route['geometry'] === '') {
                continue;
            }

            $summary = $route['legs'][0]['summary'] ?? null;

            $routes[] = [
                'index' => $index,
                'distance_m' => (int) round((float) ($route['distance'] ?? 0)),
                'duration_s' => (int) round((float) ($route['duration'] ?? 0)),
                'geometry' => $route['geometry'],
                'summary' => is_string($summary) && $summary !== '' ? $summary : null,
            ];
        }

        $routes = array_slice($routes, 0, $count);

        // ⚠️ მხოლოდ წარმატება იქეშება
        Cache::put($cacheKey, $routes, now()->addMinutes(self::CACHE_MINUTES));

        return $routes;
    }

    /** ⚠️ OSRM-ს `lng,lat` რიგით უნდა (GeoJSON-ის წესი) — Leaflet-ის `lat,lng`-ის პირიქით */
    private function point(float $lng, float $lat): string
    {
        return sprintf('%.6F,%.6F', $lng, $lat);
    }
}
