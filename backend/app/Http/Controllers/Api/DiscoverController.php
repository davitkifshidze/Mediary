<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Genre;
use App\Models\Movie;
use App\Models\Series;
use App\Services\Tmdb\TmdbClient;
use App\Support\Lang;
use App\Support\MediaDomain;
use App\Support\SourceLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Throwable;

class DiscoverController extends Controller
{
    private const SORTS = [
        'popularity' => 'popularity.desc',
        'rating' => 'vote_average.desc',
        'year_desc' => 'primary_release_date.desc',
        'year_asc' => 'primary_release_date.asc',
    ];

    // TV-ს discover-ს primary_release_date-ის ნაცვლად first_air_date აქვს
    private const TV_SORTS = [
        'popularity' => 'popularity.desc',
        'rating' => 'vote_average.desc',
        'year_desc' => 'first_air_date.desc',
        'year_asc' => 'first_air_date.asc',
    ];

    /** default სიღრმე; `max_pages`-ით იმართება (Tasks E3) */
    private const MAX_PAGES = 100;

    /** TMDB-ის მყარი ლიმიტი — `page` > 500 შეცდომას აბრუნებს */
    private const TMDB_MAX_PAGE = 500;

    /** TMDB თითო გვერდზე ფიქსირებულად 20 ჩანაწერს აბრუნებს */
    private const TMDB_PAGE_SIZE = 20;

    private const CACHE_TTL_HOURS = 6;

    /** TMDB discover/search — ჟანრი/წელი/რეიტინგი/სახელი; ქეშირებული; მონიშნავს უკვე დამატებულებს */
    public function index(Request $request, TmdbClient $tmdb)
    {
        if (! $tmdb->configured()) {
            return response()->json(['message' => 'tmdb_not_configured'], 503);
        }

        // query-string-ში boolean სტრიქონად მოდის ("true"/"1"/"yes") — ვანორმალებთ
        // ვალიდაციამდე, რომ `boolean` წესმა არ ჩააგდოს
        if ($request->has('refresh')) {
            $request->merge(['refresh' => $request->boolean('refresh')]);
        }

        $data = $request->validate([
            'type' => ['nullable', MediaDomain::rule()],
            'query' => ['nullable', 'string'],
            'genre' => ['nullable', 'string'],
            'year_min' => ['nullable', 'integer'],
            'year_max' => ['nullable', 'integer'],
            'rating_min' => ['nullable', 'numeric'],
            'rating_max' => ['nullable', 'numeric'],
            'sort' => ['nullable', 'string'],
            'page' => ['nullable', 'integer'],
            'refresh' => ['nullable', 'boolean'],
            // E3 — სიღრმე და გვერდის ზომა პარამეტრებიდან
            'max_pages' => ['nullable', 'integer', 'min:1', 'max:'.self::TMDB_MAX_PAGE],
            'per_page' => ['nullable', 'integer', 'min:'.self::TMDB_PAGE_SIZE, 'max:100'],
        ]);

        $type = $data['type'] ?? 'movie';
        // ⚠️ TMDB-ის `/tv/*`-ზე **ორი** დომენი ზის (§7.1): სერიალიც და ანიმეც,
        // ე.ი. „სერიალია თუ არა" აღარაა იგივე, რაც „TV-ა თუ არა"
        $isSeries = MediaDomain::isTv($type);
        $page = max(1, (int) ($data['page'] ?? 1));
        $query = trim($data['query'] ?? '');

        // ერთი „ჩვენების" გვერდი = `chunk` ცალი TMDB გვერდი (თითო 20 ჩანაწერი)
        $chunk = max(1, (int) round(((int) ($data['per_page'] ?? self::TMDB_PAGE_SIZE)) / self::TMDB_PAGE_SIZE));
        $maxPages = min((int) ($data['max_pages'] ?? self::MAX_PAGES), self::TMDB_MAX_PAGE);

        // ქეშის გასაღები — მხოლოდ TMDB-ზე მოქმედი პარამეტრები (owned დინამიურია)
        $cacheKey = 'discover:'.md5(json_encode([
            // ⚠️ ქეშის გასაღებში **დომენი** წერია და არა „tv/movie": ანიმესა და
            // სერიალს TMDB-ის იგივე პასუხი აქვთ, მაგრამ `owned` სხვადასხვა
            // ცხრილიდან მოდის — საერთო გასაღები ერთს მეორის ბიბლიოთეკას აჩვენებდა
            'type' => $type,
            'q' => $query,
            'genre' => $data['genre'] ?? null,
            'ymin' => $data['year_min'] ?? null,
            'ymax' => $data['year_max'] ?? null,
            'rmin' => $data['rating_min'] ?? null,
            'rmax' => $data['rating_max'] ?? null,
            'sort' => $data['sort'] ?? 'popularity',
            'page' => $page,
            'chunk' => $chunk,
            'max' => $maxPages,
        ]));

        if ($request->boolean('refresh')) {
            Cache::forget($cacheKey);
        }

        try {
            $payload = Cache::remember(
                $cacheKey,
                now()->addHours(self::CACHE_TTL_HOURS),
                fn () => $this->fetch($tmdb, $data, $query, $page, $isSeries, $chunk, $maxPages),
            );
        } catch (Throwable $e) {
            // SEC-14 — გამონაკლისის ტექსტი კლიენტს არასდრობ პასუხში: Guzzle მას სრულ URL-ს
            // (`?api_key=…`) უწერს. მიზეზი `sources.log`-ში რ჉ება, პასუხში — მანქანური კოდი.
            SourceLog::threw('tmdb', $e);

            return response()->json(['message' => 'tmdb_error'], 502);
        }

        // owned სტატუსი — ქეშის გარეთ, ყოველ ჯერზე ახალი
        $owned = MediaDomain::query($type)
            ->whereNotNull('tmdb_id')->pluck('id', 'tmdb_id');
        $results = array_map(function ($r) use ($owned) {
            $oid = $owned[$r['tmdb_id']] ?? null;
            $r['owned'] = $oid !== null;
            $r['movie_id'] = $oid; // owned ლოკალური ჩანაწერის id (movie ან series)

            return $r;
        }, $payload['results']);

        return response()->json([
            'page' => $payload['page'],
            'total_pages' => $payload['total_pages'],
            'results' => $results,
        ]);
    }

    /**
     * ერთი „ჩვენების" გვერდი: `chunk` ცალი TMDB გვერდის შერწყმა + ნორმალიზაცია
     * + ka სახელები. მთელი შედეგი ქეშში ინახება.
     */
    private function fetch(TmdbClient $tmdb, array $data, string $query, int $page, bool $isSeries, int $chunk, int $maxPages): array
    {
        $genreMap = Genre::whereNotNull('tmdb_id')->get()->keyBy('tmdb_id');
        $first = ($page - 1) * $chunk + 1;
        $tmdbTotal = 1;
        $out = [];

        for ($i = 0; $i < $chunk; $i++) {
            $tp = $first + $i;
            if ($tp > $maxPages) {
                break;
            }

            $res = $this->request($tmdb, $data, $query, $tp, $isSeries, 'en-US');
            $tmdbTotal = (int) ($res['total_pages'] ?? 1);

            // ქართული სახელები — TMDB-ის იმავე პასუხის ლოკალიზებული ვერსიიდან (`language=ka`).
            // Translator-ს (EN→KA) აქ განზრახ არ ვიძახებთ: აღმოჩენის სია ათეულია
            // და თითო სათაურზე თითო მოთხოვნა Gemini-ს დღიურ ლიმიტს უაზროდ გახარჯავდა.
            // თარგმანი ცალკე გვერდის (`/translations`) საქმეა და იქ ცხადად ირთვება.
            $kaTitles = [];
            try {
                $kaRes = $this->request($tmdb, $data, $query, $tp, $isSeries, 'ka');
                foreach ($kaRes['results'] ?? [] as $r) {
                    $kaTitles[$r['id']] = $isSeries ? ($r['name'] ?? null) : ($r['title'] ?? null);
                }
            } catch (Throwable $e) {
                // ka წამოღება არასავალდებულოა — ინგლისურით ვაგრძელებთ
            }

            foreach ($res['results'] ?? [] as $r) {
                if (empty($r['poster_path'])) {
                    continue;
                }
                $title = $isSeries
                    ? ($r['name'] ?? ($r['original_name'] ?? ''))
                    : ($r['title'] ?? ($r['original_title'] ?? ''));
                $date = $isSeries ? ($r['first_air_date'] ?? '') : ($r['release_date'] ?? '');
                $out[] = [
                    'tmdb_id' => $r['id'],
                    'title' => $title,
                    'title_ka' => Lang::georgian($kaTitles[$r['id']] ?? null),
                    'year' => ! empty($date) ? (int) substr($date, 0, 4) : null,
                    'rating' => isset($r['vote_average']) ? round((float) $r['vote_average'], 1) : null,
                    'poster' => 'https://image.tmdb.org/t/p/w342'.$r['poster_path'],
                    'overview' => $r['overview'] ?? null,
                    'genres' => $this->mapGenres($r['genre_ids'] ?? [], $genreMap),
                ];
            }

            if ($tp >= $tmdbTotal) {
                break;
            }
        }

        return [
            'page' => $page,
            'total_pages' => max(1, (int) ceil(min($tmdbTotal, $maxPages) / $chunk)),
            'results' => $out,
        ];
    }

    /** ერთი TMDB გამოძახება მითითებულ ენაზე (search ან discover) */
    private function request(TmdbClient $tmdb, array $data, string $query, int $page, bool $isSeries, string $language): array
    {
        if ($query !== '') {
            return $isSeries
                ? $tmdb->searchTvPaged($query, $page, null, $language)
                : $tmdb->searchMoviesPaged($query, $page, null, $language);
        }

        $sorts = $isSeries ? self::TV_SORTS : self::SORTS;
        $dateKey = $isSeries ? 'first_air_date' : 'primary_release_date';
        $params = [
            'page' => $page,
            'sort_by' => $sorts[$data['sort'] ?? 'popularity'] ?? $sorts['popularity'],
            'language' => $language,
        ];
        if (! empty($data['genre'])) {
            $g = Genre::where('slug', $data['genre'])->whereNotNull('tmdb_id')->first();
            if ($g) {
                $params['with_genres'] = $g->tmdb_id;
            }
        }
        if (! empty($data['year_min'])) {
            $params["{$dateKey}.gte"] = $data['year_min'].'-01-01';
        }
        if (! empty($data['year_max'])) {
            $params["{$dateKey}.lte"] = $data['year_max'].'-12-31';
        }
        if (! empty($data['rating_min'])) {
            $params['vote_average.gte'] = $data['rating_min'];
            $params['vote_count.gte'] = 50;
        }
        if (! empty($data['rating_max'])) {
            $params['vote_average.lte'] = $data['rating_max'];
        }

        return $isSeries ? $tmdb->discoverTv($params) : $tmdb->discover($params);
    }

    /** TMDB genre_ids → ლოკალური ჟანრების ორენოვანი სახელები */
    private function mapGenres(array $ids, $genreMap): array
    {
        $out = [];
        foreach ($ids as $gid) {
            if ($g = $genreMap->get($gid)) {
                $out[] = ['name_en' => $g->name_en, 'name_ka' => $g->name_ka];
            }
        }

        return $out;
    }
}
