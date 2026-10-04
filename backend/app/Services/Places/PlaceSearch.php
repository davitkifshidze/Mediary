<?php

namespace App\Services\Places;

use App\Services\Serp\SerpApiClient;
use App\Services\Serp\SerpQuotaExceeded;
use App\Services\Web\SerperPlaces;
use App\Support\GoogleMapsLink;
use App\Support\SafeHttp;

/**
 * **ადგილის ძებნა — ყველა წყარო ერთ კარში** (Tasks §57).
 *
 * შენი სიტყვები: „რომ დასერჩავ „პიქტოგრამა", რომელიც არის სახინკლე — და Google
 * Maps-ში რომ ჩაწერ, ამას აგდებს ვარიანტებს — მსგავსად მინდა ამომიგდოს და მერე
 * წამოიღოს ინფო". აქამდე მხოლოდ Nominatim (OSM) იყო, OSM-ში კი მცირე ბიზნესი
 * იშვიათია.
 *
 * **წყაროები რიგით — პირველი, რომელიც გაქვს** (§57.2): Google Places API (New) →
 * SerpApi (`google_maps`) → Serper (`/places`) → Nominatim (უფასო). წყარო, რომელიც
 * ვერ პასუხობს (ან კვოტა ამოეწურა), შემდეგს უთმობს ადგილს; გასაღებიანმა წყარომ
 * თუ ვერაფერი იპოვა — ბოლოს მაინც Nominatim სცდის (უფასოა).
 *
 * ⚠️ **წერისას შემოთავაზება (`suggest`) მხოლოდ Google-ით** — ავტოშევსება მისი
 * ცნობილი, იაფი გზაა (სესიით). SerpApi/Serper თითო ძებნაზე კრედიტს ხარჯავს
 * (თითო ასოზე — ბიუჯეტის ფლანგვა იქნებოდა), Nominatim-ის პოლიტიკა კი
 * autocomplete-ს ცხადად კრძალავს. გასაღების გარეშე — ცხადი ძებნა (Enter).
 *
 * ერთი ფორმის კანდიდატი ყველა წყაროდან: სახელი, მისამართი, ქალაქი, ქვეყანა,
 * კოორდინატები, კატეგორია, წყაროს რეიტინგი (არა შენი), ტელეფონი, ვებგვერდი,
 * სამუშაო საათები, ფოტო(ები). `details()` არჩეულს ავსებს — Google-ის ფოტოები,
 * ქალაქი/ქვეყანა კოორდინატიდან (Nominatim-ის უკუ-გეოკოდირება), სადაც წყარომ ისინი
 * ცალკე არ თქვა.
 */
class PlaceSearch
{
    public const SOURCES = ['google', 'serpapi', 'serper', 'nominatim'];

    /** ბმულის წერტილიდან რა მანძილზე ჩაითვლება კანდიდატი „იგივე ადგილად" (მ) */
    private const LINK_MATCH_METERS = 400;

    private const DAYS = [
        'monday' => 'ორშაბათი', 'tuesday' => 'სამშაბათი', 'wednesday' => 'ოთხშაბათი', 'thursday' => 'ხუთშაბათი',
        'friday' => 'პარასკევი', 'saturday' => 'შაბათი', 'sunday' => 'კვირა',
    ];

    /** ყველა წყარო ჩავარდა — „არ პასუხობს" და არა „ვერაფერი ვიპოვე" */
    private bool $blocked = false;

    public function __construct(
        private readonly GooglePlacesClient $google,
        private readonly SerpApiClient $serpapi,
        private readonly SerperPlaces $serper,
        private readonly NominatimClient $nominatim,
        private readonly SafeHttp $http,
    ) {}

    public function blocked(): bool
    {
        return $this->blocked;
    }

    /** წერისას შემოთავაზება შესაძლებელია? (Google-ის გასაღები) */
    public function live(): bool
    {
        return $this->google->configured();
    }

    /**
     * წერისას შემოთავაზება — მხოლოდ Google (იხ. ზემოთ). `null` = ამ ანგარიშზე
     * შეუძლებელია (გასაღები არ არის) — SPA ცხად ძებნაზე გადადის.
     *
     * @return list<array<string, mixed>>|null
     */
    public function suggest(string $query, ?string $session = null): ?array
    {
        $this->blocked = false;
        if (! $this->live()) {
            return null;
        }

        $rows = $this->google->autocomplete($query, $session);
        if ($rows === null) {
            $this->blocked = true;

            return [];
        }

        return array_map(fn (array $row) => [
            ...$this->blank('google', $row['place_id']),
            'name' => $row['name'],
            'address' => $row['address'],
        ], $rows);
    }

    /**
     * ცხადი ძებნა — წყაროების ჯაჭვით.
     *
     * @return array{source: ?string, results: list<array<string, mixed>>}
     */
    public function search(string $query, ?string $city = null): array
    {
        $this->blocked = false;
        $query = trim($query);
        // §57.2 — ფორმის ქალაქი მიკერძოებაა („პიქტოგრამა, თბილისი")
        $full = $city && ! str_contains(mb_strtolower($query), mb_strtolower($city)) ? "{$query}, {$city}" : $query;
        $failures = 0;

        foreach ($this->keyed() as $source) {
            $rows = $this->fetch($source, $full);
            if ($rows === null) {
                $failures++;

                continue;
            }
            if ($rows !== []) {
                return ['source' => $source, 'results' => $rows];
            }
            // გასაღებიანმა წყარომ ვერაფერი იპოვა — Nominatim უფასოა, ბოლოს ისიც სცდის
            break;
        }

        $rows = array_map(fn (array $row) => $this->fromNominatim($row), $this->nominatim->search($full));
        if ($this->nominatim->blocked()) {
            $this->blocked = true;
        }

        return ['source' => 'nominatim', 'results' => $rows];
    }

    /**
     * არჩეული კანდიდატი → ფორმის სრული მონახაზი. `null` — ვერ მოიძებნა.
     *
     * @return array<string, mixed>|null
     */
    public function details(string $source, string $id, string $query = '', ?string $session = null): ?array
    {
        $this->blocked = false;

        $draft = match ($source) {
            'google' => $this->googleDetails($id, $session),
            'serpapi', 'serper' => $this->findIn($this->fetch($source, $query) ?? [], $id),
            default => $this->nominatimDetails($id, $query),
        };

        return $draft ? $this->complete($draft) : null;
    }

    /**
     * **§57.3 — Google Maps-ის ბმული → მონახაზი.** მოკლე ბმული `SafeHttp`-ით
     * იშლება; სახელით ძებნიდან ბმულის წერტილთან ყველაზე ახლოს მდგომი ადგილი
     * აირჩევა; ვერ მოიძებნა ან გასაღები არ გაქვს — სახელი, კოორდინატები და
     * Nominatim-ის მისამართი (გასაღების გარეშეც).
     *
     * @return array<string, mixed>|null `null` — ბმულიდან ვერაფერი იკითხება
     */
    public function fromLink(string $url): ?array
    {
        $this->blocked = false;
        $url = trim($url);

        if (GoogleMapsLink::isShort($url)) {
            $final = $this->http->fetch($url, 256 * 1024)['url'] ?? null;
            $url = is_string($final) ? GoogleMapsLink::unwrap($final) : '';
        }

        $link = $url !== '' ? GoogleMapsLink::parse($url) : null;
        if ($link === null) {
            return null;
        }

        if ($link['name'] !== null) {
            $found = $this->search($link['name']);
            $pick = $this->nearest($found['results'], $link['lat'], $link['lng']);

            if ($pick !== null) {
                $draft = $this->details($pick['source'], $pick['source_id'], $link['name']) ?? $pick;

                return [...$draft, 'maps_url' => $draft['maps_url'] ?? $url];
            }
        }

        if ($link['lat'] === null || $link['lng'] === null) {
            return null;
        }

        $here = $this->nominatim->reverse($link['lat'], $link['lng']);

        return $this->complete([
            ...$this->blank('link', ''),
            'name' => $link['name'] ?? ($here['name'] ?? null),
            'address' => $here['address'] ?? null,
            'city' => $here['city'] ?? null,
            'country' => $here['country'] ?? null,
            'lat' => $link['lat'],
            'lng' => $link['lng'],
            'maps_url' => $url,
        ]);
    }

    /** §57.4 — უკუ-გეოკოდირება (პინის გადათრევა) */
    public function reverse(float $lat, float $lng): ?array
    {
        $here = $this->nominatim->reverse($lat, $lng);
        $this->blocked = $this->nominatim->blocked();

        return $here ? ['address' => $here['address'], 'city' => $here['city'], 'country' => $here['country']] : null;
    }

    /* ---------- წყაროები ---------- */

    /** @return list<string> გასაღებიანი წყაროები რიგით */
    private function keyed(): array
    {
        return array_values(array_filter([
            $this->google->configured() ? 'google' : null,
            $this->serpapi->configured() ? 'serpapi' : null,
            $this->serper->configured() ? 'serper' : null,
        ]));
    }

    /** @return list<array<string, mixed>>|null `null` — წყარო ვერ პასუხობს */
    private function fetch(string $source, string $query): ?array
    {
        if (trim($query) === '') {
            return [];
        }

        try {
            $rows = match ($source) {
                'google' => $this->google->search($query),
                'serpapi' => $this->serpapi->maps($query),
                'serper' => $this->serper->search($query),
                default => null,
            };
        } catch (SerpQuotaExceeded) {
            // ⚠️ კვოტა ამოიწურა — ეს „არ პასუხობს"-ია ამ ძებნისთვის, შემდეგი წყარო სცდის
            return null;
        }

        if ($rows === null) {
            return null;
        }

        $map = match ($source) {
            'google' => fn (array $r) => $this->fromGoogle($r),
            'serpapi' => fn (array $r) => $this->fromSerpApi($r),
            default => fn (array $r) => $this->fromSerper($r),
        };

        return array_values(array_filter(array_map($map, $rows)));
    }

    private function googleDetails(string $id, ?string $session): ?array
    {
        $place = $this->google->details($id, $session);
        if ($place === null) {
            $this->blocked = ! $this->google->configured() ? false : true;

            return null;
        }

        $draft = $this->fromGoogle($place);
        if ($draft === null) {
            return null;
        }

        $photos = $this->google->photoUris((array) ($place['photos'] ?? []));

        return [...$draft, 'photo' => $photos[0] ?? null, 'photos' => $photos];
    }

    private function nominatimDetails(string $id, string $query): ?array
    {
        [$type, $osmId] = array_pad(explode(':', $id, 2), 2, '');
        $row = $this->nominatim->find($type, $osmId, $query);

        return $row ? $this->fromNominatim($row) : null;
    }

    /** @param list<array<string, mixed>> $rows */
    private function findIn(array $rows, string $id): ?array
    {
        foreach ($rows as $row) {
            if ((string) $row['source_id'] === $id) {
                return $row;
            }
        }

        return null;
    }

    /**
     * ქალაქი/ქვეყანა, თუ წყარომ ცალკე არ თქვა — Nominatim-ის უკუ-გეოკოდირებით
     * (უფასო, ერთი მოთხოვნა არჩევაზე).
     */
    private function complete(array $draft): array
    {
        if (($draft['city'] === null || $draft['country'] === null) && $draft['lat'] !== null && $draft['lng'] !== null) {
            $here = $this->nominatim->reverse((float) $draft['lat'], (float) $draft['lng']);
            $draft['city'] ??= $here['city'] ?? null;
            $draft['country'] ??= $here['country'] ?? null;
            $draft['address'] ??= $here['address'] ?? null;
        }

        return $draft;
    }

    /** @param list<array<string, mixed>> $rows */
    private function nearest(array $rows, ?float $lat, ?float $lng): ?array
    {
        if ($rows === []) {
            return null;
        }
        if ($lat === null || $lng === null) {
            return $rows[0];
        }

        $best = null;
        $bestDistance = INF;
        foreach ($rows as $row) {
            if ($row['lat'] === null || $row['lng'] === null) {
                continue;
            }
            $d = self::meters($lat, $lng, (float) $row['lat'], (float) $row['lng']);
            if ($d < $bestDistance) {
                [$best, $bestDistance] = [$row, $d];
            }
        }

        return $bestDistance <= self::LINK_MATCH_METERS ? $best : null;
    }

    private static function meters(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $r = 6_371_000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return 2 * $r * asin(min(1, sqrt($a)));
    }

    /* ---------- ერთი ფორმა ყველა წყაროდან ---------- */

    /** @return array<string, mixed> */
    private function blank(string $source, string $id): array
    {
        return [
            'source' => $source,
            'source_id' => $id,
            'osm_id' => null,
            'osm_type' => null,
            'name' => null,
            'address' => null,
            'city' => null,
            'country' => null,
            'lat' => null,
            'lng' => null,
            'kind' => null,
            'rating' => null,
            'rating_count' => null,
            'phone' => null,
            'website' => null,
            'hours' => [],
            'photo' => null,
            'photos' => [],
            'maps_url' => null,
        ];
    }

    private function fromGoogle(array $p): ?array
    {
        $id = $p['id'] ?? null;
        $name = $p['displayName']['text'] ?? null;
        if (! is_string($id) || ! is_string($name)) {
            return null;
        }

        $component = function (string $type) use ($p): ?string {
            foreach ((array) ($p['addressComponents'] ?? []) as $c) {
                if (in_array($type, (array) ($c['types'] ?? []), true)) {
                    return $c['longText'] ?? $c['shortText'] ?? null;
                }
            }

            return null;
        };

        return [
            ...$this->blank('google', $id),
            'name' => $name,
            'address' => $this->text($p['formattedAddress'] ?? null),
            'city' => $component('locality') ?? $component('administrative_area_level_1'),
            'country' => $component('country'),
            'lat' => $this->num($p['location']['latitude'] ?? null),
            'lng' => $this->num($p['location']['longitude'] ?? null),
            'kind' => $this->text($p['primaryTypeDisplayName']['text'] ?? null),
            'rating' => $this->num($p['rating'] ?? null),
            'rating_count' => is_numeric($p['userRatingCount'] ?? null) ? (int) $p['userRatingCount'] : null,
            'phone' => $this->text($p['nationalPhoneNumber'] ?? $p['internationalPhoneNumber'] ?? null),
            'website' => $this->text($p['websiteUri'] ?? null),
            'hours' => array_values(array_filter((array) ($p['regularOpeningHours']['weekdayDescriptions'] ?? []), 'is_string')),
            'maps_url' => $this->text($p['googleMapsUri'] ?? null),
        ];
    }

    private function fromSerpApi(array $r): ?array
    {
        $name = $this->text($r['title'] ?? null);
        $id = $r['place_id'] ?? $r['data_id'] ?? $r['data_cid'] ?? null;
        if ($name === null || ! is_scalar($id)) {
            return null;
        }

        $hours = [];
        foreach ((array) ($r['operating_hours'] ?? []) as $day => $value) {
            if (is_string($value)) {
                $hours[] = (self::DAYS[strtolower((string) $day)] ?? $day).': '.$value;
            }
        }
        $photo = $this->upscale($this->text($r['thumbnail'] ?? null));

        return [
            ...$this->blank('serpapi', (string) $id),
            'name' => $name,
            'address' => $this->text($r['address'] ?? null),
            'lat' => $this->num($r['gps_coordinates']['latitude'] ?? null),
            'lng' => $this->num($r['gps_coordinates']['longitude'] ?? null),
            'kind' => $this->text($r['type'] ?? null),
            'rating' => $this->num($r['rating'] ?? null),
            'rating_count' => is_numeric($r['reviews'] ?? null) ? (int) $r['reviews'] : null,
            'phone' => $this->text($r['phone'] ?? null),
            'website' => $this->text($r['website'] ?? null),
            'hours' => $hours,
            'photo' => $photo,
            'photos' => $photo ? [$photo] : [],
        ];
    }

    private function fromSerper(array $r): ?array
    {
        $name = $this->text($r['title'] ?? null);
        $id = $r['cid'] ?? $r['placeId'] ?? null;
        if ($name === null || ! is_scalar($id)) {
            return null;
        }

        $photo = $this->upscale($this->text($r['thumbnailUrl'] ?? null));

        return [
            ...$this->blank('serper', (string) $id),
            'name' => $name,
            'address' => $this->text($r['address'] ?? null),
            'lat' => $this->num($r['latitude'] ?? null),
            'lng' => $this->num($r['longitude'] ?? null),
            'kind' => $this->text($r['category'] ?? null),
            'rating' => $this->num($r['rating'] ?? null),
            'rating_count' => is_numeric($r['ratingCount'] ?? null) ? (int) $r['ratingCount'] : null,
            'phone' => $this->text($r['phoneNumber'] ?? null),
            'website' => $this->text($r['website'] ?? null),
            'photo' => $photo,
            'photos' => $photo ? [$photo] : [],
        ];
    }

    private function fromNominatim(array $row): array
    {
        return [
            ...$this->blank('nominatim', $row['osm_type'].':'.$row['osm_id']),
            ...array_intersect_key($row, array_flip(['osm_id', 'osm_type', 'name', 'address', 'city', 'country', 'lat', 'lng', 'kind'])),
        ];
    }

    /**
     * Google-ის ესკიზი პატარაა (`=w80-h106-k-no`) — იგივე ფაილი დიდი ზომით
     * (`googleusercontent.com`-ის ცნობილი ზომის სუფიქსი); სხვა მისამართი უცვლელია.
     */
    private function upscale(?string $url): ?string
    {
        if ($url === null || ! str_contains((string) parse_url($url, PHP_URL_HOST), 'googleusercontent.com')) {
            return $url;
        }

        return preg_replace('/=(?:w\d+-h\d+|s\d+)[^\/=]*$/', '=w1600-h1200-k-no', $url) ?? $url;
    }

    private function text(mixed $value): ?string
    {
        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }

    private function num(mixed $value): ?float
    {
        return is_numeric($value) ? (float) $value : null;
    }
}
