<?php

namespace App\Services\Games;

use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * RAWG.io — თამაშების გამამდიდრებელი წყარო (Tasks §11.4; გადაწყდა 2026-09-02).
 *
 * IGDB-ს ავირჩიეთ იმიტომ, რომ RAWG **ერთი უფასო კლავიშით** მუშაობს
 * (`RAWG_API_KEY`), IGDB კი Twitch-ის OAuth-ს ითხოვს — ორი საიდუმლო და
 * ტოკენის განახლების ციკლი. IGDB fallback-ად რჩება, თუ RAWG-ის მონაცემები
 * არ იკმარებს.
 *
 * ⚠️ **კლავიშის არქონა და „ვერაფერი ვიპოვე" ერთი და იგივე არაა** — `configured()`
 * და `blocked()` ცალ-ცალკეა, ზუსტად ისე, როგორც `BggClient`-ზე: ცარიელი სია
 * ჩუმად რომ არ ეთარგმნა user-ს „ასეთი თამაში არ არსებობს"-ად. კლავიშის გარეშე
 * მოდული სრულად მუშაობს, ველები კი ხელით ივსება.
 *
 * ⚠️ **HowLongToBeat-ის საათები აქ არ მოდის** — RAWG მათ არ იძლევა და HLTB-ს
 * ოფიციალური API არ აქვს (11.4). `hltb_*` ველები ხელით ივსება.
 */
class RawgClient
{
    private const BASE = 'https://api.rawg.io/api';

    /** RAWG-ის პლატფორმის slug → ჩვენი `Game::PLATFORMS` key */
    private const PLATFORM_MAP = [
        'pc' => 'pc',
        'playstation5' => 'ps5',
        'playstation4' => 'ps4',
        'xbox-series-x' => 'xbox_series',
        'xbox-one' => 'xbox_one',
        'nintendo-switch' => 'switch',
        'ios' => 'mobile',
        'android' => 'mobile',
    ];

    /** მაღაზიის slug → `links[].kind` */
    private const STORE_MAP = [
        'steam' => 'steam',
        'epic-games' => 'epic',
        'gog' => 'gog',
        'playstation-store' => 'psn',
        'xbox-store' => 'xbox',
        'xbox360' => 'xbox',
    ];

    /** ბოლო რექვესთის სტატუსი; `0` = ქსელის შეცდომა, `null` = ჯერ არ გვიცდია */
    private ?int $lastStatus = null;

    public function configured(): bool
    {
        return (bool) config('services.rawg.key');
    }

    /** ბოლო რექვესთი **დაბლოკილი** იყო და არა უბრალოდ უშედეგო */
    public function blocked(): bool
    {
        return in_array($this->lastStatus, [0, 401, 403, 429, 502, 503], true);
    }

    /**
     * სახელით ძებნა → არჩევანის სია. ავტომატურად არაფერს ვამთხვევთ
     * (TMDB-ისა და BGG-ის იგივე წესი — remake/remaster ერთნაირად ჰქვია).
     *
     * @return array<int, array<string, mixed>>
     */
    public function search(string $query, int $limit = 10): array
    {
        $data = $this->get('/games', [
            'search' => $query,
            'page_size' => max(1, min($limit, 20)),
        ]);

        return array_values(array_map(
            fn (array $row) => $this->fromRow($row),
            $data['results'] ?? [],
        ));
    }

    /**
     * ერთი თამაშის სრული დრაფტი (`/games/{id}`).
     *
     * ⚠️ სიის რიგსა და დეტალებს **სხვადასხვა ველები აქვს** (სიაში აღწერა არაა,
     * დეტალებში კი ზოგჯერ ჟანრი აკლია), ამიტომ ფრონტი ორივეს აერთიანებს —
     * იგივე გადაწყვეტილებაა, რაც წიგნებზე (`OpenLibraryClient`).
     */
    public function details(int $rawgId): ?array
    {
        $data = $this->get("/games/{$rawgId}");

        if (! $data || ! isset($data['id'])) {
            return null;
        }

        $draft = $this->fromRow($data);

        $draft['description_en'] = $this->plainText($data['description_raw'] ?? $data['description'] ?? null);
        $draft['developer'] = $data['developers'][0]['name'] ?? null;
        $draft['publisher'] = $data['publishers'][0]['name'] ?? null;
        $draft['age_rating'] = $this->ageRating($data);
        $draft['links'] = $this->links($data);

        return $draft;
    }

    /**
     * სქრინშოტების URL-ები (§11.3) — გალერეის ჩამოსატვირთად.
     *
     * @return array<int, array{url: string, width: int|null, height: int|null}>
     */
    public function screenshots(int $rawgId, int $limit = 12): array
    {
        $data = $this->get("/games/{$rawgId}/screenshots", ['page_size' => max(1, min($limit, 40))]);

        $out = [];
        foreach ($data['results'] ?? [] as $row) {
            if (! empty($row['image'])) {
                $out[] = [
                    'url' => (string) $row['image'],
                    'width' => isset($row['width']) ? (int) $row['width'] : null,
                    'height' => isset($row['height']) ? (int) $row['height'] : null,
                ];
            }
        }

        return $out;
    }

    /** სურათის ბაიტები — ჩაწერის გარეშე (`BggClient::image()`-ის ანალოგი) */
    public function image(string $url): ?string
    {
        if (! preg_match('#^https?://#i', $url)) {
            return null;
        }

        try {
            $res = Http::timeout(20)
                // ⚠️ Windows-ის cURL-ს CA bundle არ აქვს (იხ. CLAUDE.md)
                ->withOptions(['verify' => storage_path('cacert.pem')])
                ->get($url);
        } catch (Throwable) {
            return null;
        }

        return $res->successful() && strlen($res->body()) > 1000 ? $res->body() : null;
    }

    /* ---------- დამხმარეები ---------- */

    private function get(string $path, array $query = []): ?array
    {
        if (! $this->configured()) {
            // კლავიშის გარეშე რექვესთს არც ვცდით — 401 ისედაც დაბრუნდებოდა
            $this->lastStatus = 401;

            return null;
        }

        try {
            $res = Http::timeout(20)
                ->withOptions(['verify' => storage_path('cacert.pem')])
                ->get(self::BASE.$path, $query + ['key' => config('services.rawg.key')]);

            $this->lastStatus = $res->status();

            return $res->successful() ? $res->json() : null;
        } catch (Throwable) {
            $this->lastStatus = 0;

            return null;
        }
    }

    /** @return array<string, mixed> */
    private function fromRow(array $row): array
    {
        return [
            'rawg_id' => (int) ($row['id'] ?? 0),
            'rawg_slug' => $row['slug'] ?? null,
            'title_en' => $row['name'] ?? null,
            'release_date' => $row['released'] ?? null,
            'cover_url' => $row['background_image'] ?? null,
            'metacritic' => isset($row['metacritic']) ? (int) $row['metacritic'] : null,
            // RAWG-ის `rating` 0–5-ია და არა 0–100 — ისე ვინახავთ, როგორც მოდის
            'users_score' => isset($row['rating']) && $row['rating'] > 0 ? round((float) $row['rating'], 2) : null,
            'platforms' => $this->platforms($row),
            'genres' => array_values(array_filter(array_map(
                fn (array $g) => $g['name'] ?? null,
                $row['genres'] ?? [],
            ))),
        ];
    }

    /**
     * RAWG ორ ველში წერს პლატფორმებს (`platforms` და `parent_platforms`);
     * ჩვენ მხოლოდ ის გვჭირდება, რაც `Game::PLATFORMS`-შია — დანარჩენი
     * (Linux, macOS, ძველი კონსოლები) ჩუმად ვარდება.
     *
     * @return list<string>
     */
    private function platforms(array $row): array
    {
        $out = [];

        foreach ($row['platforms'] ?? [] as $entry) {
            $slug = $entry['platform']['slug'] ?? null;
            if ($slug && isset(self::PLATFORM_MAP[$slug])) {
                $out[] = self::PLATFORM_MAP[$slug];
            }
        }

        return array_values(array_unique($out));
    }

    /** @return array<int, array{label: string, url: string, kind: string}> */
    private function links(array $data): array
    {
        $out = [];

        if (! empty($data['website'])) {
            $out[] = ['label' => 'Official', 'url' => (string) $data['website'], 'kind' => 'official'];
        }

        foreach ($data['stores'] ?? [] as $entry) {
            $slug = $entry['store']['slug'] ?? null;
            $url = $entry['url'] ?? ($slug ? ($entry['store']['domain'] ?? null) : null);

            if (! $slug || ! $url) {
                continue;
            }

            $out[] = [
                'label' => (string) ($entry['store']['name'] ?? $slug),
                'url' => str_starts_with((string) $url, 'http') ? (string) $url : 'https://'.$url,
                'kind' => self::STORE_MAP[$slug] ?? 'other',
            ];
        }

        return array_slice($out, 0, 10);
    }

    /** ESRB („Mature") — PEGI-ს RAWG არ იძლევა */
    private function ageRating(array $data): ?string
    {
        $name = $data['esrb_rating']['name'] ?? null;

        return $name ? 'ESRB '.$name : null;
    }

    /** აღწერაში HTML-ია — ტექსტად ვაქცევთ (BGG-ის იგივე წესი) */
    private function plainText(?string $text): ?string
    {
        if (! $text) {
            return null;
        }

        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = trim(preg_replace('/\n{3,}/', "\n\n", strip_tags($text)) ?? '');

        return $text !== '' ? mb_substr($text, 0, 20000) : null;
    }
}
