<?php

namespace App\Services\Places;

use App\Support\SourceLog;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * **OpenStreetMap Nominatim — ადგილების უფასო წყარო (FEAT-26).**
 *
 * ⚠️ **გასაღები არ სჭირდება.** სწორედ ამიტომ აირჩა Google Places-ის ნაცვლად:
 * იქ გასაღებიც, ბილინგიც და საკრედიტო ბარათიც სჭირდება, აქ — არაფერი.
 * იგივე მიზეზი, რის გამოც Open Library აჯობა Google Books-ს.
 *
 * ⚠️ **სამაგიეროდ `User-Agent` სავალდებულოა** — Wikimedia-ს ზუსტი წესი:
 * უამისოდ Nominatim 403-ს აბრუნებს, ე.ი. წყარო ჩუმად „მიუწვდომელი"
 * იქნებოდა და მიზეზი არსად ჩანდა.
 *
 * ⚠️ **წამში ერთი მოთხოვნა — ეს მათი ცხადი პოლიტიკაა** და მისი დარღვევა
 * IP-ის დაბლოკვას ნიშნავს. ორი რამ იცავს: ყოველი წარმატებული პასუხი
 * იქეშება (**ჩავარდნა — არასდროს**, თორემ ერთი აციმციმებული წამი მთელი
 * დღე „მიუწვდომლად" წაიკითხებოდა) და `pace()` მოთხოვნებს შორის ინტერვალს
 * ინახავს.
 *
 * ⚠️ **ქართული შეკითხვა აქ მუშაობს**, განსხვავებით TMDB-ისა და Open
 * Library-ისგან: OSM-ის სახელები ლოკალიზებულია, ე.ი. „თბილისი" ნამდვილ
 * პასუხს აბრუნებს. სწორედ ამიტომ ამ მოდულს „მხოლოდ ხელით" რეჟიმი
 * (§5.7-ის `manual_only`) არ სჭირდება.
 */
class NominatimClient
{
    private const URL = 'https://nominatim.openstreetmap.org/search';

    /** ⚠️ სავალდებულო — იხ. ზემოთ */
    private const AGENT = 'Mediary/1.0 (personal media library)';

    private const CACHE_HOURS = 24;

    /** მოთხოვნებს შორის მინიმალური ინტერვალი, წამებში (მათი პოლიტიკა) */
    private const MIN_INTERVAL = 1.0;

    private const PACE_KEY = 'nominatim:last-call';

    /** ბოლო გამოძახება ჩავარდა? — „წყარო არ პასუხობს" ≠ „ვერაფერი ვიპოვე" */
    private bool $blocked = false;

    public function blocked(): bool
    {
        return $this->blocked;
    }

    /**
     * ადგილის კანდიდატები (§12-ის `candidates → lookup` ფორმა).
     *
     * @return list<array<string, mixed>>
     */
    public function search(string $query, int $limit = 10): array
    {
        $query = trim($query);
        $limit = max(1, min($limit, 20));
        $this->blocked = false;

        if ($query === '') {
            return [];
        }

        $cacheKey = 'nominatim:'.sha1($query.'|'.$limit);
        $cached = Cache::get($cacheKey);

        if (is_array($cached)) {
            return $cached;
        }

        $rows = $this->get([
            'q' => $query,
            'format' => 'jsonv2',
            'addressdetails' => 1,
            'limit' => $limit,
            // ⚠️ ინტერფეისის ენა — ქართული სახელი სწორედ აქედან მოდის
            'accept-language' => 'ka,en',
        ]);

        if ($rows === null) {
            return [];
        }

        $items = array_values(array_filter(array_map(
            fn (array $row) => $this->row($row),
            $rows,
        )));

        // ⚠️ მხოლოდ წარმატება იქეშება
        Cache::put($cacheKey, $items, now()->addHours(self::CACHE_HOURS));

        return $items;
    }

    /**
     * ერთი კანდიდატი `osm_type`+`osm_id`-ით — `lookup`-ის მხარე.
     *
     * ⚠️ **ცალკე `/lookup` endpoint-ს განზრახ არ ვიძახებთ**: `search()`-ის
     * პასუხი უკვე სრულია (სახელი, კოორდინატი, მისამართი, ქვეყანა), ე.ი.
     * მეორე გასვლა იმავე ფაქტისთვის მათი წამში-ერთი ლიმიტის უაზრო ხარჯვაა.
     * ქეშიც სწორედ ამიტომ ეყოფა ორივე ნაბიჯს.
     */
    public function find(string $osmType, string $osmId, string $query): ?array
    {
        foreach ($this->search($query, 20) as $item) {
            if ($item['osm_type'] === $osmType && (string) $item['osm_id'] === (string) $osmId) {
                return $item;
            }
        }

        return null;
    }

    /** @return array<string, mixed>|null */
    private function row(array $row): ?array
    {
        $id = $row['osm_id'] ?? null;
        $lat = $row['lat'] ?? null;
        $lon = $row['lon'] ?? null;

        if ($id === null || $lat === null || $lon === null) {
            return null;
        }

        $address = is_array($row['address'] ?? null) ? $row['address'] : [];

        /* ⚠️ ქალაქის ველი OSM-ში ერთი არ არის: დასახლების ზომის მიხედვით
           `city`/`town`/`village`/`municipality` — ერთის კითხვა სოფელს
           ჩუმად უქალაქოდ დატოვებდა. */
        $city = $address['city'] ?? $address['town'] ?? $address['village'] ?? $address['municipality'] ?? null;

        $display = (string) ($row['display_name'] ?? '');
        $name = (string) ($row['name'] ?? '');

        return [
            'osm_id' => (string) $id,
            'osm_type' => (string) ($row['osm_type'] ?? ''),
            // ⚠️ `name` ხანდახან ცარიელია (მისამართის ზუსტი წერტილი) — მაშინ
            // სრული სახელწოდების პირველი ნაწილი ერთადერთი სახელია, რაც გვაქვს
            'name' => $name !== '' ? $name : trim(explode(',', $display)[0] ?? $display),
            'address' => $display !== '' ? $display : null,
            'city' => $city !== null ? (string) $city : null,
            'country' => isset($address['country']) ? (string) $address['country'] : null,
            'lat' => (float) $lat,
            'lng' => (float) $lon,
            // OSM-ის საკუთარი კლასიფიკაცია — ჩვენს კატეგორიად **არ** ითარგმნება
            'kind' => trim(((string) ($row['category'] ?? '')).' '.((string) ($row['type'] ?? ''))) ?: null,
        ];
    }

    /** @return list<array<string, mixed>>|null */
    private function get(array $params): ?array
    {
        $this->pace();

        try {
            $res = SourceLog::request(20)
                // ⚠️ ამის გარეშე 403 (იხ. ზემოთ)
                ->withHeaders(['User-Agent' => self::AGENT])
                ->get(self::URL, $params);
        } catch (Throwable $e) {
            SourceLog::threw('nominatim', $e, $params);
            $this->blocked = true;

            return null;
        }

        if (! $res->successful()) {
            SourceLog::status('nominatim', $res->status(), $res->body(), $params);
            $this->blocked = true;

            return null;
        }

        $rows = $res->json();

        return is_array($rows) ? array_values(array_filter($rows, 'is_array')) : [];
    }

    /**
     * წამში ერთი მოთხოვნა.
     *
     * ⚠️ **ლოდინი ცხადია და არა შემთხვევითი**: ძებნა ყოველთვის ცხადი
     * დაწკაპუნებაა (არასდროს ავტომატური), ე.ი. ერთი წამი ფასი, რომელსაც
     * IP-ის დაბლოკვის რისკს ვურჩევნივართ. დრო **გამოძახებამდე** იწერება,
     * რომ პარალელურმა გამომძახებელმაც დაიცადოს.
     */
    private function pace(): void
    {
        $last = (float) Cache::get(self::PACE_KEY, 0);
        $wait = self::MIN_INTERVAL - (microtime(true) - $last);

        Cache::put(self::PACE_KEY, microtime(true), 60);

        if ($wait > 0) {
            usleep((int) round(min($wait, self::MIN_INTERVAL) * 1_000_000));
        }
    }
}
