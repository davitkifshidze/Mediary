<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StatusResource;
use App\Models\Genre;
use App\Models\HiddenSuggestion;
use App\Services\Suggest\SuggestionBasis;
use App\Services\Suggest\SuggestionEngine;
use App\Services\Tmdb\TmdbClient;
use App\Support\CredentialProviders;
use App\Support\Like;
use App\Support\MediaDomain;
use App\Support\MissingCredential;
use App\Support\RichText;
use App\Support\SourceLog;
use App\Support\Trailer;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

/**
 * **„შემოთავაზებები"** — ფილმის, სერიალისა და ანიმეს ქვემენიუს გვერდი: მსგავსი სათაურები
 * ჩემი არჩევანის მიხედვით, ჩემი სიიდანაც და გარედანაც.
 *
 *  · `index()` — შედეგი (ან პროგრესი, სანამ წყაროების მასალა გროვდება — იხ. `SuggestionEngine`);
 *  · `basis()` — საფუძვლის ამრჩევის სია: არჩეული სტატუსების ჩანაწერები, ძებნით;
 *  · `hide()` — „არ მაინტერესებს" და მისი მოხსნა;
 *  · `trailer()` — ახალი სათაურის თრეილერი, მოთხოვნისას (სიაში ასობით სათაურია და თითოზე
 *    ცალკე მოთხოვნა გვერდს წუთებით დააგვიანებდა).
 * „დამატება" არსებული `POST /{module}/from-tmdb`-ია.
 *
 * ⚠️ დომენი მარშრუტის ნაგულისხმევი პარამეტრია (`->defaults('domain', …)`): სამი მოდული,
 * ერთი კოდი.
 * ⚠️ საფუძვლის ფილტრებს `b_` თავსართი აქვს — შედეგის ფილტრებს (ჟანრი, წელი, რეიტინგი)
 * იგივე სახელები ჰქვია და ერთმანეთში არ უნდა აირიოს.
 */
class MediaSuggestionController extends Controller
{
    private const PER_PAGE = 24;

    private const PER_PAGE_MAX = 500;

    /** ამრჩევის ერთი პასუხი — დანარჩენი ძებნით მოიძებნება */
    private const PICKER_LIMIT = 50;

    /** „რატომ"-ში რამდენი ჩემი სათაური იწერება სახელით (დანარჩენი — რიცხვით) */
    private const WHY_BASES = 4;

    private const TRAILER_DAYS = 7;

    private const POSTER = 'https://image.tmdb.org/t/p/w342';

    public function index(Request $request, string $domain, TmdbClient $tmdb, SuggestionEngine $engine)
    {
        if (! $tmdb->configured()) {
            return MissingCredential::response(CredentialProviders::TMDB);
        }

        $in = $this->selection($request);
        $filters = $request->validate([
            'cut' => ['nullable', 'in:all,mine,new'],
            'hidden' => ['nullable', 'boolean'],
            'refresh' => ['nullable', 'boolean'],
            'genre' => ['nullable', 'string', 'max:2000'],
            'year_min' => ['nullable', 'integer'],
            'year_max' => ['nullable', 'integer'],
            'rating_min' => ['nullable', 'numeric', 'min:0', 'max:10'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::PER_PAGE_MAX],
        ]);

        $user = $request->user();
        ['records' => $basis, 'total' => $total] = SuggestionBasis::resolve($domain, $in);

        try {
            $run = $engine->run($user, $domain, $basis, $request->boolean('refresh'));
        } catch (RequestException|ConnectionException $e) {
            // გამონაკლისის ტექსტი კლიენტს არ მიდის: Guzzle მას სრულ URL-ს (`?api_key=…`) უწერს
            SourceLog::threw('tmdb', $e, ['step' => 'suggestions']);

            return response()->json(['message' => 'tmdb_unavailable'], 503);
        }

        $hiddenTotal = HiddenSuggestion::query()->where('user_id', $user->getKey())->where('type', $domain)->count();
        $head = [
            'ready' => $run['ready'],
            'progress' => $run['progress'],
            'sources' => $run['sources'],
            'plot' => $run['plot'] ?? null,
            'basis' => [
                'used' => $basis->count(),
                'total' => $total,
                'limit' => SuggestionBasis::LIMIT,
                'records' => $basis->map(fn (Model $record) => $this->brief($record))->values(),
            ],
        ];

        if (! $run['ready']) {
            return response()->json([...$head, 'counts' => null, 'data' => [], 'meta' => null]);
        }

        $page = (int) ($filters['page'] ?? 1);
        $perPage = (int) ($filters['per_page'] ?? self::PER_PAGE);

        $rows = $this->narrow(collect($run['candidates']), $request);
        $shown = $rows->reject(fn (array $row) => $row['hidden']);
        $counts = [
            'all' => $shown->count(),
            'mine' => $shown->filter(fn (array $row) => (bool) $row['record'])->count(),
            'new' => $shown->filter(fn (array $row) => ! $row['record'])->count(),
            // „დამალულები" მთელი სიაა და არა ამ საფუძვლის ნაწილი — თორემ დამალულს ვერასდროს დააბრუნებდი
            'hidden' => $hiddenTotal,
        ];

        if ($request->boolean('hidden')) {
            return response()->json([...$head, 'counts' => $counts, ...$this->hiddenPage($user->getKey(), $domain, $page, $perPage)]);
        }

        $shown = match ($filters['cut'] ?? 'all') {
            'mine' => $shown->filter(fn (array $row) => (bool) $row['record']),
            'new' => $shown->filter(fn (array $row) => ! $row['record']),
            default => $shown,
        };

        $genres = Genre::whereNotNull('tmdb_id')->get()->keyBy('tmdb_id');
        $anchors = $basis->keyBy(fn (Model $record) => (int) $record->getKey());

        return response()->json([
            ...$head,
            'counts' => $counts,
            'data' => $shown->forPage($page, $perPage)->map(fn (array $row) => $this->row($row, $genres, $anchors))->values(),
            'meta' => $this->meta($shown->count(), $page, $perPage),
        ]);
    }

    /** ამრჩევის სია: არჩეული სტატუსებისა და „რჩეულის" ჩანაწერები (დავიწროების შემდეგ), ძებნით */
    public function basis(Request $request, string $domain)
    {
        $in = $this->selection($request);
        $data = $request->validate(['q' => ['nullable', 'string', 'max:200']]);

        $pool = SuggestionBasis::pool($domain, $in);
        $total = (clone $pool)->count();

        if (($q = trim((string) ($data['q'] ?? ''))) !== '') {
            $pool->whereHas('translations', fn ($t) => $t->where('title', 'like', Like::contains($q)));
        }

        return response()->json([
            'total' => $total,
            'limit' => SuggestionBasis::LIMIT,
            'data' => SuggestionBasis::ordered($pool)->limit(self::PICKER_LIMIT)->get()
                ->map(fn (Model $record) => $this->brief($record))->values(),
        ]);
    }

    /**
     * „არ მაინტერესებს" (`hidden: true`) ან მისი მოხსნა. სათაური, წელი და პოსტერი რიგში
     * ინახება — „დამალულების" სია მათ ხატავს და წყაროს არ ეკითხება.
     */
    public function hide(Request $request, string $domain)
    {
        $data = $request->validate([
            'tmdb_id' => ['required', 'integer', 'min:1'],
            'hidden' => ['required', 'boolean'],
            'title' => ['required_if:hidden,true', 'nullable', 'string', 'max:255'],
            'year' => ['nullable', 'integer', 'min:1800', 'max:2200'],
            'poster' => ['nullable', 'string', 'max:500'],
        ]);

        $key = ['user_id' => $request->user()->getKey(), 'type' => $domain, 'tmdb_id' => (int) $data['tmdb_id']];

        if ($data['hidden']) {
            HiddenSuggestion::updateOrCreate($key, [
                'title' => (string) $data['title'],
                'year' => $data['year'] ?? null,
                'tmdb_poster' => self::posterPath($data['poster'] ?? null),
            ]);
        } else {
            HiddenSuggestion::query()->where($key)->delete();
        }

        return response()->json([
            'hidden' => (bool) $data['hidden'],
            'count' => HiddenSuggestion::query()->where('user_id', $key['user_id'])->where('type', $domain)->count(),
        ]);
    }

    /** ახალი სათაურის თრეილერი აპის ფლეიერისთვის; არ აქვს — `trailer: null` */
    public function trailer(Request $request, string $domain, TmdbClient $tmdb)
    {
        if (! $tmdb->configured()) {
            return MissingCredential::response(CredentialProviders::TMDB);
        }

        $id = (int) $request->validate(['tmdb_id' => ['required', 'integer', 'min:1']])['tmdb_id'];
        $tv = MediaDomain::isTv($domain);

        try {
            // ⚠️ `null` ქეშში არ ინახება — „თრეილერი არ აქვს" ცარიელი სტრიქონია, თორემ ყოველ დაჭერაზე TMDB-ს ვკითხავდით
            $url = Cache::remember(
                'suggest:trailer:'.($tv ? 'tv' : 'movie').":{$id}",
                now()->addDays(self::TRAILER_DAYS),
                fn () => (string) Trailer::pick($tv ? $tmdb->tvVideos($id, 'ka,en,null') : $tmdb->videos($id, 'ka,en,null')),
            );
        } catch (RequestException|ConnectionException $e) {
            SourceLog::threw('tmdb', $e, ['step' => 'suggestions']);

            return response()->json(['message' => 'tmdb_unavailable'], 503);
        }

        return response()->json(['trailer' => Trailer::forPlayer($url ?: null)]);
    }

    /**
     * საფუძვლის არჩევანი მოთხოვნიდან — `SuggestionBasis`-ის ფორმით.
     *
     * @return array{statuses: list<string>, favorite: bool, ids: list<int>, genre: list<string>, year_min: ?int, year_max: ?int, my_rating_min: ?float, my_rating_max: ?float, rating_min: ?float, rating_max: ?float}
     */
    private function selection(Request $request): array
    {
        $data = $request->validate([
            'statuses' => ['nullable', 'string', 'max:2000'],
            'favorite' => ['nullable', 'boolean'],
            'ids' => ['nullable', 'string', 'max:4000'],
            'b_genre' => ['nullable', 'string', 'max:2000'],
            'b_year_min' => ['nullable', 'integer'],
            'b_year_max' => ['nullable', 'integer'],
            'b_my_rating_min' => ['nullable', 'numeric', 'min:0', 'max:10'],
            'b_my_rating_max' => ['nullable', 'numeric', 'min:0', 'max:10'],
            'b_rating_min' => ['nullable', 'numeric', 'min:0', 'max:10'],
            'b_rating_max' => ['nullable', 'numeric', 'min:0', 'max:10'],
        ]);

        $number = fn (string $key, bool $whole = false) => isset($data[$key]) && $data[$key] !== ''
            ? ($whole ? (int) $data[$key] : (float) $data[$key])
            : null;

        $in = [
            'statuses' => $this->slugList($data['statuses'] ?? null),
            'favorite' => $request->boolean('favorite'),
            'ids' => array_values(array_filter(array_map('intval', $this->slugList($data['ids'] ?? null)), fn (int $id) => $id > 0)),
            'genre' => $this->slugList($data['b_genre'] ?? null),
            'year_min' => $number('b_year_min', true),
            'year_max' => $number('b_year_max', true),
            'my_rating_min' => $number('b_my_rating_min'),
            'my_rating_max' => $number('b_my_rating_max'),
            'rating_min' => $number('b_rating_min'),
            'rating_max' => $number('b_rating_max'),
        ];

        // „დან" > „მდე" → წყვილი გადაისმება (სიის ფილტრის წესი)
        foreach (['year', 'my_rating', 'rating'] as $range) {
            if ($in["{$range}_min"] !== null && $in["{$range}_max"] !== null && $in["{$range}_min"] > $in["{$range}_max"]) {
                [$in["{$range}_min"], $in["{$range}_max"]] = [$in["{$range}_max"], $in["{$range}_min"]];
            }
        }

        return $in;
    }

    /**
     * შედეგის ფილტრი: ჟანრი (ნებისმიერი მონიშნულთაგან), წელი, TMDB-ის მინიმალური რეიტინგი.
     * ზღვრის დასმისთანავე უწლო / ურეიტინგო სათაური შედეგიდან გადის.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return Collection<int, array<string, mixed>>
     */
    private function narrow(Collection $rows, Request $request): Collection
    {
        $slugs = $this->slugList($request->string('genre')->toString());
        $genres = $slugs ? Genre::whereIn('slug', $slugs)->whereNotNull('tmdb_id')->pluck('tmdb_id')->map(fn ($id) => (int) $id)->all() : null;
        $yearMin = $request->filled('year_min') ? $request->integer('year_min') : null;
        $yearMax = $request->filled('year_max') ? $request->integer('year_max') : null;
        $ratingMin = $request->filled('rating_min') ? $request->float('rating_min') : null;

        return $rows->filter(fn (array $row) => ($genres === null || array_intersect($genres, $row['genre_ids']))
            && ($yearMin === null || ($row['year'] !== null && $row['year'] >= $yearMin))
            && ($yearMax === null || ($row['year'] !== null && $row['year'] <= $yearMax))
            && ($ratingMin === null || ($row['rating'] !== null && $row['rating'] >= $ratingMin)))
            ->values();
    }

    /**
     * @param  array<string, mixed>  $row  `SuggestionEngine`-ის კანდიდატი
     * @param  Collection<int, Genre>  $genres  TMDB-ის ჟანრის id-ით
     * @param  Collection<int, Model>  $anchors  საფუძვლის ჩანაწერები id-ით
     * @return array<string, mixed>
     */
    private function row(array $row, Collection $genres, Collection $anchors): array
    {
        /** @var Model|null $record */
        $record = $row['record'];
        $summary = $row['summary'] ?? [];
        $names = fn (array $ids) => collect($ids)->map(fn (int $id) => $genres->get($id))->filter()
            ->map(fn (Genre $genre) => ['name_en' => $genre->name_en, 'name_ka' => $genre->name_ka])->values();
        $anchor = fn (int $id) => ($found = $anchors->get($id))
            ? ['id' => $id, 'title_ka' => $found->title_ka, 'title_en' => $found->title_en]
            : null;

        return [
            'tmdb_id' => $row['tmdb_id'],
            'title' => $record ? ($record->title_en ?: $record->title_ka ?: ($summary['title'] ?? '')) : $summary['title'],
            'title_ka' => $record ? $record->title_ka : ($summary['title_ka'] ?? null),
            'year' => $row['year'],
            'rating' => $row['rating'],
            'poster' => $record
                ? ($record->poster_path ? asset('storage/'.$record->poster_path) : null)
                : self::POSTER.$summary['poster'],
            'overview' => $record ? (RichText::plain($record->description_en) ?: null) : ($summary['overview'] ?? null),
            'overview_ka' => $record ? (RichText::plain($record->description_ka) ?: null) : null,
            'genres' => $names($row['genre_ids']),
            'owned' => (bool) $record,
            'record' => $record ? [
                'id' => $record->getKey(),
                'status' => StatusResource::brief($record->status),
                'is_favorite' => (bool) $record->is_favorite,
            ] : null,
            'hidden' => false,
            'score' => round((float) $row['score'], 3),
            'why' => [
                'bases' => collect($row['votes'])->take(self::WHY_BASES)
                    ->map(fn (array $sources, int $id) => ($found = $anchor($id)) ? [...$found, 'sources' => $sources] : null)
                    ->filter()->values(),
                'bases_total' => count($row['votes']),
                'genres' => $names($row['shared']),
                'keywords' => $row['keywords'],
                'plot' => $row['plot'] && ($found = $anchor($row['plot']['record']))
                    ? [...$found, 'match' => $row['plot']['match']]
                    : null,
            ],
        ];
    }

    /** „დამალულები" — ჩემი სია ამ მოდულში, ახლიდან ძველისკენ */
    private function hiddenPage(int $userId, string $domain, int $page, int $perPage): array
    {
        $query = HiddenSuggestion::query()->where('user_id', $userId)->where('type', $domain);
        $total = (clone $query)->count();

        $rows = $query->orderByDesc('id')->forPage($page, $perPage)->get()->map(fn (HiddenSuggestion $row) => [
            'tmdb_id' => $row->tmdb_id,
            'title' => $row->title,
            'title_ka' => null,
            'year' => $row->year,
            'rating' => null,
            'poster' => $row->tmdb_poster ? self::POSTER.$row->tmdb_poster : null,
            'overview' => null,
            'overview_ka' => null,
            'genres' => [],
            'owned' => false,
            'record' => null,
            'hidden' => true,
            'score' => null,
            'why' => null,
        ])->values();

        return ['data' => $rows, 'meta' => $this->meta($total, $page, $perPage)];
    }

    /** @return array{total: int, page: int, per_page: int, last_page: int} */
    private function meta(int $total, int $page, int $perPage): array
    {
        return ['total' => $total, 'page' => $page, 'per_page' => $perPage, 'last_page' => max(1, (int) ceil($total / $perPage))];
    }

    /** საფუძვლის ჩანაწერი მოკლედ — ამრჩევის რიგი და „რაზე დგას" ჩიპი */
    private function brief(Model $record): array
    {
        return [
            'id' => $record->getKey(),
            'title_ka' => $record->title_ka,
            'title_en' => $record->title_en,
            'year' => $record->year,
            'poster' => $record->poster_path ? asset('storage/'.$record->poster_path) : null,
            'is_favorite' => (bool) $record->is_favorite,
            'status' => StatusResource::brief($record->status),
        ];
    }

    /**
     * TMDB-ის CDN-ის მისამართიდან ფარდობითი გზა (`/abc.jpg`). ⚠️ სხვა მისამართი არ ინახება —
     * ეს ველი სურათად იხატება და უცხო ჰოსტი მასში არ უნდა მოხვდეს.
     */
    private static function posterPath(?string $poster): ?string
    {
        return preg_match('~^(?:https://image\.tmdb\.org/t/p/\w+)?(/[\w.\-]+)$~', (string) $poster, $m) ? $m[1] : null;
    }
}
