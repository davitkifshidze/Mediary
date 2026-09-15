<?php

namespace App\Services\Serp;

use App\Models\SerpSearch;
use App\Services\Credentials\CredentialStore;
use App\Support\CredentialProviders;
use App\Support\SourceLog;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * **SerpApi — ერთი კლიენტი, ერთი მრიცხველი (Tasks §7.6.1)**.
 *
 * SerpApi ჩვენთვის **მოდული არ არის, წყაროა** — TMDB/RAWG/BGG-ის რიგში. ე.ი.
 * არც `modules` რიგი აქვს, არც გვერდითი მენიუს სექცია; ადმინში მხოლოდ კვოტა
 * ჩანს.
 *
 * ⚠️ **250 ძებნა თვეში ანგარიშისაა და არა engine-ისა.** სურათი, ვიდეო და
 * (თუ §5.7-ში ეს გზა აირჩევა) წიგნიც **ერთი ბიუჯეტიდან** ხარჯავს. სწორედ
 * ამიტომ არის ეს ერთადერთი ადგილი, საიდანაც SerpApi-ს რექვესთი მიდის —
 * ზუსტად ისე, როგორც `StorageMeter` არის ატვირთვების ერთადერთი წერტილი.
 * მეორე გზა მრიცხველს ჩუმად აცდენდა.
 *
 * ⚠️ **მრიცხველი ორია და ორივე საჭიროა:**
 *  · **ჩვენი** — `serp_searches`-ის რიგები (ვინ, რა engine-ზე, როდის);
 *  · **ნამდვილი** — `GET /account`, რომელიც **კვოტას არ ხარჯავს**, ე.ი.
 *    ადმინში ნამდვილი რიცხვის ჩვენება უფასოა.
 * ნამდვილი ჯობია ჩვენს ვარაუდს (იმავე გასაღებს სხვაგანაც თუ გამოიყენებ,
 * ჩვენი რიცხვი ჩამორჩება), მაგრამ ჩვენი მუშაობს მაშინაც, როცა `/account`
 * არ პასუხობს — ამიტომ ლიმიტს **ორივე** იცავს.
 *
 * ⚠️ **ქეში სავალდებულოა** და არა ოპტიმიზაცია: ერთი და იმავე შეკითხვის
 * გამეორება (ფორმის რედაქტირება, გვერდის განახლება, „უკან") 250-იან ბიუჯეტს
 * დღეებში აჭმევდა. ქეშიდან დაბრუნებული პასუხი **არც რიგს წერს და არც ხარჯავს**.
 *
 * ⚠️ **გამოძახება მხოლოდ ცხადი მოქმედებით.** არსად — შენახვაზე, სინქრონზე ან
 * გვერდის გახსნაზე. ეს კლიენტი კონტროლერიდან მხოლოდ ღილაკის პასუხად იძახება.
 *
 * ⚠️ **HTML არასდროს ინახება** (`VideoUrl`-ის წესი): პასუხიდან მხოლოდ
 * ტექსტური ველები და URL-ები გამოდის.
 */
class SerpApiClient
{
    private const SEARCH_URL = 'https://serpapi.com/search.json';

    /** ⚠️ ეს გამოძახება **კვოტას არ ხარჯავს** — ამიტომ ნამდვილი რიცხვი უფასოა */
    private const ACCOUNT_URL = 'https://serpapi.com/account';

    /**
     * სურათების engine-ები (§7.6.2) — ოთხივე, როგორც თასქშია.
     *
     * ⚠️ **`query` სვეტი განზრახ არსებობს:** ყოველ engine-ს შეკითხვის
     * პარამეტრი **სხვანაირად** ჰქვია (`q` · `text` · `p` · `search_query`).
     * ერთი გამორჩენა ჩუმია — SerpApi უბრალოდ ცარიელ პასუხს დააბრუნებდა და
     * „ვერაფერი ვიპოვე"-დ წაიკითხებოდა, ძებნა კი დახარჯული იქნებოდა.
     *
     * `results` — რომელ გასაღებში დევს სია. **რამდენიმე ვარიანტი განზრახაა**
     * (`GeorgianShops`-ის წესი): ერთის გაქრობა მეორეს არ უნდა წაიღოს.
     *
     * @var array<string, array{name: string, query: string, results: list<string>, safe: bool}>
     */
    public const IMAGE_ENGINES = [
        // ⚠️ ნაგულისხმევი სწორედ ესაა: იგივე სურათებს აბრუნებს, უფრო სწრაფად
        // და მსუბუქი პასუხით — ჩვენს საქმეზე (ესკიზი + ორიგინალი + ლინკი)
        // სავსებით საკმარისია (§7.6.2).
        'google_images_light' => [
            'name' => 'Google',
            'query' => 'q',
            'results' => ['images_results', 'image_results'],
            'safe' => true,
        ],
        // სრული პასუხი — `shopping_results`, `related_searches` და სხვა ბლოკებით
        'google_images' => [
            'name' => 'Google (სრული)',
            'query' => 'q',
            'results' => ['images_results', 'image_results'],
            'safe' => true,
        ],
        // ⚠️ ზუსტი სახელი `yandex_images`-ია და არა `yandex` (გადამოწმებულია):
        // Yandex-ს ცალკე საერთო ძებნის engine-იც აქვს და ცალკე სურათებისა.
        'yandex_images' => [
            'name' => 'Yandex',
            'query' => 'text',
            'results' => ['images_results', 'image_results'],
            'safe' => false,
        ],
        'yahoo_images' => [
            'name' => 'Yahoo',
            'query' => 'p',
            'results' => ['image_results', 'images_results'],
            'safe' => false,
        ],
    ];

    /**
     * ვიდეოს engine-ები (§7.6.3). `youtube_video` აქ **არაა** — ის სიას არ
     * აბრუნებს, ერთი კონკრეტული ვიდეოს დეტალებია (`video()`).
     *
     * @var array<string, array{name: string, query: string, results: list<string>, safe: bool}>
     */
    public const VIDEO_ENGINES = [
        'youtube' => [
            'name' => 'YouTube',
            'query' => 'search_query',
            'results' => ['video_results', 'videos_results', 'movie_results'],
            'safe' => false,
        ],
        // ⚠️ აქ სია **`videos_results`**-ია (მრავლობითი „videos"), YouTube-ზე კი
        // `video_results` — გადამოწმებულია ცოცხალ პასუხზე 2026-09-11. სწორედ ეს
        // ერთი ასო აბრუნებდა ცარიელ სიას, ე.ი. ძებნა იხარჯებოდა და შედეგი
        // „ვერაფერი ვიპოვე"-დ იკითხებოდა. სწორედ ამიტომ არის სია და არა სტრიქონი.
        'yandex_videos' => [
            'name' => 'Yandex',
            'query' => 'text',
            'results' => ['videos_results', 'video_results'],
            'safe' => false,
        ],
    ];

    /** ერთი კონკრეტული ვიდეოს დეტალები — YouTube-ის გასაღების გარეშე (§7.6.3) */
    public const VIDEO_DETAIL_ENGINE = 'youtube_video';

    /**
     * პასუხის ქეში. ⚠️ **ჩავარდნა არ ქეშირდება** — ერთი წამიერი ქსელის შეცდომა
     * საათნახევრით „მიუწვდომელს" დააფიქსირებდა (`GeorgianShops`-ის წესი).
     */
    private const CACHE_HOURS = 24;

    /** `/account`-ის ქეში: უფასოა, მაგრამ ყოველ დაჭერაზე გარეთ გასვლა ზედმეტია */
    private const ACCOUNT_CACHE_MINUTES = 10;

    /** ბოლო რექვესთის სტატუსი; `0` = ქსელის შეცდომა, `null` = ჯერ არ გვიცდია */
    private ?int $lastStatus = null;

    public function configured(): bool
    {
        return (bool) CredentialStore::value(CredentialProviders::SERPAPI);
    }

    /**
     * **ვის ხარჯზე იწერება ეს ძებნა** (Tasks §21.4).
     *
     * ⚠️ `null` = საერთო გასაღები, ე.ი. მრიცხველი ძველებურად **მთელ
     * ინსტალაციას** ითვლის (ზუსტად ის, რასაც `SerpSearch`-ის დოკბლოკი
     * აღწერს: „კვოტა ანგარიშისაა და არა მომხმარებლისა"). თავისი გასაღებით
     * კი მხოლოდ თავისი რიგები ითვლება — თორემ სხვისი ძებნა ჩემს 250-ს
     * ხარჯავდა, თუმცა SerpApi-ს ჩემი გასაღები საერთოდ არ უნახავს.
     */
    private function quotaOwner(): ?int
    {
        return CredentialStore::quotaOwner(CredentialProviders::SERPAPI);
    }

    /** ბოლო რექვესთი **დაბლოკილი/ჩავარდნილი** იყო და არა უბრალოდ უშედეგო */
    public function blocked(): bool
    {
        return in_array($this->lastStatus, [0, 401, 403, 429, 500, 502, 503], true);
    }

    /** ჩვენი ჭერი (`SERPAPI_MONTHLY_LIMIT`); `null` = ჭერი არ დაგვიწესებია */
    public function limit(): ?int
    {
        return CredentialStore::limit(CredentialProviders::SERPAPI, 'monthly');
    }

    /* ---------- მრიცხველები ---------- */

    /**
     * **ჩვენი** მრიცხველი — რამდენი ძებნა გავუშვით მოქმედ ფანჯარაში.
     *
     * ⚠️ ფანჯარა `/account`-ის განახლების თარიღიდან იწყება, თუ ის ცნობილია
     * (ჩვენს ანგარიშზე ეს **7 რიცხვია და არა 1-ლი**), თორემ კალენდარული თვე
     * მრიცხველს მუდმივად აცდენდა.
     */
    public function usage(?Carbon $since = null): int
    {
        $owner = $this->quotaOwner();

        return SerpSearch::where('created_at', '>=', $since ?? $this->windowStart())
            // §21.4 — თავისი გასაღები → თავისი ხარჯი; საერთო → ყველასი
            ->when($owner !== null, fn ($q) => $q->where('user_id', $owner))
            ->count();
    }

    /**
     * რამდენი დარჩა. **ნამდვილი რიცხვი ჯობია ჩვენს ვარაუდს** — `/account`-ის
     * `total_searches_left` პირდაპირ SerpApi-ისგან მოდის; მისი უქონლობისას
     * ჩვენს ჭერს ვაკლებთ ჩვენსავე ხარჯს. `null` = ვერ ვამბობთ (ჭერიც არაა და
     * ანგარიშიც არ პასუხობს) — ასეთ დროს ძებნას **არ ვკეტავთ**.
     */
    public function remaining(): ?int
    {
        $account = $this->account();

        if (is_int($account['total_searches_left'] ?? null)) {
            return max(0, (int) $account['total_searches_left']);
        }

        $limit = $this->limit();

        return $limit === null ? null : max(0, $limit - $this->usage());
    }

    /**
     * ადმინის ბლოკისთვის — ერთი ობიექტი, სადაც ორივე მრიცხველი ჩანს.
     *
     * @return array<string, mixed>
     */
    public function status(): array
    {
        $account = $this->account();
        $since = $this->windowStart();

        return [
            'configured' => $this->configured(),
            'limit' => $this->limit(),
            // ჩვენი მხარე — ყოველთვის ხელმისაწვდომია, ინტერნეტის გარეშეც
            'used' => $this->usage($since),
            'window_start' => $since->toIso8601String(),
            'remaining' => $this->remaining(),
            // ნამდვილი მხარე — `null`, თუ `/account` არ პასუხობს
            'account' => $account ? [
                'plan' => $account['plan_name'] ?? null,
                'searches_per_month' => $account['searches_per_month'] ?? null,
                'this_month_usage' => $account['this_month_usage'] ?? null,
                'total_searches_left' => $account['total_searches_left'] ?? null,
                'rate_limit_per_hour' => $account['account_rate_limit_per_hour'] ?? null,
                'renews_at' => $account['plan_renewal_date'] ?? $account['account_renewal_date'] ?? null,
            ] : null,
        ];
    }

    /**
     * SerpApi-ის ანგარიშის მდგომარეობა. ⚠️ **ეს გამოძახება კვოტას არ ხარჯავს**,
     * ე.ი. მისი ჩვენება უფასოა; ჩავარდნაზე ცარიელი მასივია და არა შეცდომა.
     *
     * @return array<string, mixed>
     */
    public function account(bool $fresh = false): array
    {
        if (! $this->configured()) {
            return [];
        }

        /* §21.5 — ქეშის key **გასაღების ანაბეჭდით**: `/account` კონკრეტული
           გასაღების ანგარიშს აღწერს, ე.ი. საერთო key ჩემს ნაშთს სხვას
           აჩვენებდა. ⚠️ ძებნის **შედეგის** ქეში განზრახ საერთო რჩება — ის
           გასაღებზე არაა დამოკიდებული და საზიარო ქეში კვოტას ზოგავს. */
        $cacheKey = 'serpapi:account:'.CredentialStore::fingerprint(CredentialProviders::SERPAPI);

        if ($fresh) {
            Cache::forget($cacheKey);
        }

        $cached = Cache::get($cacheKey);

        if (is_array($cached)) {
            return $cached;
        }

        try {
            $res = SourceLog::request(15)
                ->get(self::ACCOUNT_URL, ['api_key' => CredentialStore::value(CredentialProviders::SERPAPI)]);
        } catch (Throwable $e) {
            SourceLog::threw('serpapi', $e, ['step' => 'account']);

            return [];
        }

        if (! $res->successful()) {
            SourceLog::status('serpapi', $res->status(), $res->body(), ['step' => 'account']);

            return [];
        }

        $data = $res->json();

        if (! is_array($data)) {
            return [];
        }

        Cache::put($cacheKey, $data, now()->addMinutes(self::ACCOUNT_CACHE_MINUTES));

        return $data;
    }

    /* ---------- ძებნა ---------- */

    /**
     * სურათების ძებნა ერთ engine-ზე (§7.6.2/§7.6.5).
     *
     * @return array{ok: bool, cached: bool, engine: string, items: list<array<string, mixed>>, dropped: int}
     */
    public function images(string $engine, string $query, int $limit = 20, bool $safe = false): array
    {
        return $this->listSearch(self::IMAGE_ENGINES, $engine, $query, $limit, $safe, fn (array $row, string $e) => $this->image($row, $e));
    }

    /**
     * ვიდეოს ძებნა ერთ engine-ზე (§7.6.3).
     *
     * @return array{ok: bool, cached: bool, engine: string, items: list<array<string, mixed>>, dropped: int}
     */
    public function videos(string $engine, string $query, int $limit = 20, bool $safe = false): array
    {
        return $this->listSearch(self::VIDEO_ENGINES, $engine, $query, $limit, $safe, fn (array $row, string $e) => $this->video($row, $e));
    }

    /**
     * ერთი კონკრეტული YouTube-ის ვიდეოს დეტალები (§7.6.3).
     *
     * ⚠️ **ეს ვიდეოს მოდულის ნამდვილ ხარვეზს ხურავს:** `YOUTUBE_API_KEY`
     * ცარიელია, ე.ი. `VideoMetadata` ხანგრძლივობას ვერ იგებს. მაგრამ **თითო
     * ვიდეო ერთ ძებნას ჭამს 250-იდან**, ამიტომ ეს ღილაკია და არა ავტომატური
     * probe URL-ის ჩასმაზე — უფასო oEmbed ისევ პირველია.
     *
     * @return array<string, mixed>|null
     */
    public function videoDetails(string $videoId): ?array
    {
        $result = $this->call(self::VIDEO_DETAIL_ENGINE, ['v' => $videoId], $videoId);

        if ($result['data'] === null) {
            return null;
        }

        $root = $result['data'];
        $row = $root['video_results'] ?? $root['video_result'] ?? $root;

        if (! is_array($row)) {
            return null;
        }

        return [
            'engine' => self::VIDEO_DETAIL_ENGINE,
            'cached' => $result['cached'],
            'video_id' => $videoId,
            'title' => $this->str($row['title'] ?? null),
            'description' => $this->str($row['description'] ?? null),
            'channel' => $this->str($row['channel']['name'] ?? $row['channel'] ?? null),
            'duration' => $this->seconds($row['length'] ?? $row['duration'] ?? null),
            'views' => is_numeric($row['views'] ?? null) ? (int) $row['views'] : null,
            'published' => $this->publishedDate($row['published_date'] ?? $row['publish_date'] ?? null),
            'thumbnail' => $this->url($row['thumbnail']['static'] ?? $row['thumbnail'] ?? null),
        ];
    }

    /* ---------- შიგნეული ---------- */

    /**
     * @param  array<string, array{name: string, query: string, results: list<string>, safe: bool}>  $catalogue
     * @param  callable(array<string, mixed>, string): ?array<string, mixed>  $map
     * @return array{ok: bool, cached: bool, engine: string, items: list<array<string, mixed>>, dropped: int}
     */
    private function listSearch(array $catalogue, string $engine, string $query, int $limit, bool $safe, callable $map): array
    {
        $spec = $catalogue[$engine] ?? null;
        $query = trim($query);

        if (! $spec || $query === '') {
            return ['ok' => false, 'cached' => false, 'engine' => $engine, 'items' => [], 'dropped' => 0];
        }

        $params = [$spec['query'] => $query];

        // ⚠️ `safe=off` მხოლოდ იქ იგზავნება, სადაც engine-ს ეს პარამეტრი აქვს —
        // უცნობი პარამეტრი სხვაგან უბრალოდ იგნორირდება, მაგრამ ჩვენ ცხადად
        // ვწერთ, სად მუშაობს ცენზურის გამორთვა და სად არა.
        if ($spec['safe']) {
            $params['safe'] = $safe ? 'active' : 'off';
        }

        $result = $this->call($engine, $params, $query);

        if ($result['data'] === null) {
            return ['ok' => false, 'cached' => false, 'engine' => $engine, 'items' => [], 'dropped' => 0];
        }

        $rows = [];

        foreach ($spec['results'] as $key) {
            if (is_array($result['data'][$key] ?? null)) {
                $rows = $result['data'][$key];
                break;
            }
        }

        $items = [];
        $dropped = 0;

        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            $item = $map($row, $engine);

            if ($item) {
                $items[] = $item;
            } else {
                // ⚠️ **„ვერაფერი ვიპოვა" და „იპოვა, მაგრამ გამოუსადეგარი" ორი
                // სხვადასხვა ამბავია** და ორივე უნდა ჩანდეს. ცოცხალი მაგალითი:
                // `yandex_videos` 17 რიგს აბრუნებს **სათაურისა და ლინკის
                // გარეშე** (მხოლოდ ესკიზი + აღწერა, გადამოწმებულია 2026-09-11),
                // ე.ი. ჩვენთვის ვერც გაიხსნება და ვერც ჩამოიტვირთება. ასეთი
                // რიგის ჩუმად გადაგდება „ნულ შედეგად" იკითხებოდა და
                // მომხმარებელი იმავე ძებნას თავიდან დახარჯავდა.
                $dropped++;
            }

            if (count($items) >= $limit) {
                break;
            }
        }

        return ['ok' => true, 'cached' => $result['cached'], 'engine' => $engine, 'items' => $items, 'dropped' => $dropped];
    }

    /**
     * **ერთადერთი ადგილი, საიდანაც SerpApi-ს რექვესთი მიდის** და ერთადერთი,
     * სადაც ხარჯი აღირიცხება.
     *
     * რიგი: ქეში → კვოტის შემოწმება → რექვესთი → აღრიცხვა → ქეშში ჩაწერა.
     *
     * @param  array<string, scalar>  $params
     * @return array{data: array<string, mixed>|null, cached: bool}
     */
    private function call(string $engine, array $params, string $query): array
    {
        if (! $this->configured()) {
            $this->lastStatus = 401;

            return ['data' => null, 'cached' => false];
        }

        $fingerprint = $this->fingerprint($engine, $params);
        $cached = Cache::get('serpapi:'.$fingerprint);

        if (is_array($cached)) {
            $this->lastStatus = 200;

            // ⚠️ ქეშის მოხვედრა **არ ხარჯავს** — არც რიგი იწერება, არც კვოტა მოწმდება
            return ['data' => $cached, 'cached' => true];
        }

        $remaining = $this->remaining();

        if ($remaining !== null && $remaining <= 0) {
            throw new SerpQuotaExceeded($this->usage(), $this->limit());
        }

        try {
            $res = SourceLog::request(30)
                ->get(self::SEARCH_URL, $params + [
                    'engine' => $engine,
                    'api_key' => CredentialStore::value(CredentialProviders::SERPAPI),
                    // ⚠️ SerpApi-საც აქვს თავისი ქეში და ისიც ზოგავს ძებნას
                    'no_cache' => 'false',
                ]);
            $this->lastStatus = $res->status();
        } catch (Throwable $e) {
            $this->lastStatus = 0;
            SourceLog::threw('serpapi', $e, ['engine' => $engine]);

            return ['data' => null, 'cached' => false];
        }

        // ⚠️ SerpApi-ს საათობრივი ჭერიც აქვს — 429 „ამოწურულია"-ს ტოლფასია
        if ($res->status() === 429) {
            throw new SerpQuotaExceeded($this->usage(), $this->limit());
        }

        if (! $res->successful()) {
            SourceLog::status('serpapi', $res->status(), $res->body(), ['engine' => $engine]);

            return ['data' => null, 'cached' => false];
        }

        $data = $res->json();

        if (! is_array($data) || isset($data['error'])) {
            /* ⚠️ **SerpApi შეცდომას 200-ითაც აბრუნებს** (`{"error": "…"}`) —
               ე.ი. სტატუსზე დაყრდნობა ამ მიზეზს სამუდამოდ დამალავდა. */
            SourceLog::failed('serpapi', 'error payload', [
                'engine' => $engine,
                'error' => is_array($data) ? mb_substr((string) ($data['error'] ?? ''), 0, 200) : null,
            ]);

            return ['data' => null, 'cached' => false];
        }

        $this->record($engine, $query, $fingerprint, $this->countRows($data));

        Cache::put('serpapi:'.$fingerprint, $data, now()->addHours(self::CACHE_HOURS));

        return ['data' => $data, 'cached' => false];
    }

    /**
     * **ხარჯის აღრიცხვა — ერთი წერტილი** (აუდიტი 2026-09-14).
     *
     * ⚠️ **მხოლოდ წარმატებული პასუხი იწერება — და ეს `Translator`-ისგან
     * განსხვავდება განზრახ** (გადამოწმდა აუდიტის დროს, 2026-09-14).
     * თავიდან ეს შეუსაბამობად ჩაითვალა, სინამდვილეში კი ორი პროვაიდერი
     * მართლა სხვადასხვანაირად ანგარიშობს: **SerpApi ჩავარდნილ ძებნას არ
     * გვახარჯვინებს** (კრედიტს აბრუნებს), Gemini-ს კვოტა კი **უარყოფილ
     * მოთხოვნასაც** ითვლის — სწორედ ამიტომ ჩნდება 429. ე.ი. თითოეული
     * კლიენტი **თავისი** წყაროს ქცევას ასახავს და მათი „გაერთიანება"
     * ორივე მრიცხველს გააფუჭებდა. ამას `WebSearchTest::test_a_failure_is_not_cached`
     * ცხადად იცავს.
     *
     * ⚠️ **ქეშის მოხვედრაც არ იწერება** — ის ქსელში საერთოდ არ გასულა.
     */
    private function record(string $engine, string $query, string $fingerprint, int $results): void
    {
        SerpSearch::create([
            'user_id' => Auth::id(),
            'engine' => $engine,
            'query' => mb_substr($query, 0, 255),
            'fingerprint' => $fingerprint,
            'results' => $results,
        ]);
    }

    /**
     * ერთი სურათი პასუხიდან (§7.6.5).
     *
     * ⚠️ **გასაღებების რამდენიმე ვარიანტი განზრახაა** — ოთხი engine ერთსა და
     * იმავე ფაქტს სხვადასხვა სახელით აბრუნებს (`original` · `original_image` ·
     * `image`), და ერთ სახელზე დაყრდნობა ერთ წყაროს ჩუმად დააცარიელებდა.
     *
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>|null
     */
    private function image(array $row, string $engine): ?array
    {
        $original = $this->url($row['original'] ?? $row['original_image'] ?? $row['image'] ?? null);
        $thumbnail = $this->url($row['thumbnail'] ?? $row['thumbnail_image'] ?? null);

        // ⚠️ ერთი ლინკი მაინც უნდა იყოს — თორემ ჩამოტვირთვაც შეუძლებელია და
        // სიაშიც ცარიელი უჯრა გამოჩნდება
        if (! $original && ! $thumbnail) {
            return null;
        }

        [$width, $height] = $this->dimensions($row);
        [$link, $domain] = $this->attribution($row);

        return [
            'engine' => $engine,
            'source' => 'serpapi:'.$engine,
            'title' => $this->str($row['title'] ?? null),
            // ორივე ლინკი ინახება: ესკიზი სიის სწრაფად ჩვენებისთვის,
            // ორიგინალი ჩამოტვირთვისთვის (§7.6.5)
            'original' => $original,
            'thumbnail' => $thumbnail,
            // გვერდი, სადაც სურათი დევს + დომენი — წყაროს მითითებისთვის
            'link' => $link,
            'domain' => $domain,
            'width' => $width,
            'height' => $height,
        ];
    }

    /**
     * ზომები — **სამი სხვადასხვა ფორმა ერთ ფაქტზე** (გადამოწმებულია ცოცხალ
     * პასუხებზე 2026-09-11): Google `original_width`/`original_height`,
     * Yandex `size: {width, height}`, Yahoo `dimensions: "1000x1600"`.
     * ერთ ფორმაზე დაყრდნობა ორ წყაროს ზომების გარეშე დატოვებდა, ე.ი. ბადეში
     * პროპორცია დაიკარგებოდა.
     *
     * @param  array<string, mixed>  $row
     * @return array{0: ?int, 1: ?int}
     */
    private function dimensions(array $row): array
    {
        $width = $row['original_width'] ?? $row['size']['width'] ?? null;
        $height = $row['original_height'] ?? $row['size']['height'] ?? null;

        if ((! is_numeric($width) || ! is_numeric($height)) && is_string($row['dimensions'] ?? null)
            && preg_match('~^(\d+)\s*[x×]\s*(\d+)$~i', trim($row['dimensions']), $m)) {
            [$width, $height] = [$m[1], $m[2]];
        }

        return [
            is_numeric($width) ? (int) $width : null,
            is_numeric($height) ? (int) $height : null,
        ];
    }

    /**
     * წყაროს მითითება — გვერდის ლინკი და დომენი.
     *
     * ⚠️ **`link` და `source` სამ engine-ზე სამ სხვადასხვა რამეს ნიშნავს**
     * (გადამოწმებულია): Google-ზე `link` გვერდია და `source` სახელი („ELLE"),
     * Yandex-ზე `link` გვერდია და `source` დომენი, **Yahoo-ზე კი პირიქით** —
     * `link` Yahoo-ს გადამისამართებაა (`images.search.yahoo.com/…?imgurl=…`)
     * და ნამდვილი გვერდი `source`-შია. ამიტომ წესი ფორმაზეა და არა engine-ზე:
     * თუ `source` სრული URL-ია, გვერდიც ისაა.
     *
     * @param  array<string, mixed>  $row
     * @return array{0: ?string, 1: ?string}
     */
    private function attribution(array $row): array
    {
        $source = $this->str($row['source'] ?? $row['source_name'] ?? null);
        $sourceUrl = $this->url($source);
        $link = $sourceUrl ?? $this->url($row['link'] ?? $row['source_link'] ?? null);

        $domain = $sourceUrl ? $this->host($sourceUrl) : ($source ?: $this->host($link));

        return [$link, $domain];
    }

    /** URL → დომენი `www.`-ის გარეშე (`Bookmark::applyUrl()`-ის იგივე წესი) */
    private function host(?string $url): ?string
    {
        if (! $url) {
            return null;
        }

        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        return $host === '' ? null : (string) preg_replace('~^www\.~', '', $host);
    }

    /**
     * ერთი ვიდეო პასუხიდან (§7.6.3).
     *
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>|null
     */
    private function video(array $row, string $engine): ?array
    {
        $link = $this->url($row['link'] ?? $row['url'] ?? null);

        // ⚠️ ლინკის გარეშე ერთეული უსარგებლოა — ვერც გაიხსნება და ვერც
        // შეინახება. `listSearch()` ასეთებს `dropped`-ში ითვლის, რომ „ცარიელ
        // შედეგად" არ იკითხებოდეს.
        if (! $link) {
            return null;
        }

        return [
            'engine' => $engine,
            'source' => 'serpapi:'.$engine,
            'title' => $this->str($row['title'] ?? null),
            'link' => $link,
            'channel' => $this->str($row['channel']['name'] ?? $row['channel'] ?? $row['author'] ?? null),
            'duration' => $this->seconds($row['length'] ?? $row['duration'] ?? null),
            'views' => is_numeric($row['views'] ?? null) ? (int) $row['views'] : null,
            'published' => $this->publishedDate($row['published_date'] ?? $row['publish_date'] ?? null),
            'thumbnail' => $this->url($row['thumbnail']['static'] ?? $row['thumbnail'] ?? null),
            'description' => $this->str($row['description'] ?? null),
        ];
    }

    /**
     * ფანჯრის დასაწყისი — `/account`-ის განახლების თარიღიდან ერთი თვით უკან,
     * ან კალენდარული თვის დასაწყისი, თუ თარიღი უცნობია.
     */
    private function windowStart(): Carbon
    {
        $account = $this->account();
        // ⚠️ ველს **`plan_renewal_date`** ჰქვია (გადამოწმებულია ცოცხალ პასუხზე
        // 2026-09-11); მეორე სახელი სათადარიგოა, თუ SerpApi-მ გადაარქვა.
        $renewal = $account['plan_renewal_date'] ?? $account['account_renewal_date'] ?? null;

        if (is_string($renewal) && $renewal !== '') {
            try {
                $date = Carbon::parse($renewal);

                // განახლების თარიღი მომავალშია → მიმდინარე ფანჯარა თვით უკან იწყება
                return $date->isFuture() ? $date->copy()->subMonthNoOverflow() : $date;
            } catch (Throwable) {
                // არასწორი თარიღი — ჩუმად კალენდარულ თვეზე გადავდივართ
            }
        }

        return now()->startOfMonth();
    }

    /** @param  array<string, mixed>  $params */
    private function fingerprint(string $engine, array $params): string
    {
        ksort($params);

        return sha1($engine.'|'.json_encode($params, JSON_UNESCAPED_UNICODE));
    }

    /** რამდენი ერთეული მოიტანა პასუხმა — მხოლოდ აღრიცხვისთვის */
    private function countRows(array $data): int
    {
        foreach (['images_results', 'image_results', 'video_results', 'videos_results', 'organic_results'] as $key) {
            if (is_array($data[$key] ?? null)) {
                return min(count($data[$key]), 65535);
            }
        }

        return 0;
    }

    private function str(mixed $value): ?string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return null;
        }

        $value = trim((string) $value);

        return $value === '' ? null : mb_substr($value, 0, 500);
    }

    /**
     * გამოქვეყნების თარიღი — **ყოველთვის `Y-m-d` ან `null`** (2026-09-13).
     *
     * ⚠️ **YouTube აბსოლუტურ თარიღს არ აბრუნებს**: `published_date`-ში
     * „9 months ago" წერია. ეს სტრიქონი პირდაპირ მიდიოდა
     * `POST /api/gallery/videos`-ზე, სადაც `published_at` `date`-ით
     * მოწმდება — ე.ი. **ნაპოვნი ვიდეოს შენახვა ყოველთვის 422-ით ვარდებოდა**
     * („ვიდეოს ძებნაც და გამოტანებიც არ მუშაობს"). გადამოწმებულია ცოცხლად.
     *
     * ⚠️ **ნორმალიზაცია აქაა და არა ფრონტში ან კონტროლერში** — engine-ის
     * თავისებურებას ეს კლასი ფარავს (იგივე წესი, რაც `query`/`results`
     * სვეტებზეა); ორ ადგილას გაწერილი წესი ერთ დღეს გაშორდებოდა.
     *
     * ⚠️ **თარიღი მიახლოებითია და სხვა გზა არ არის** — „9 months ago"-ს
     * დღეზე ზუსტი შესატყვისი არ აქვს. ან მიახლოებით ვინახავთ, ან ფაქტს
     * სრულიად ვკარგავთ; სვეტი სწორედ ამისთვის არსებობს.
     */
    private function publishedDate(mixed $value): ?string
    {
        $value = $this->str($value);

        if ($value === null) {
            return null;
        }

        // YouTube-ის ორი პრეფიქსი — `strtotime` მათზე იბნევა
        $value = preg_replace('~^(streamed|premiered)\s+~i', '', $value) ?? $value;

        try {
            $date = Carbon::parse($value);
        } catch (Throwable) {
            return null;
        }

        // ⚠️ `Carbon::parse('Kraken')` არ არსებობს, მაგრამ `Carbon::parse('2')`
        // დღევანდელი თვის მე-2 რიცხვია — რიცხვი თარიღად არ ითვლება
        return is_numeric($value) ? null : $date->toDateString();
    }

    /** ⚠️ მხოლოდ http(s) — `data:` და სხვა სქემები ჩვენთან არ შემოდის */
    private function url(mixed $value): ?string
    {
        $value = $this->str($value);

        if ($value === null) {
            return null;
        }

        $value = mb_substr($value, 0, 2000);

        return preg_match('~^https?://~i', $value) ? $value : null;
    }

    /** „12:34" / „1:02:03" → წამები (ვიდეოს მოდული წამებში ითვლის) */
    private function seconds(mixed $value): ?int
    {
        if (is_numeric($value)) {
            return max(0, (int) $value);
        }

        if (! is_string($value) || ! preg_match('~^(\d+:)?\d{1,2}:\d{2}$~', trim($value))) {
            return null;
        }

        $parts = array_map('intval', explode(':', trim($value)));
        $seconds = 0;

        foreach ($parts as $part) {
            $seconds = $seconds * 60 + $part;
        }

        return $seconds;
    }
}
