<?php

namespace App\Services\Places;

use App\Services\Credentials\CredentialStore;
use App\Support\CredentialProviders;
use App\Support\SourceLog;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * **Google Places API (New)** — ადგილების ყველაზე სრული ბაზა.
 *
 * შენი მაგალითი: „პიქტოგრამა" (სახინკლე) — OSM-ში არ არის, Google Maps კი
 * წერისთანავე სთავაზობს. აქედან სამი გამოძახებაა:
 * - **`places:autocomplete`** — წერისას შემოთავაზება (მხოლოდ სახელი და
 *   მისამართის ხაზი; სესიის ტოკენით — შემოთავაზებები და მისი დეტალები Google-ის
 *   ერთ სესიად ითვლება);
 * - **`places:searchText`** — ცხადი ძებნა (ყველა ველი ერთ პასუხში);
 * - **`places/{id}`** — არჩეულის დეტალები + ფოტოების მისამართები.
 *
 * ⚠️ **გასაღები ჰედერშია** (`X-Goog-Api-Key`) და არასდროს მისამართში — ფოტოს
 * `media` ბმული გასაღებს მისამართში ითხოვს, ამიტომ `skipHttpRedirect=true`-ით
 * მოკლევადიან `photoUri`-ს ვიღებთ (გასაღების გარეშე), და მხოლოდ ის მიდის SPA-ში.
 * ⚠️ **`X-Goog-FieldMask` სავალდებულოა** — ის ფასსაც წყვეტს (SKU); ზედმეტი ველი
 * ძვირ SKU-ზე გადაიყვანდა.
 * ⚠️ ჩავარდნა — `null` (წყარო არ პასუხობს) და ცარიელი სია — `[]` (არაფერი
 * მოიძებნა) ორი სხვადასხვა ფაქტია; `PlaceSearch` პირველზე შემდეგ წყაროზე გადადის.
 */
class GooglePlacesClient
{
    private const BASE = 'https://places.googleapis.com/v1';

    private const FIELDS = 'id,displayName,formattedAddress,location,primaryTypeDisplayName,rating,userRatingCount,'
        .'nationalPhoneNumber,internationalPhoneNumber,websiteUri,regularOpeningHours.weekdayDescriptions,'
        .'addressComponents,googleMapsUri,photos';

    private const CACHE_HOURS = 24;

    /** რამდენი ფოტოს მისამართი — თითო ცალკე გამოძახებაა */
    public const MAX_PHOTOS = 6;

    public function configured(): bool
    {
        return (string) CredentialStore::value(CredentialProviders::GOOGLE_MAPS) !== '';
    }

    /**
     * წერისას შემოთავაზება — `null` = წყარო არ პასუხობს.
     *
     * @return list<array{place_id: string, name: string, address: ?string}>|null
     */
    public function autocomplete(string $input, ?string $session = null): ?array
    {
        $body = array_filter([
            'input' => $input,
            'languageCode' => 'ka',
            'regionCode' => 'ge',
            'sessionToken' => $session,
        ]);

        $data = $this->post('/places:autocomplete', $body, null);
        if ($data === null) {
            return null;
        }

        $out = [];
        foreach ((array) ($data['suggestions'] ?? []) as $row) {
            $p = $row['placePrediction'] ?? null;
            if (! is_array($p) || ! is_string($p['placeId'] ?? null)) {
                continue;
            }
            $out[] = [
                'place_id' => $p['placeId'],
                'name' => (string) ($p['structuredFormat']['mainText']['text'] ?? $p['text']['text'] ?? ''),
                'address' => $p['structuredFormat']['secondaryText']['text'] ?? null,
            ];
        }

        return $out;
    }

    /**
     * ცხადი ძებნა — სრული ველებით. `null` = წყარო არ პასუხობს.
     *
     * @return list<array<string, mixed>>|null
     */
    public function search(string $query): ?array
    {
        $key = 'gplaces:search:'.sha1($query);
        if (is_array($cached = Cache::get($key))) {
            return $cached;
        }

        $data = $this->post('/places:searchText', [
            'textQuery' => $query,
            'languageCode' => 'ka',
            'regionCode' => 'ge',
            'maxResultCount' => 8,
        ], self::prefixed('places.'));

        if ($data === null) {
            return null;
        }

        $places = array_values(array_filter((array) ($data['places'] ?? []), 'is_array'));
        Cache::put($key, $places, now()->addHours(self::CACHE_HOURS));

        return $places;
    }

    /** არჩეულის დეტალები; `null` = წყარო არ პასუხობს ან ასეთი არ არის */
    public function details(string $placeId, ?string $session = null): ?array
    {
        if (! preg_match('/^[A-Za-z0-9_-]{10,300}$/', $placeId)) {
            return null;
        }

        $key = 'gplaces:details:'.$placeId;
        if (is_array($cached = Cache::get($key))) {
            return $cached;
        }

        try {
            $res = SourceLog::request(15)
                ->acceptJson()
                ->withHeaders($this->headers(self::FIELDS))
                ->get(self::BASE.'/places/'.$placeId, array_filter([
                    'languageCode' => 'ka',
                    'regionCode' => 'ge',
                    'sessionToken' => $session,
                ]));
        } catch (Throwable $e) {
            return SourceLog::threw('google_places', $e, ['step' => 'details']);
        }

        if (! $res->successful()) {
            return SourceLog::status('google_places', $res->status(), $res->body(), ['step' => 'details']);
        }

        $place = $res->json();
        if (! is_array($place)) {
            return null;
        }

        Cache::put($key, $place, now()->addHours(self::CACHE_HOURS));

        return $place;
    }

    /**
     * ფოტოების მოკლევადიანი მისამართები (`photoUri` — გასაღების გარეშე).
     *
     * @param  list<array<string, mixed>>  $photos  `place.photos`
     * @return list<string>
     */
    public function photoUris(array $photos, int $max = self::MAX_PHOTOS): array
    {
        $uris = [];

        foreach (array_slice($photos, 0, $max) as $photo) {
            $name = $photo['name'] ?? null;
            if (! is_string($name) || ! preg_match('~^places/[^/]+/photos/[A-Za-z0-9_-]+$~', $name)) {
                continue;
            }

            try {
                $res = SourceLog::request(10)
                    ->acceptJson()
                    ->withHeaders(['X-Goog-Api-Key' => (string) CredentialStore::value(CredentialProviders::GOOGLE_MAPS)])
                    ->get(self::BASE.'/'.$name.'/media', ['maxWidthPx' => 1600, 'skipHttpRedirect' => 'true']);
            } catch (Throwable $e) {
                SourceLog::threw('google_places', $e, ['step' => 'photo']);

                continue;
            }

            $uri = $res->successful() ? $res->json('photoUri') : null;
            if (is_string($uri) && str_starts_with($uri, 'https://')) {
                $uris[] = $uri;
            }
        }

        return $uris;
    }

    /* ---------- შიგნეული ---------- */

    /** `id,displayName` → `places.id,places.displayName` (ძებნის პასუხი `places`-შია) */
    private static function prefixed(string $prefix): string
    {
        return implode(',', array_map(fn (string $f) => $prefix.$f, explode(',', self::FIELDS)));
    }

    /** @return array<string, string> */
    private function headers(?string $fields): array
    {
        return array_filter([
            'X-Goog-Api-Key' => (string) CredentialStore::value(CredentialProviders::GOOGLE_MAPS),
            'X-Goog-FieldMask' => $fields,
        ]);
    }

    private function post(string $path, array $body, ?string $fields): ?array
    {
        try {
            $res = SourceLog::request(15)->acceptJson()->withHeaders($this->headers($fields))->post(self::BASE.$path, $body);
        } catch (Throwable $e) {
            return SourceLog::threw('google_places', $e, ['step' => $path]);
        }

        if (! $res->successful()) {
            return SourceLog::status('google_places', $res->status(), $res->body(), ['step' => $path]);
        }

        $data = $res->json();

        return is_array($data) ? $data : [];
    }
}
