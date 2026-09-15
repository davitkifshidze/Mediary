<?php

namespace App\Services\Games;

use App\Services\Credentials\CredentialStore;
use App\Support\CredentialProviders;
use App\Support\SourceLog;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * IGDB — თამაშების **სათადარიგო** წყარო (`DECISIONS.md` §7, პასუხი 2026-09-06).
 *
 * ⚠️ **RAWG-ის ჩანაცვლება არაა.** §11.4-ში RAWG სწორედ იმიტომ აირჩა, რომ ერთ
 * უფასო კლავიშს ითხოვს; IGDB Twitch-ის OAuth-ზეა (ორი საიდუმლო + ტოკენის
 * განახლება). ამიტომ ის მაშინ ერთვება, როცა RAWG-ს კლავიში არ აქვს ან შედეგი
 * არ მოაქვს — `GameController::candidates()`/`lookup()` ამ რიგს იცავს.
 *
 * ⚠️ **დრაფტის ფორმა RAWG-ის იდენტურია** (`title_en`, `release_date`,
 * `platforms`, `genres`…) და ერთი ველით მეტი: `source`. ფორმა ორ სხვადასხვა
 * ფორმას რომ ხატავდეს, ორივე ცალკე გასამართავი გახდებოდა.
 *
 * ⚠️ **HowLongToBeat-ის საათები აქაც არ მოდის** — IGDB მათ არ იძლევა და HLTB-ს
 * ოფიციალური API არ აქვს (11.4). `hltb_*` ველები ხელით რჩება.
 *
 * ⚠️ **მოთხოვნის ენა APIcalypse-ია** (SQL-ის მსგავსი ტექსტი POST-ის ტანში) და
 * არა query string. ესეც განსხვავებაა RAWG-ისგან და კიდევ ერთი მიზეზი, რატომაც
 * ეს კლიენტი ცალკეა და არა `RawgClient`-ის პარამეტრი.
 */
class IgdbClient
{
    private const BASE = 'https://api.igdb.com/v4';

    private const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';

    /** ტოკენის ქეშის გასაღები — ერთ ადგილას, რომ გასუფთავებაც ერთი იყოს */
    private const TOKEN_KEY = 'igdb.access_token';

    /**
     * ტოკენის ქეშის key **გასაღების ანაბეჭდით** (Tasks §21.5).
     *
     * ⚠️ Twitch-ის ტოკენი კონკრეტულ `client_id`-ს ეკუთვნის. ერთი, საერთო
     * key ერთი მომხმარებლის ტოკენს მეორეს დაუბრუნებდა — და შედეგი იქნებოდა
     * 401, რომლის მიზეზი არსად ჩანდა (ორივეს **სწორი** გასაღები აქვს).
     */
    private function tokenKey(): string
    {
        return self::TOKEN_KEY.'.'.CredentialStore::fingerprint(CredentialProviders::IGDB);
    }

    /** IGDB-ის პლატფორმის id → ჩვენი `Game::PLATFORMS` key */
    private const PLATFORM_MAP = [
        6 => 'pc',          // PC (Microsoft Windows)
        167 => 'ps5',
        48 => 'ps4',
        169 => 'xbox_series',
        49 => 'xbox_one',
        130 => 'switch',
        39 => 'mobile',     // iOS
        34 => 'mobile',     // Android
    ];

    /** ბოლო რექვესთის სტატუსი; `0` = ქსელის შეცდომა, `null` = ჯერ არ გვიცდია */
    private ?int $lastStatus = null;

    public function configured(): bool
    {
        return CredentialStore::configured(CredentialProviders::IGDB);
    }

    /** ბოლო რექვესთი **დაბლოკილი** იყო და არა უბრალოდ უშედეგო */
    public function blocked(): bool
    {
        return in_array($this->lastStatus, [0, 401, 403, 429, 502, 503], true);
    }

    /**
     * სახელით ძებნა → არჩევანის სია (RAWG-ის `search()`-ის ტყუპი).
     *
     * @return array<int, array<string, mixed>>
     */
    public function search(string $query, int $limit = 10): array
    {
        $limit = max(1, min($limit, 20));
        // ⚠️ ბრჭყალები იჭრება: `search "…"` სტრიქონია და გატეხვა მოთხოვნას აფუჭებს
        $safe = str_replace('"', '', $query);

        $rows = $this->query(
            '/games',
            'search "'.$safe.'"; '
            .'fields name, slug, first_release_date, cover.image_id, genres.name, '
            .'platforms, aggregated_rating, total_rating; '
            ."limit {$limit};",
        );

        return array_values(array_map(fn (array $row) => $this->fromRow($row), $rows));
    }

    /**
     * ერთი თამაშის სრული დრაფტი. RAWG-ისგან განსხვავებით IGDB-ს ერთი
     * მოთხოვნით შეუძლია დაკავშირებული ცხრილების ჩამოტანაც (`involved_companies.*`),
     * ე.ი. მეორე რექვესთი არ სჭირდება.
     */
    public function details(int $igdbId): ?array
    {
        $rows = $this->query(
            '/games',
            "where id = {$igdbId}; "
            .'fields name, slug, summary, storyline, first_release_date, cover.image_id, '
            .'genres.name, platforms, aggregated_rating, total_rating, age_ratings.rating, '
            .'websites.url, websites.category, '
            .'involved_companies.developer, involved_companies.publisher, involved_companies.company.name; '
            .'limit 1;',
        );

        $row = $rows[0] ?? null;

        if (! $row) {
            return null;
        }

        $draft = $this->fromRow($row);

        $draft['description_en'] = $this->plainText($row['summary'] ?? $row['storyline'] ?? null);
        $draft['developer'] = $this->company($row, 'developer');
        $draft['publisher'] = $this->company($row, 'publisher');
        $draft['age_rating'] = $this->ageRating($row);
        $draft['links'] = $this->links($row);

        return $draft;
    }

    /**
     * სქრინშოტების URL-ები (§11.3) — გალერეის ჩამოსატვირთად.
     *
     * @return array<int, array{url: string, width: int|null, height: int|null}>
     */
    public function screenshots(int $igdbId, int $limit = 12): array
    {
        $limit = max(1, min($limit, 40));

        $rows = $this->query(
            '/screenshots',
            "where game = {$igdbId}; fields image_id, width, height; limit {$limit};",
        );

        $out = [];
        foreach ($rows as $row) {
            if (! empty($row['image_id'])) {
                $out[] = [
                    'url' => $this->imageUrl((string) $row['image_id'], 't_1080p'),
                    'width' => isset($row['width']) ? (int) $row['width'] : null,
                    'height' => isset($row['height']) ? (int) $row['height'] : null,
                ];
            }
        }

        return $out;
    }

    /** სურათის ბაიტები — ჩაწერის გარეშე (`RawgClient::image()`-ის ანალოგი) */
    public function image(string $url): ?string
    {
        if (! preg_match('#^https?://#i', $url)) {
            return null;
        }

        try {
            $res = SourceLog::request(20)->get($url);
        } catch (Throwable $e) {
            return SourceLog::threw('igdb', $e, ['url' => $url]);
        }

        if (! $res->successful()) {
            return SourceLog::status('igdb', $res->status(), $res->body(), ['url' => $url]);
        }

        return strlen($res->body()) > 1000
            ? $res->body()
            : SourceLog::failed('igdb', 'cover too small', ['url' => $url, 'bytes' => strlen($res->body())]);
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * ერთი APIcalypse მოთხოვნა.
     *
     * @return array<int, array<string, mixed>>
     */
    private function query(string $path, string $body): array
    {
        $token = $this->token();

        if (! $token) {
            // კლავიშების გარეშე რექვესთს არც ვცდით — 401 ისედაც დაბრუნდებოდა
            $this->lastStatus = 401;

            return [];
        }

        try {
            $res = SourceLog::request(20)
                ->withHeaders([
                    'Client-ID' => (string) CredentialStore::value(CredentialProviders::IGDB, 'client_id'),
                    'Authorization' => 'Bearer '.$token,
                    'Accept' => 'application/json',
                ])
                ->withBody($body, 'text/plain')
                ->post(self::BASE.$path);

            $this->lastStatus = $res->status();

            // ⚠️ 401 = ტოკენი გაუვიდა; ქეშს ვასუფთავებთ, რომ შემდეგი ცდა ახალს აიღოს
            if ($res->status() === 401) {
                Cache::forget($this->tokenKey());
            }

            if (! $res->successful()) {
                SourceLog::status('igdb', $res->status(), $res->body(), ['path' => $path]);

                return [];
            }

            return $res->json() ?? [];
        } catch (Throwable $e) {
            $this->lastStatus = 0;
            SourceLog::threw('igdb', $e, ['path' => $path]);

            return [];
        }
    }

    /**
     * Twitch-ის client-credentials ტოკენი.
     *
     * ⚠️ **ქეშდება** — ტოკენი ~60 დღეს ცოცხლობს და თითო ძებნაზე ახლის აღება
     * ორმაგ რექვესთს ნიშნავდა. ვადას თვითონ Twitch გვეუბნება (`expires_in`),
     * ერთი საათი კი უსაფრთხოების ზღვარია.
     */
    private function token(): ?string
    {
        if (! $this->configured()) {
            return null;
        }

        return Cache::remember($this->tokenKey(), now()->addDays(30), function () {
            try {
                $res = SourceLog::request(20)
                    ->asForm()
                    ->post(self::TOKEN_URL, [
                        'client_id' => CredentialStore::value(CredentialProviders::IGDB, 'client_id'),
                        'client_secret' => CredentialStore::value(CredentialProviders::IGDB, 'client_secret'),
                        'grant_type' => 'client_credentials',
                    ]);
            } catch (Throwable $e) {
                return SourceLog::threw('igdb', $e, ['step' => 'token']);
            }

            /* ⚠️ **ტოკენის ჩავარდნა ცალკე უნდა ჩანდეს**: „IGDB-მ ვერაფერი
               იპოვა" და „Twitch-მა ტოკენი არ მოგვცა" სრულიად სხვადასხვა
               მიზეზებია, პასუხი კი ორივეზე ცარიელი სიაა. */
            if (! $res->successful()) {
                return SourceLog::status('igdb', $res->status(), $res->body(), ['step' => 'token']);
            }

            return $res->json('access_token') ?: null;
        });
    }

    /** @return array<string, mixed> */
    private function fromRow(array $row): array
    {
        return [
            // ⚠️ **`rawg_id` განზრახ `null`-ია** — ჩანაწერი IGDB-დან მოვიდა
            'source' => 'igdb',
            'igdb_id' => (int) ($row['id'] ?? 0),
            'rawg_id' => null,
            'rawg_slug' => null,
            'igdb_slug' => $row['slug'] ?? null,
            'title_en' => $row['name'] ?? null,
            'release_date' => $this->releaseDate($row),
            'cover_url' => isset($row['cover']['image_id'])
                ? $this->imageUrl((string) $row['cover']['image_id'], 't_cover_big')
                : null,
            // IGDB-ის `aggregated_rating` კრიტიკოსების 0–100-ია — Metacritic-ის ანალოგი
            'metacritic' => isset($row['aggregated_rating'])
                ? (int) round((float) $row['aggregated_rating'])
                : null,
            // ⚠️ `users_score` ჩვენთან 0–5-ია (RAWG-ის შკალა), IGDB კი 0–100-ს იძლევა
            'users_score' => isset($row['total_rating'])
                ? round((float) $row['total_rating'] / 20, 2)
                : null,
            'platforms' => $this->platforms($row),
            'genres' => array_values(array_filter(array_map(
                fn (array $g) => $g['name'] ?? null,
                $row['genres'] ?? [],
            ))),
        ];
    }

    /** IGDB-ის თარიღი UNIX-ის წამებია */
    private function releaseDate(array $row): ?string
    {
        $ts = $row['first_release_date'] ?? null;

        return $ts ? date('Y-m-d', (int) $ts) : null;
    }

    /**
     * @return list<string>
     */
    private function platforms(array $row): array
    {
        $out = [];

        foreach ($row['platforms'] ?? [] as $id) {
            // `fields platforms` id-ების მასივს აბრუნებს (და არა ობიექტებს)
            $key = is_array($id) ? ($id['id'] ?? null) : $id;

            if ($key !== null && isset(self::PLATFORM_MAP[(int) $key])) {
                $out[] = self::PLATFORM_MAP[(int) $key];
            }
        }

        return array_values(array_unique($out));
    }

    /** დეველოპერი/გამომცემელი — `involved_companies`-ის დროშებით */
    private function company(array $row, string $flag): ?string
    {
        foreach ($row['involved_companies'] ?? [] as $entry) {
            if (! empty($entry[$flag]) && ! empty($entry['company']['name'])) {
                return (string) $entry['company']['name'];
            }
        }

        return null;
    }

    /**
     * ოფიციალური საიტი და მაღაზიები.
     * IGDB-ის `websites.category`: 1 = official, 13 = Steam, 16 = Epic, 17 = GOG.
     *
     * @return array<int, array{label: string, url: string, kind: string}>
     */
    private function links(array $row): array
    {
        $kinds = [1 => 'official', 13 => 'steam', 16 => 'epic', 17 => 'gog'];
        $labels = [1 => 'Official', 13 => 'Steam', 16 => 'Epic Games', 17 => 'GOG'];

        $out = [];

        foreach ($row['websites'] ?? [] as $site) {
            $category = isset($site['category']) ? (int) $site['category'] : null;
            $url = $site['url'] ?? null;

            if (! $url || ! isset($kinds[$category])) {
                continue;
            }

            $out[] = [
                'label' => $labels[$category],
                'url' => (string) $url,
                'kind' => $kinds[$category],
            ];
        }

        return array_slice($out, 0, 10);
    }

    /**
     * ასაკობრივი რეიტინგი. IGDB `age_ratings.rating` რიცხვია; ESRB-ის
     * დიაპაზონი 6–12-ია და მხოლოდ ისაა ჩვენთვის საინტერესო (RAWG-იც ESRB-ს იძლევა).
     */
    private function ageRating(array $row): ?string
    {
        $esrb = [6 => 'RP', 7 => 'EC', 8 => 'E', 9 => 'E10+', 10 => 'T', 11 => 'M', 12 => 'AO'];

        foreach ($row['age_ratings'] ?? [] as $entry) {
            $rating = isset($entry['rating']) ? (int) $entry['rating'] : null;

            if ($rating !== null && isset($esrb[$rating])) {
                return 'ESRB '.$esrb[$rating];
            }
        }

        return null;
    }

    /** IGDB-ის სურათის CDN — ზომა გზაშივეა */
    private function imageUrl(string $imageId, string $size): string
    {
        return "https://images.igdb.com/igdb/image/upload/{$size}/{$imageId}.jpg";
    }

    /** აღწერა ტექსტია, მაგრამ ჭერი მაინც გვჭირდება (RAWG-ის იგივე წესი) */
    private function plainText(?string $text): ?string
    {
        if (! $text) {
            return null;
        }

        $text = trim(preg_replace('/\n{3,}/', "\n\n", strip_tags($text)) ?? '');

        return $text !== '' ? mb_substr($text, 0, 20000) : null;
    }
}
