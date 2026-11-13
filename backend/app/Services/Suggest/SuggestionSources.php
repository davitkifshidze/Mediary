<?php

namespace App\Services\Suggest;

use App\Models\SuggestionSource;
use App\Services\Tmdb\TmdbClient;
use App\Support\Lang;
use Illuminate\Http\Client\RequestException;
use Throwable;

/**
 * **გარე წყაროების პასუხები „შემოთავაზებებისთვის" — ერთი მკითხველი და ერთი მწერალი.**
 *
 * ყოველი პასუხი `suggestion_sources`-ში ინახება TMDB-ის id-ით და **ყველა ანგარიშს**
 * ემსახურება: ერთი სათაური წყაროს ერთხელ ეკითხება, მეორე გახსნა კი ბაზიდან იკითხება.
 *
 * სათაურის მოკლე აღწერას (`summary()`) ერთი ფორმა აქვს, საიდანაც არ უნდა მოვიდეს —
 * TMDB-ის სიიდან, ძებნიდან თუ დეტალებიდან; `poster` TMDB-ის CDN-ის ფარდობითი გზაა.
 *
 * ⚠️ ჩავარდნას ეს კლასი არ მალავს — გამონაკლისი გამომძახებელთან ადის: TMDB-ის
 * ჩავარდნა გვერდს აჩერებს (503), დამატებითი წყაროსი — არა (`SuggestionEngine`).
 * ერთადერთი გამონაკლისი 404-ია: „TMDB-ზე ასეთი სათაური აღარ არის" ცარიელ პასუხად
 * ინახება, თორემ ერთი წაშლილი სათაური მთელ გვერდს ყოველ გახსნაზე ჩააგდებდა.
 */
class SuggestionSources
{
    /** რამდენ ხანს ითვლება პასუხი ახლად — რეკომენდაციები ნელა იცვლება */
    public const TTL_DAYS = 30;

    /** TMDB-ის ჟანრი „Animation" */
    public const ANIMATION = 16;

    /** Trakt-ის `related`-ის სიგრძე ერთ სათაურზე */
    private const TRAKT_LIMIT = 10;

    public function __construct(
        private readonly TmdbClient $tmdb,
        private readonly TraktClient $trakt,
        private readonly AniListClient $anilist,
    ) {}

    /**
     * ქეშში მდგომი პასუხები: `[წყარო][tmdb_id] => payload`. მოძველებული რიგი არ ბრუნდება
     * (სათაურის მოკლე აღწერა არ ძველდება).
     *
     * @param  list<int>  $tmdbIds
     * @param  list<string>  $sources
     * @return array<string, array<int, array<string, mixed>>>
     */
    public function cached(string $kind, array $tmdbIds, array $sources): array
    {
        $out = array_fill_keys($sources, []);
        $fresh = now()->subDays(self::TTL_DAYS);

        foreach (array_chunk(array_values(array_unique($tmdbIds)), 500) as $chunk) {
            $rows = SuggestionSource::query()
                ->where('kind', $kind)
                ->whereIn('source', $sources)
                ->whereIn('tmdb_id', $chunk)
                ->get();

            foreach ($rows as $row) {
                if ($row->source !== SuggestionSource::TITLE && $row->fetched_at && $row->fetched_at->lt($fresh)) {
                    continue;
                }

                $out[$row->source][$row->tmdb_id] = (array) $row->payload;
            }
        }

        return $out;
    }

    /**
     * სათაურის მსგავსების მასალა TMDB-დან: რეკომენდაციები, მსგავსი სათაურები, საკვანძო
     * სიტყვები, ჟანრები და აღწერა. ორი მოთხოვნაა — მეორე ქართულ სახელებს მოაქვს.
     *
     * @return array<string, mixed>
     */
    public function fetchTmdb(string $kind, int $tmdbId): array
    {
        $tv = $kind === 'tv';

        try {
            $main = $this->tmdb->related($tmdbId, $tv);
        } catch (RequestException $e) {
            if ($e->response->status() !== 404) {
                throw $e;
            }

            return $this->store(SuggestionSource::TMDB, $kind, $tmdbId, ['related' => [], 'titles' => [], 'keywords' => [], 'genres' => []]);
        }

        // ქართული სახელები — იმავე სიების ლოკალიზებული პასუხიდან; არ მოვიდა — ინგლისურით ვაგრძელებთ
        $ka = [];
        try {
            $localized = $this->tmdb->related($tmdbId, $tv, 'ka', 'recommendations,similar');

            foreach (['recommendations', 'similar'] as $list) {
                foreach ($localized[$list]['results'] ?? [] as $row) {
                    $ka[(int) ($row['id'] ?? 0)] ??= $tv ? ($row['name'] ?? null) : ($row['title'] ?? null);
                }
            }
        } catch (Throwable) {
            $ka = [];
        }

        $related = [];
        $titles = [];

        foreach (['recommendations', 'similar'] as $via) {
            foreach ($main[$via]['results'] ?? [] as $row) {
                $summary = self::summary($row, $tv, $ka[(int) ($row['id'] ?? 0)] ?? null);

                if (! $summary || $summary['tmdb_id'] === $tmdbId) {
                    continue;
                }

                $id = $summary['tmdb_id'];
                $titles[$id] ??= $summary;
                $related[$id] ??= ['id' => $id, 'via' => []];
                $related[$id]['via'][] = $via;
            }
        }

        $keywords = [];
        foreach ($main['keywords'][$tv ? 'results' : 'keywords'] ?? [] as $keyword) {
            if (isset($keyword['id'], $keyword['name'])) {
                $keywords[] = ['id' => (int) $keyword['id'], 'name' => (string) $keyword['name']];
            }
        }

        $own = self::summary($main, $tv) ?? [];

        return $this->store(SuggestionSource::TMDB, $kind, $tmdbId, [
            'title' => $own['title'] ?? null,
            'overview' => $own['overview'] ?? null,
            'genres' => $own['genres'] ?? [],
            'keywords' => $keywords,
            'related' => array_values($related),
            'titles' => $titles,
        ]);
    }

    /**
     * Trakt-ის მსგავსი სათაურები — TMDB-ის id-ებით (სხვა არაფერი მოაქვს).
     *
     * @return array<string, mixed>
     */
    public function fetchTrakt(string $kind, int $tmdbId, ?string $imdbId): array
    {
        return $this->store(SuggestionSource::TRAKT, $kind, $tmdbId, [
            'related' => $this->trakt->related($kind === 'tv', $tmdbId, $imdbId, self::TRAKT_LIMIT),
        ]);
    }

    /**
     * AniList-ის რეკომენდაციები, **TMDB-თან დაკავშირებული**: თითო სათაური სახელით იძებნება
     * TMDB-ის სერიალებში და მხოლოდ იაპონური ანიმაცია ითვლება ნაპოვნად. ვერდაკავშირებული
     * იყრება — სხვა სათაურის ჩვენებას არაფრის ჩვენება სჯობს.
     *
     * @return array<string, mixed>
     */
    public function fetchAniList(int $tmdbId, string $title): array
    {
        $related = [];
        $titles = [];

        foreach ($this->anilist->recommendations($title) as $pick) {
            $row = $this->findAnime($pick['title'], $pick['year'])
                ?? ($pick['alt'] ? $this->findAnime($pick['alt'], $pick['year']) : null);
            $summary = $row ? self::summary($row, true) : null;

            if (! $summary || $summary['tmdb_id'] === $tmdbId || isset($titles[$summary['tmdb_id']])) {
                continue;
            }

            $titles[$summary['tmdb_id']] = $summary;
            $related[] = ['tmdb_id' => $summary['tmdb_id'], 'title' => $summary['title'], 'year' => $summary['year']];
        }

        return $this->store(SuggestionSource::ANILIST, 'tv', $tmdbId, ['related' => $related, 'titles' => $titles]);
    }

    /**
     * ერთი სათაურის მოკლე აღწერა TMDB-ის დეტალებიდან — მისთვის, რაც მხოლოდ დამატებითმა
     * წყარომ მოიტანა (id აქვს, პოსტერი, ჟანრები და აღწერა — არა).
     *
     * @return array<string, mixed> ცარიელი — TMDB-ზე ასეთი სათაური არ არის
     */
    public function fetchTitle(string $kind, int $tmdbId): array
    {
        $tv = $kind === 'tv';

        try {
            $row = $tv ? $this->tmdb->tvDetails($tmdbId) : $this->tmdb->details($tmdbId);
        } catch (RequestException $e) {
            if ($e->response->status() !== 404) {
                throw $e;
            }

            $row = [];
        }

        return $this->store(SuggestionSource::TITLE, $kind, $tmdbId, self::summary($row, $tv) ?? []);
    }

    /**
     * „თავიდან" — ამ სათაურების წყაროს პასუხები იშლება და შემდეგი წაკითხვა წყაროს ეკითხება.
     *
     * @param  list<int>  $tmdbIds
     */
    public function forget(string $kind, array $tmdbIds): void
    {
        if ($tmdbIds === []) {
            return;
        }

        SuggestionSource::query()
            ->where('kind', $kind)
            ->whereIn('source', [SuggestionSource::TMDB, SuggestionSource::TRAKT, SuggestionSource::ANILIST])
            ->whereIn('tmdb_id', $tmdbIds)
            ->delete();
    }

    /**
     * სათაურის მოკლე აღწერა TMDB-ის რიგიდან (სიის ელემენტი, ძებნის შედეგი ან დეტალები).
     *
     * @return array{tmdb_id: int, title: string, title_ka: ?string, year: ?int, rating: ?float, poster: ?string, overview: ?string, genres: list<int>, countries: list<string>}|null
     */
    public static function summary(array $row, bool $tv, ?string $titleKa = null): ?array
    {
        $id = (int) ($row['id'] ?? 0);
        $title = trim((string) ($tv
            ? ($row['name'] ?? $row['original_name'] ?? '')
            : ($row['title'] ?? $row['original_title'] ?? '')));

        if ($id <= 0 || $title === '') {
            return null;
        }

        $date = (string) ($tv ? ($row['first_air_date'] ?? '') : ($row['release_date'] ?? ''));
        // სიის ელემენტს `genre_ids` აქვს, დეტალებს — `genres`
        $genres = $row['genre_ids'] ?? array_column((array) ($row['genres'] ?? []), 'id');
        $rating = (float) ($row['vote_average'] ?? 0);

        return [
            'tmdb_id' => $id,
            'title' => $title,
            'title_ka' => Lang::georgian($titleKa),
            'year' => strlen($date) >= 4 ? (int) substr($date, 0, 4) : null,
            'rating' => $rating > 0 ? round($rating, 1) : null,
            'poster' => ! empty($row['poster_path']) ? (string) $row['poster_path'] : null,
            'overview' => trim((string) ($row['overview'] ?? '')) ?: null,
            'genres' => array_values(array_map('intval', (array) $genres)),
            'countries' => array_values(array_map('strval', (array) ($row['origin_country'] ?? []))),
        ];
    }

    /** იაპონური ანიმაცია — TMDB ანიმეს ცალკე ტიპად არ იცნობს (`MediaTypeHint`-ის წესი) */
    public static function isAnime(array $summary): bool
    {
        return in_array(self::ANIMATION, $summary['genres'] ?? [], true)
            && in_array('JP', $summary['countries'] ?? [], true);
    }

    /**
     * სახელით ნაპოვნი იაპონური ანიმაცია TMDB-ის სერიალებში; რამდენიმედან — იმავე წლისა.
     *
     * ⚠️ წელი ძებნას არ ავიწროებს: AniList სეზონებს ცალ-ცალკე ითვლის, TMDB-ზე კი სერიალი
     * ერთია და მისი წელი პირველი სეზონისაა — წლით ძებნა გაგრძელებებს ვერ იპოვიდა.
     *
     * @return array<string, mixed>|null
     */
    private function findAnime(string $title, ?int $year): ?array
    {
        $found = null;

        foreach ($this->tmdb->searchAllTv($title) as $row) {
            $summary = self::summary($row, true);

            if (! $summary || ! self::isAnime($summary)) {
                continue;
            }

            if ($year !== null && $summary['year'] === $year) {
                return $row;
            }

            $found ??= $row;
        }

        return $found;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function store(string $source, string $kind, int $tmdbId, array $payload): array
    {
        SuggestionSource::updateOrCreate(
            ['source' => $source, 'kind' => $kind, 'tmdb_id' => $tmdbId],
            ['payload' => $payload, 'fetched_at' => now()],
        );

        return $payload;
    }
}
