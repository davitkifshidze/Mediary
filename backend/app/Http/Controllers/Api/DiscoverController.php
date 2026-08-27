<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Genre;
use App\Models\Movie;
use App\Models\Series;
use App\Services\Tmdb\TmdbClient;
use App\Services\Translation\Translator;
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

    private const MAX_PAGES = 100;

    private const CACHE_TTL_HOURS = 6;

    /** TMDB discover/search — ჟანრი/წელი/რეიტინგი/სახელი; ქეშირებული; მონიშნავს უკვე დამატებულებს */
    public function index(Request $request, TmdbClient $tmdb, Translator $translator)
    {
        if (! $tmdb->configured()) {
            return response()->json(['message' => 'TMDB_API_KEY არ არის კონფიგურირებული.'], 503);
        }

        $data = $request->validate([
            'type' => ['nullable', 'in:movie,series'],
            'query' => ['nullable', 'string'],
            'genre' => ['nullable', 'string'],
            'year_min' => ['nullable', 'integer'],
            'year_max' => ['nullable', 'integer'],
            'rating_min' => ['nullable', 'numeric'],
            'rating_max' => ['nullable', 'numeric'],
            'sort' => ['nullable', 'string'],
            'page' => ['nullable', 'integer'],
            'refresh' => ['nullable', 'boolean'],
        ]);

        $isSeries = ($data['type'] ?? 'movie') === 'series';
        $page = max(1, (int) ($data['page'] ?? 1));
        $query = trim($data['query'] ?? '');

        // ქეშის გასაღები — მხოლოდ TMDB-ზე მოქმედი პარამეტრები (owned დინამიურია)
        $cacheKey = 'discover:'.md5(json_encode([
            'type' => $isSeries ? 'series' : 'movie',
            'q' => $query,
            'genre' => $data['genre'] ?? null,
            'ymin' => $data['year_min'] ?? null,
            'ymax' => $data['year_max'] ?? null,
            'rmin' => $data['rating_min'] ?? null,
            'rmax' => $data['rating_max'] ?? null,
            'sort' => $data['sort'] ?? 'popularity',
            'page' => $page,
        ]));

        if ($request->boolean('refresh')) {
            Cache::forget($cacheKey);
        }

        try {
            $payload = Cache::remember(
                $cacheKey,
                now()->addHours(self::CACHE_TTL_HOURS),
                fn () => $this->fetch($tmdb, $translator, $data, $query, $page, $isSeries),
            );
        } catch (Throwable $e) {
            return response()->json(['message' => 'TMDB შეცდომა: '.$e->getMessage()], 502);
        }

        // owned სტატუსი — ქეშის გარეთ, ყოველ ჯერზე ახალი
        $owned = ($isSeries ? Series::query() : Movie::query())
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

    /** TMDB-ს გამოძახება + ნორმალიზაცია + ka თარგმანი (ეს ინახება ქეშში) */
    private function fetch(TmdbClient $tmdb, Translator $translator, array $data, string $query, int $page, bool $isSeries): array
    {
        if ($query !== '') {
            $res = $isSeries ? $tmdb->searchTvPaged($query, $page) : $tmdb->searchMoviesPaged($query, $page);
        } else {
            $sorts = $isSeries ? self::TV_SORTS : self::SORTS;
            $dateKey = $isSeries ? 'first_air_date' : 'primary_release_date';
            $params = [
                'page' => $page,
                'sort_by' => $sorts[$data['sort'] ?? 'popularity'] ?? $sorts['popularity'],
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
            $res = $isSeries ? $tmdb->discoverTv($params) : $tmdb->discover($params);
        }

        $genreMap = Genre::whereNotNull('tmdb_id')->get()->keyBy('tmdb_id');
        $out = [];
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
                'year' => ! empty($date) ? (int) substr($date, 0, 4) : null,
                'rating' => isset($r['vote_average']) ? round((float) $r['vote_average'], 1) : null,
                'poster' => 'https://image.tmdb.org/t/p/w342'.$r['poster_path'],
                'overview' => $r['overview'] ?? null,
                'genres' => $this->mapGenres($r['genre_ids'] ?? [], $genreMap),
            ];
        }

        if ($out) {
            $ka = $translator->toGeorgianBatch(array_column($out, 'title'));
            foreach ($out as $i => &$s) {
                $s['title_ka'] = $ka[$i] ?? null;
            }
            unset($s);
        }

        return [
            'page' => $res['page'] ?? 1,
            'total_pages' => min($res['total_pages'] ?? 1, self::MAX_PAGES),
            'results' => $out,
        ];
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
