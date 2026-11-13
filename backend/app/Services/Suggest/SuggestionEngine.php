<?php

namespace App\Services\Suggest;

use App\Models\HiddenSuggestion;
use App\Models\SuggestionSource;
use App\Models\SuggestionVector;
use App\Models\User;
use App\Services\Tmdb\TmdbClient;
use App\Support\MediaDomain;
use App\Support\RichText;
use App\Support\SourceLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * **„შემოთავაზებები" — მსგავსი სათაურები ჩემი არჩევანის მიხედვით.**
 *
 * საფუძველი ჩემი სათაურებია (`SuggestionBasis`); კანდიდატი ორი მხრიდან მოდის:
 *  · **გარედან** — რასაც წყაროები საფუძვლის მსგავსად ასახელებენ: TMDB (რეკომენდაციები და
 *    მსგავსი სათაურები), Trakt (ფილმი, სერიალი), AniList (ანიმე), პლუს TMDB-ის `discover`
 *    საფუძვლების ყველაზე ხშირი საკვანძო სიტყვებით;
 *  · **ჩემი სიიდან** — იმავე მოდულის ჩანაწერები, რომლებიც საფუძველში არ არის და ნანახი
 *    არ არის.
 * ორივე ერთი ქულით ფასდება: რამდენმა საფუძველმა მიუთითა (`3×`), სიუჟეტის სიახლოვე
 * (`2×`, აღწერების ვექტორებით), საერთო ჟანრები და საკვანძო სიტყვები (თითო `1×`);
 * TMDB-ის რეიტინგი მხოლოდ ტოლ ქულებს ყოფს. „რატომ" ამავე ფაქტებისგან დგება — მოდელის
 * დაწერილი ტექსტი აქ არ არის.
 *
 * ⚠️ **ერთი მოთხოვნა შეზღუდულ სამუშაოს ასრულებს** (`BUDGET`): პირველ გაშვებაზე თითო
 * საფუძველს წყარო ცალკე ეკითხება, ერთნაკადიან სერვერზე კი გრძელი მოთხოვნა ყველაფერს
 * აჩერებს. სანამ მასალა სრული არ არის, პასუხი `ready: false`-ია პროგრესით და გვერდი
 * იმავე მოთხოვნას იმეორებს; ყველაფერი ქეშში რჩება, ამიტომ მეორე გახსნა მყისიერია.
 *
 * ⚠️ **დამატებითი წყაროს ჩავარდნა გვერდს არ აჩერებს**: მიზეზი `sources.log`-ში იწერება,
 * წყარო `DOWN_MINUTES` წუთით გამოითიშება (გამეორება იმავე შეცდომას მიიღებდა) და პასუხი
 * ამას ამბობს (`sources`). TMDB ხერხემალია — მისი ჩავარდნა გამომძახებელთან ადის.
 *
 * ⚠️ ჩაკეტილი ჩანაწერი არსად ჩანს — არც „ჩემი სიიდან", არც „ახლად" (ის უკვე მაქვს);
 * ურნაში მყოფიც „ახალი" არ არის.
 */
class SuggestionEngine
{
    /** ერთი მოთხოვნის გარე გამოძახებების ჭერი (ერთეულებში — იხ. `COST_*`) */
    public const BUDGET = 16;

    private const COST_TMDB = 2;

    private const COST_TRAKT = 1;

    /** ერთი მოთხოვნა AniList-ზე და თითო რეკომენდაციაზე ძებნა TMDB-ზე */
    private const COST_ANILIST = 9;

    private const COST_TITLE = 1;

    private const COST_DISCOVER = 1;

    /** ვექტორების ერთი პარტია — ასამდე ტექსტი ერთ მოთხოვნაში */
    private const COST_EMBED = 8;

    /** `discover` საფუძვლების რამდენი საკვანძო სიტყვით ეშვება */
    private const KEYWORDS = 3;

    /**
     * ვექტორი ითვლება მხოლოდ საუკეთესო კანდიდატებზე — დანარჩენს სიუჟეტის ქულა არ აქვს.
     * ⚠️ რიცხვები Gemini-ის უფასო დონიდან მოდის: წუთში ~100 აღწერა (ცოცხალი გაზომვა —
     * მეორე პარტიას 429 ხვდება). რამდენიმე საფუძველთან ერთად ეს ერთ პარტიაში ეტევა.
     */
    private const SHORTLIST_NEW = 60;

    private const SHORTLIST_MINE = 36;

    /** პარტიებს შორის პაუზა — წუთობრივი ლიმიტის ფანჯარა */
    private const EMBED_PAUSE_SECONDS = 60;

    /** ლიმიტზე (429) წყარო ამდენი წამით ისვენებს — სხვა ჩავარდნაზე `DOWN_MINUTES` */
    private const RATE_LIMIT_SECONDS = 70;

    /** ერთი მოთხოვნის დროის ჭერი (წამი): წყაროს ერთი გამოძახება ქსელზე ~1 წამია */
    private const TIME_BUDGET = 8.0;

    /** TMDB-ის `similar` ჟანრებითა და საკვანძო სიტყვებით დგება და ხმაურიანია — ნახევარი ხმა */
    private const SIMILAR_VOTE = 0.5;

    /** ჩემი სათაური პირდაპირი სიგნალის გარეშე ჩანს მხოლოდ მაშინ, თუ სიუჟეტით ზედა ნახევარშია */
    private const PLOT_ALONE = 0.5;

    private const DOWN_MINUTES = 10;

    private const DISCOVER_DAYS = 7;

    private int $spent = 0;

    private float $startedAt = 0.0;

    public function __construct(
        private readonly SuggestionSources $sources,
        private readonly TmdbClient $tmdb,
        private readonly TraktClient $trakt,
        private readonly PlotEmbedder $embedder,
    ) {}

    /**
     * @param  Collection<int, Model>  $basis  საფუძვლის ჩანაწერები (`SuggestionBasis::resolve()`)
     * @return array{ready: bool, progress: ?array{stage: string, done: int, total: int}, sources: array<string, string>, candidates?: list<array<string, mixed>>, plot?: array{vectors: int, missing: int}}
     */
    public function run(User $user, string $type, Collection $basis, bool $refresh = false): array
    {
        $this->spent = 0;
        $this->startedAt = microtime(true);

        $kind = MediaDomain::isTv($type) ? 'tv' : 'movie';
        $userId = (int) $user->getKey();
        $basisIds = $basis->pluck('tmdb_id')->map(fn ($id) => (int) $id)->unique()->values()->all();

        if ($refresh) {
            $this->sources->forget($kind, $basisIds);
            // საკვანძო სიტყვების სიები ცალკე ქეშშია და მათი რიგი შეიძლება სხვა მოთხოვნაში დადგეს
            Cache::put($this->refreshKey($userId, $type), true, now()->addMinutes(self::DOWN_MINUTES));
        }

        if ($basis->isEmpty()) {
            return $this->done($type, $userId, [], ['vectors' => 0, 'missing' => 0]);
        }

        // ჩემი ბიბლიოთეკა: ხილული ჩანაწერები (კანდიდატები) და ყველა id, რაც უკვე მაქვს
        $library = MediaDomain::query($type)->withoutLocked()->whereNotNull('tmdb_id')->with('genres')->get()
            ->keyBy(fn (Model $record) => (int) $record->tmdb_id);
        $owned = MediaDomain::query($type)
            ->withoutGlobalScope('record_lock')
            ->withoutGlobalScope('trash')
            ->whereNotNull('tmdb_id')
            ->pluck('tmdb_id')
            ->mapWithKeys(fn ($id) => [(int) $id => true])
            ->all();

        $extras = $type === 'anime' ? [SuggestionSource::ANILIST] : [SuggestionSource::TRAKT];
        $cached = $this->sources->cached($kind, $basisIds, [SuggestionSource::TMDB, ...$extras]);

        if ($progress = $this->fetchSources($basis, $kind, $type, $userId, $cached)) {
            return $this->waiting($type, $userId, $progress);
        }

        /* სათაურების მოკლე აღწერები — ყველა წყაროს პასუხიდან */
        $summaries = [];
        $votes = [];

        foreach ($basis as $record) {
            $tmdbId = (int) $record->tmdb_id;
            $recordId = (int) $record->getKey();

            foreach ([SuggestionSource::TMDB, ...$extras] as $source) {
                $payload = $cached[$source][$tmdbId] ?? [];

                foreach ($payload['titles'] ?? [] as $id => $summary) {
                    $summaries[(int) $id] ??= $summary;
                }

                foreach ($payload['related'] ?? [] as $row) {
                    $onlySimilar = $source === SuggestionSource::TMDB && ! in_array('recommendations', $row['via'] ?? [], true);
                    $votes[(int) ($row['id'] ?? $row['tmdb_id'] ?? 0)][$recordId][$source] = $onlySimilar ? self::SIMILAR_VOTE : 1.0;
                }
            }
        }

        unset($votes[0]);

        // რაც მხოლოდ დამატებითმა წყარომ მოიტანა და ჩემს ბიბლიოთეკაში არ არის — TMDB-დან
        $unknown = array_values(array_filter(
            array_keys($votes),
            fn (int $id) => ! isset($summaries[$id]) && ! isset($owned[$id]) && ! in_array($id, $basisIds, true),
        ));
        $titles = $this->sources->cached($kind, $unknown, [SuggestionSource::TITLE])[SuggestionSource::TITLE];

        foreach ($unknown as $i => $id) {
            if (! isset($titles[$id])) {
                if ($this->over()) {
                    return $this->waiting($type, $userId, ['stage' => 'titles', 'done' => $i, 'total' => count($unknown)]);
                }

                $titles[$id] = $this->sources->fetchTitle($kind, $id);
                $this->spent += self::COST_TITLE;
            }

            if ($titles[$id]) {
                $summaries[$id] = $titles[$id];
            }
        }

        /* ჟანრების პროფილი და საკვანძო სიტყვები — საფუძვლის TMDB-პასუხებიდან */
        $payloads = [];
        foreach ($basisIds as $id) {
            $payloads[$id] = $cached[SuggestionSource::TMDB][$id] ?? [];
        }

        $weights = $this->genreWeights($payloads);
        $top = array_slice(array_keys($weights), 0, 3);
        $keywords = $this->topKeywords($payloads);

        $hits = [];
        $lists = $this->discoverLists($type, $userId, $keywords, array_slice($top, 0, 2));

        if ($lists === null) {
            return $this->waiting($type, $userId, ['stage' => 'keywords', 'done' => 0, 'total' => count($keywords)]);
        }

        foreach ($lists as $name => $rows) {
            foreach ($rows as $summary) {
                $summaries[(int) $summary['tmdb_id']] ??= $summary;
                $hits[(int) $summary['tmdb_id']][$name] = true;
            }
        }

        /* კანდიდატები */
        $hidden = HiddenSuggestion::query()->where('user_id', $userId)->where('type', $type)->pluck('tmdb_id')
            ->mapWithKeys(fn ($id) => [(int) $id => true])->all();
        $basisRecords = $basis->mapWithKeys(fn (Model $record) => [(int) $record->getKey() => true])->all();
        $denominator = array_sum(array_map(fn (int $id) => $weights[$id], $top));
        $candidates = [];

        foreach (array_unique([...array_keys($votes), ...array_keys($hits), ...$library->keys()->all()]) as $id) {
            if (in_array($id, $basisIds, true)) {
                continue;
            }

            $record = $library->get($id);
            $summary = $summaries[$id] ?? null;

            if ($record) {
                // საფუძველში მყოფი და უკვე ნანახი ჩანაწერი შემოთავაზება არ არის
                if (isset($basisRecords[(int) $record->getKey()]) || $record->status_role === 'done') {
                    continue;
                }

                $genres = $record->genres->pluck('tmdb_id')->filter()->map(fn ($g) => (int) $g)->values()->all();
            } elseif (isset($owned[$id]) || ! $summary || empty($summary['poster']) || ! $this->fits($type, $summary)) {
                // უკვე მაქვს (ჩაკეტილი ან ურნაში), TMDB-ზე ვერ დაკავშირდა, ან სხვა მოდულისაა
                continue;
            } else {
                $genres = $summary['genres'];
            }

            $weight = 0.0;
            foreach ($votes[$id] ?? [] as $from) {
                // ერთი საფუძველი — ერთი ხმა (მისი ყველაზე ძლიერი წყაროსი); სხვა წყაროს თანხმობა მას ამყარებს
                $weight += max($from) + 0.25 * (count($from) - 1);
            }
            $pointed = array_map('array_keys', $votes[$id] ?? []);

            $candidates[$id] = [
                'tmdb_id' => $id,
                'record' => $record,
                'summary' => $summary,
                'hidden' => ! $record && isset($hidden[$id]),
                'votes' => $pointed,
                'weight' => $weight,
                'keywords' => array_keys($hits[$id] ?? []),
                'genre_ids' => $genres,
                'shared' => array_values(array_intersect($top, $genres)),
                'affinity' => $denominator > 0
                    ? min(1.0, array_sum(array_map(fn (int $g) => $weights[$g] ?? 0.0, $genres)) / $denominator)
                    : 0.0,
                'year' => $record ? $record->year : $summary['year'],
                'rating' => $record ? ($record->rating !== null ? (float) $record->rating : null) : $summary['rating'],
                'plot' => null,
            ];
        }

        $maxWeight = max([1.0, ...array_column($candidates, 'weight')]);

        foreach ($candidates as $id => $row) {
            $candidates[$id]['signals'] = 3 * ($row['weight'] / $maxWeight)
                + $row['affinity']
                + ($keywords ? count($row['keywords']) / count($keywords) : 0.0);
        }

        /* სიუჟეტის სიახლოვე — აღწერების ვექტორებით */
        $plot = $this->plot($kind, $userId, $basis, $payloads, $candidates);

        if (isset($plot['waiting'])) {
            return $this->waiting($type, $userId, ['stage' => 'plot', ...$plot['waiting']]);
        }

        $ranked = [];

        foreach ($candidates as $id => $row) {
            $near = $plot['near'][$id] ?? null;
            $closeness = $near ? $near['closeness'] : 0.0;
            $direct = $row['weight'] > 0 || $row['keywords'];

            // ჩემი სათაური, რომელზეც არცერთმა წყარომ არ მიუთითა: მხოლოდ ჟანრი საკმარისი არ არის
            if ($row['record'] && ! $direct && $closeness < self::PLOT_ALONE) {
                continue;
            }

            $row['plot'] = $near ? ['record' => $near['record'], 'match' => $near['match']] : null;
            $row['score'] = $row['signals'] + 2 * $closeness;
            $ranked[] = $row;
        }

        usort($ranked, fn (array $a, array $b) => [$b['score'], $b['rating'] ?? 0.0, $a['tmdb_id']] <=> [$a['score'], $a['rating'] ?? 0.0, $b['tmdb_id']]);

        return $this->done($type, $userId, $ranked, ['vectors' => $plot['vectors'], 'missing' => $plot['missing']]);
    }

    /**
     * საფუძვლების მასალა წყაროებიდან — რაც ქეშში არ არის.
     *
     * @param  array<string, array<int, array<string, mixed>>>  $cached  ივსება ადგილზე
     * @return array{stage: string, done: int, total: int}|null პროგრესი, თუ ბიუჯეტი ამოიწურა
     */
    private function fetchSources(Collection $basis, string $kind, string $type, int $userId, array &$cached): ?array
    {
        $trakt = $type !== 'anime' && $this->trakt->configured() && ! Cache::has($this->downKey('trakt', $userId));
        $anilist = $type === 'anime' && ! Cache::has($this->downKey('anilist'));
        $done = 0;
        $waiting = ['stage' => 'sources', 'done' => 0, 'total' => $basis->count()];

        foreach ($basis as $record) {
            $id = (int) $record->tmdb_id;
            $waiting['done'] = $done;

            if (! isset($cached[SuggestionSource::TMDB][$id])) {
                if ($this->over()) {
                    return $waiting;
                }

                $cached[SuggestionSource::TMDB][$id] = $this->sources->fetchTmdb($kind, $id);
                $this->spent += self::COST_TMDB;
            }

            if ($trakt && ! isset($cached[SuggestionSource::TRAKT][$id])) {
                if ($this->over()) {
                    return $waiting;
                }

                $this->spent += self::COST_TRAKT;

                try {
                    $cached[SuggestionSource::TRAKT][$id] = $this->sources->fetchTrakt($kind, $id, $record->imdb_id ?: null);
                } catch (Throwable $e) {
                    $trakt = $this->down('trakt', $e, $userId);
                }
            }

            if ($anilist && ! isset($cached[SuggestionSource::ANILIST][$id])) {
                if ($this->over()) {
                    return $waiting;
                }

                $this->spent += self::COST_ANILIST;
                $title = (string) ($record->title_en ?: ($cached[SuggestionSource::TMDB][$id]['title'] ?? ''));

                try {
                    $cached[SuggestionSource::ANILIST][$id] = $this->sources->fetchAniList($id, $title);
                } catch (Throwable $e) {
                    $anilist = $this->down('anilist', $e);
                }
            }

            $done++;
        }

        return null;
    }

    /**
     * ჟანრის წონა — საფუძვლების რა ნაწილს აქვს ეს ჟანრი; ხშირიდან იშვიათისკენ.
     *
     * @param  array<int, array<string, mixed>>  $payloads
     * @return array<int, float>
     */
    private function genreWeights(array $payloads): array
    {
        $counts = [];

        foreach ($payloads as $payload) {
            foreach (array_unique(array_map('intval', $payload['genres'] ?? [])) as $genre) {
                $counts[$genre] = ($counts[$genre] ?? 0) + 1;
            }
        }

        $total = max(1, count($payloads));
        $genres = array_keys($counts);
        usort($genres, fn (int $a, int $b) => [$counts[$b], $a] <=> [$counts[$a], $b]);

        $weights = [];
        foreach ($genres as $genre) {
            $weights[$genre] = $counts[$genre] / $total;
        }

        return $weights;
    }

    /**
     * საკვანძო სიტყვები, რომლებიც **ერთზე მეტ** საფუძველს აქვს — ხშირიდან იშვიათისკენ.
     *
     * ⚠️ ერთი საფუძვლის სიტყვები არ გამოიყენება: მათ შორის ზოგადიც არის („რომანის
     * მიხედვით") და რომელი ახასიათებს სათაურს, ერთი მაგალითით არ ჩანს.
     *
     * @param  array<int, array<string, mixed>>  $payloads
     * @return list<array{id: int, name: string}>
     */
    private function topKeywords(array $payloads): array
    {
        $counts = [];
        $names = [];

        foreach ($payloads as $payload) {
            foreach ($payload['keywords'] ?? [] as $keyword) {
                $id = (int) ($keyword['id'] ?? 0);

                if ($id > 0) {
                    $counts[$id] = ($counts[$id] ?? 0) + 1;
                    $names[$id] = (string) ($keyword['name'] ?? '');
                }
            }
        }

        $ids = array_keys(array_filter($counts, fn (int $count) => $count > 1));
        usort($ids, fn (int $a, int $b) => [$counts[$b], $a] <=> [$counts[$a], $b]);

        return array_map(fn (int $id) => ['id' => $id, 'name' => $names[$id]], array_slice($ids, 0, self::KEYWORDS));
    }

    /**
     * TMDB-ის `discover` თითო საკვანძო სიტყვით — `[სიტყვა => სათაურების მოკლე აღწერები]`.
     *
     * @param  list<array{id: int, name: string}>  $keywords
     * @param  list<int>  $genres  პროფილის მთავარი ჟანრები — სია მათ ფარგლებში რჩება
     * @return array<string, list<array<string, mixed>>>|null `null` — ბიუჯეტი ამოიწურა
     */
    private function discoverLists(string $type, int $userId, array $keywords, array $genres): ?array
    {
        $key = fn (array $keyword) => "suggest:discover:{$type}:{$keyword['id']}:".implode('-', $genres);

        if (Cache::pull($this->refreshKey($userId, $type))) {
            foreach ($keywords as $keyword) {
                Cache::forget($key($keyword));
            }
        }

        $lists = [];

        foreach ($keywords as $keyword) {
            $rows = Cache::get($key($keyword));

            if (! is_array($rows)) {
                if ($this->over()) {
                    return null;
                }

                $this->spent += self::COST_DISCOVER;
                $rows = $this->discover($type, $keyword['id'], $genres);
                Cache::put($key($keyword), $rows, now()->addDays(self::DISCOVER_DAYS));
            }

            $lists[$keyword['name']] = $rows;
        }

        return $lists;
    }

    /** @return list<array<string, mixed>> */
    private function discover(string $type, int $keyword, array $genres): array
    {
        $tv = MediaDomain::isTv($type);
        $params = [
            'page' => 1,
            'sort_by' => 'popularity.desc',
            'with_keywords' => $keyword,
            // ერთეული ხმებით დაწერილი სათაური რეიტინგსა და პოპულარობას ვერ ასაბუთებს
            'vote_count.gte' => $tv ? 20 : 50,
            ...match ($type) {
                'anime' => ['with_genres' => SuggestionSources::ANIMATION, 'with_origin_country' => 'JP'],
                'series' => ['without_genres' => SuggestionSources::ANIMATION, ...($genres ? ['with_genres' => implode('|', $genres)] : [])],
                default => $genres ? ['with_genres' => implode('|', $genres)] : [],
            },
        ];

        $res = $tv ? $this->tmdb->discoverTv($params) : $this->tmdb->discover($params);

        return array_values(array_filter(array_map(
            fn ($row) => is_array($row) ? SuggestionSources::summary($row, $tv) : null,
            (array) ($res['results'] ?? []),
        )));
    }

    /** ანიმეს მოდულში — მხოლოდ იაპონური ანიმაცია, სერიალებში — მის გარეშე */
    private function fits(string $type, array $summary): bool
    {
        return match ($type) {
            'anime' => SuggestionSources::isAnime($summary),
            'series' => ! SuggestionSources::isAnime($summary),
            default => true,
        };
    }

    /**
     * სიუჟეტის სიახლოვე: თითო კანდიდატზე — ყველაზე ახლო საფუძველი.
     *
     * ვექტორი სჭირდება საფუძვლებს და საუკეთესო კანდიდატებს (სხვა სიგნალებით); რაც ბაზაში
     * არ არის, ერთ პარტიად ითვლება. `closeness` — სიახლოვე 0…1-ზე გაშლილი ამ შედეგის
     * ფარგლებში (ყველაზე შორი — 0, ყველაზე ახლო — 1); `match` — თვითონ სიახლოვე პროცენტად.
     *
     * @param  array<int, array<string, mixed>>  $payloads  საფუძვლების TMDB-პასუხები, TMDB-ის id-ით
     * @param  array<int, array<string, mixed>>  $candidates
     * @return array{near: array<int, array{record: int, match: int, closeness: float}>, vectors: int, missing: int}|array{waiting: array{done: int, total: int}} `waiting` — ბიუჯეტი ამოიწურა
     */
    private function plot(string $kind, int $userId, Collection $basis, array $payloads, array $candidates): array
    {
        $texts = [];
        $anchors = [];

        foreach ($basis as $record) {
            $id = (int) $record->tmdb_id;
            $anchors[$id] = (int) $record->getKey();
            $texts[$id] = $this->text(
                $payloads[$id]['title'] ?? $record->title_en,
                $payloads[$id]['overview'] ?? RichText::plain($record->description_en),
            );
        }

        foreach ($this->shortlist($candidates) as $id) {
            $row = $candidates[$id];
            $texts[$id] = $row['summary']
                ? $this->text($row['summary']['title'], $row['summary']['overview'])
                : $this->text($row['record']->title_en ?: $row['record']->title_ka, RichText::plain($row['record']->description_en));
        }

        $texts = array_filter($texts);

        if ($texts === []) {
            return ['near' => [], 'vectors' => 0, 'missing' => 0];
        }

        $vectors = [];

        foreach (array_chunk(array_keys($texts), 500) as $chunk) {
            SuggestionVector::query()
                ->where('kind', $kind)
                ->where('model', PlotEmbedder::MODEL)
                ->whereIn('tmdb_id', $chunk)
                ->get()
                ->each(function (SuggestionVector $row) use (&$vectors) {
                    $vectors[$row->tmdb_id] = $row->values();
                });
        }

        $vectors = array_filter($vectors);
        $missing = array_diff_key($texts, $vectors);
        $pause = "suggest:embed-pause:{$userId}";

        /* ⚠️ ერთ გაშვებაზე ერთი პარტია, და პარტიებს შორის პაუზა: ლიმიტი წუთობრივია, მეორე პარტია
           იმავე წუთში 429-ს იღებს. რაც ვერ ჩაეტია, უვექტოროდ რჩება (პასუხი ამას ამბობს — `missing`)
           და შემდეგ გახსნაზე ემატება. */
        if ($missing && $this->embedder->configured() && ! Cache::has($pause) && ! Cache::has($this->downKey('gemini', $userId))) {
            // პარტია ათეულობით წამი შეიძლება გაგრძელდეს — მოთხოვნაში, რომელმაც უკვე იმუშავა, არ იწყება
            if ($this->spent > 0) {
                return ['waiting' => ['done' => count($vectors), 'total' => count($texts)]];
            }

            $this->spent += self::COST_EMBED;

            try {
                $fresh = $this->embedder->embed(array_slice($missing, 0, PlotEmbedder::BATCH, true));
                Cache::put($pause, true, now()->addSeconds(self::EMBED_PAUSE_SECONDS));
            } catch (Throwable $e) {
                $fresh = [];
                $limited = $e instanceof RequestException && $e->response->status() === 429;
                $this->down('gemini', $e, $userId, $limited ? self::RATE_LIMIT_SECONDS : null);
            }

            foreach ($fresh as $id => $vector) {
                SuggestionVector::updateOrCreate(
                    ['kind' => $kind, 'tmdb_id' => $id],
                    ['model' => PlotEmbedder::MODEL, 'vector' => SuggestionVector::encode($vector)],
                );
                $vectors[$id] = $vector;
            }
        }

        $near = [];

        foreach ($candidates as $id => $row) {
            if (! isset($vectors[$id])) {
                continue;
            }

            $best = null;

            foreach ($anchors as $anchor => $recordId) {
                if (! isset($vectors[$anchor])) {
                    continue;
                }

                $similarity = PlotEmbedder::similarity($vectors[$id], $vectors[$anchor]);

                if ($best === null || $similarity > $best['similarity']) {
                    $best = ['record' => $recordId, 'similarity' => $similarity];
                }
            }

            if ($best) {
                $near[$id] = $best;
            }
        }

        if ($near) {
            $low = min(array_column($near, 'similarity'));
            $span = max(array_column($near, 'similarity')) - $low;

            foreach ($near as $id => $best) {
                $near[$id] = [
                    'record' => $best['record'],
                    'match' => (int) round(max(0.0, min(1.0, $best['similarity'])) * 100),
                    'closeness' => $span > 0 ? ($best['similarity'] - $low) / $span : 1.0,
                ];
            }
        }

        return ['near' => $near, 'vectors' => count($vectors), 'missing' => count(array_diff_key($texts, $vectors))];
    }

    /**
     * ვის სჭირდება ვექტორი: სხვა სიგნალებით საუკეთესო ახალი სათაურები და ჩემი სათაურები.
     *
     * ⚠️ რიგი მონაცვლეობითაა (ახალი, ჩემი, ახალი…): პარტია ამ რიგით ივსება, და ლიმიტზე
     * გაწყვეტილმა გაშვებამ ერთ მხარეს მთლიანად უვექტოროდ არ უნდა დატოვოს.
     *
     * @param  array<int, array<string, mixed>>  $candidates
     * @return list<int>
     */
    private function shortlist(array $candidates): array
    {
        $order = fn (array $a, array $b) => [$b['signals'], $b['rating'] ?? 0.0, $a['tmdb_id']] <=> [$a['signals'], $a['rating'] ?? 0.0, $b['tmdb_id']];

        $new = array_values(array_filter($candidates, fn (array $row) => ! $row['record']));
        $mine = array_values(array_filter($candidates, fn (array $row) => (bool) $row['record']));
        usort($new, $order);
        usort($mine, $order);

        $new = array_column(array_slice($new, 0, self::SHORTLIST_NEW), 'tmdb_id');
        $mine = array_column(array_slice($mine, 0, self::SHORTLIST_MINE), 'tmdb_id');
        $ids = [];

        for ($i = 0; $i < max(count($new), count($mine)); $i++) {
            if (isset($new[$i])) {
                $ids[] = $new[$i];
            }
            if (isset($mine[$i])) {
                $ids[] = $mine[$i];
            }
        }

        return $ids;
    }

    /** ვექტორის ტექსტი — სათაური და აღწერა; აღწერის გარეშე სიუჟეტი არ არის შესადარებელი */
    private function text(?string $title, ?string $overview): ?string
    {
        $overview = trim((string) $overview);

        return $overview === '' ? null : trim(trim((string) $title).'. '.$overview, '. ');
    }

    /** ამ მოთხოვნამ თავისი წილი იმუშავა — გამოძახებების ან დროის ჭერით, რომელიც ადრე დადგება */
    private function over(): bool
    {
        return $this->spent >= self::BUDGET || microtime(true) - $this->startedAt >= self::TIME_BUDGET;
    }

    /**
     * წყარო ჩავარდა: მიზეზი ლოგში, წყარო კი დროებით გამოთიშულია (`$seconds` — რამდენ ხანს;
     * ნაგულისხმევად `DOWN_MINUTES`). ყოველთვის `false`.
     */
    private function down(string $source, Throwable $e, ?int $userId = null, ?int $seconds = null): bool
    {
        SourceLog::threw($source, $e, ['step' => 'suggestions']);
        Cache::put($this->downKey($source, $userId), true, now()->addSeconds($seconds ?? self::DOWN_MINUTES * 60));

        return false;
    }

    /** გასაღებიანი წყაროს მდგომარეობა ანგარიშისაა (სხვისი გასაღები შეიძლება მუშაობდეს) */
    private function downKey(string $source, ?int $userId = null): string
    {
        return "suggest:down:{$source}".($userId ? ":{$userId}" : '');
    }

    private function refreshKey(int $userId, string $type): string
    {
        return "suggest:refresh:{$userId}:{$type}";
    }

    /**
     * რა მდგომარეობაშია თითო წყარო ამ მოდულზე: `ok` · `missing` (გასაღები არ არის) ·
     * `failed` (ჩავარდა და დროებით გამოთიშულია) · `off` (ამ მოდულს არ ეხება).
     *
     * @return array<string, string>
     */
    private function sourceStates(string $type, int $userId): array
    {
        $state = fn (bool $applies, bool $configured, string $down) => match (true) {
            ! $applies => 'off',
            ! $configured => 'missing',
            Cache::has($down) => 'failed',
            default => 'ok',
        };

        return [
            'trakt' => $state($type !== 'anime', $this->trakt->configured(), $this->downKey('trakt', $userId)),
            'anilist' => $state($type === 'anime', true, $this->downKey('anilist')),
            'gemini' => $state(true, $this->embedder->configured(), $this->downKey('gemini', $userId)),
        ];
    }

    /** @param  array{stage: string, done: int, total: int}  $progress */
    private function waiting(string $type, int $userId, array $progress): array
    {
        return ['ready' => false, 'progress' => $progress, 'sources' => $this->sourceStates($type, $userId)];
    }

    /**
     * @param  list<array<string, mixed>>  $candidates
     * @param  array{vectors: int, missing: int}  $plot
     */
    private function done(string $type, int $userId, array $candidates, array $plot): array
    {
        return [
            'ready' => true,
            'progress' => null,
            'sources' => $this->sourceStates($type, $userId),
            'candidates' => $candidates,
            'plot' => $plot,
        ];
    }
}
