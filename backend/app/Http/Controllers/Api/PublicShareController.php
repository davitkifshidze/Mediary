<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RecordVisit;
use App\Models\ShareLink;
use App\Models\User;
use App\Services\Modules\FieldSettings;
use App\Services\Profile\PublicProfileService;
use App\Services\Share\ShareImporter;
use App\Services\Share\ShareMatcher;
use App\Services\Share\ShareResolver;
use App\Services\Share\ShareScope;
use App\Services\Visits\RecordVisits;
use App\Support\Like;
use App\Support\PublicDomain;
use App\Support\ShareDomain;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * **გაზიარების ბმულის მიმღების მხარე — `/share/{token}` (Tasks §40.6–40.7).**
 *
 * ⚠️ **ავტორიზაციის გარეთ დგას** (Q46 — „ა"): ნახვა ყველას, ვისაც ბმული აქვს;
 * ბიბლიოთეკაში დამატება კი მხოლოდ შესულს (40.8). მთელი მექანიზმი ერთი
 * გადამრთველით ითიშება — `SHARE_LINKS=false`.
 *
 * ⚠️ **ტოკენი მოდელზე არ ებმება** — `EnsureRecordOwnership` უცხოს 404-ს
 * დაუბრუნებდა (ალბომის განბლოკვისა და ფლეილისტის წესი). ბმული ჰეშით
 * მოიძებნება (`ShareLink::findByToken()`).
 *
 * ⚠️ **410 ≠ 404** (`ResetLink`-ის წესი): უცნობი ტოკენი, წაშლილი ან გათიშული
 * მფლობელი — 404 („ასეთი ბმული არ არსებობს"); ვადაგასული ან გაუქმებული — 410
 * („იყო, ამოიწურა") — მეორე მიმღებს მფლობელთან აგზავნის, პირველი კი არა.
 *
 * ⚠️ **ბარათი ყოველთვის ვიწროა** — `PublicDomain::card()` + ჟანრები, და
 * არასდროს `MovieResource`: სრული რესურსი პირად ველებს გაატარებდა, ხვალ
 * დამატებული ველი კი ჩუმად გაჟონავდა (§16.1). ჩანიშვნები, საკუთარი ველები,
 * ფაილები, გალერეა, ყურების ჟურნალი და მსახიობების შენეული რიგი აქ არ გადის.
 */
class PublicShareController extends Controller
{
    /** ნაგულისხმევი გვერდის ზომა */
    public const PER_PAGE = 30;

    public function __construct(
        private PublicProfileService $profiles,
        private FieldSettings $fields,
        private RecordVisits $visits,
    ) {}

    /** ბმულის თავი: ვინ გაგიზიარა, სექციები რაოდენობებით, ვადა */
    public function show(Request $request, string $token): JsonResponse
    {
        [$link, $owner] = ShareResolver::resolve($token);

        $viewer = $request->user();
        $own = $viewer !== null && (int) $viewer->id === (int) $owner->id;
        $domains = ShareScope::liveDomains($link, $owner);

        $this->countView($link, $request, $own);

        $sections = [];
        foreach ($domains as $domain => $spec) {
            $sections[] = [
                'domain' => (string) $domain,
                'count' => ShareScope::query($owner, (string) $domain, $spec)->count(),
            ];
        }

        return response()->json([
            'owner' => [
                'username' => $owner->username,
                'display_name' => $owner->displayName(),
                'avatar_path' => $owner->avatar_path,
            ],
            'link' => [
                'expires_at' => $link->expires_at?->toIso8601String(),
                'show_status' => $link->show_status,
            ],
            'sections' => $sections,
            'modules' => $this->profiles->moduleMeta(array_keys($domains)),
            'viewer' => [
                'signed_in' => $viewer !== null,
                // ⚠️ საკუთარი ბმული — „მიმღების თვალით" ნახვა; დამატება 409-ია (40.8)
                'own' => $own,
                // §40.6 — რომელ სექციაში შეუძლია დამატება (მოდულის უქონელს — მოთხოვნის ღილაკი)
                'sections' => $viewer !== null && ! $own
                    ? (object) ShareImporter::abilities($viewer, array_keys($domains))
                    : (object) [],
            ],
        ]);
    }

    /**
     * ერთი სექციის ბარათები, გვერდებად — ძებნით (`q`) და ჟანრით (`genre`).
     *
     * ⚠️ **`per_page` ორივე მხრიდან იზღუდება** (აუდიტი §B4): `?per_page=-1`
     * `LIMIT`-ს ჩუმად აშორებდა, ეს კი ავტორიზაციის გარეშე endpoint-ია.
     */
    public function items(Request $request, string $token, string $domain): JsonResponse
    {
        [$link, $owner] = ShareResolver::resolve($token);

        $domains = ShareScope::liveDomains($link, $owner);
        // ⚠️ ბმულის გარეთ მყოფი (ან მას შემდეგ გათიშული) დომენი არ არსებობს
        if (! isset($domains[$domain])) {
            ShareResolver::deny('share_not_found', 404);
        }

        $spec = $domains[$domain];
        $viewer = $request->user();
        $own = $viewer !== null && (int) $viewer->id === (int) $owner->id;

        $query = ShareScope::query($owner, $domain, $spec);
        $table = $query->getModel()->getTable();

        $term = trim((string) $request->query('q', ''));
        if ($term !== '') {
            $this->search($query, $domain, $term);
        }

        $hidden = $this->fields->hiddenOnPublic($owner, ShareDomain::module($domain));
        // ⚠️ მფლობელმა კლასიფიკატორი საჯაროდ დამალა (ან დომენს ის საერთოდ არ აქვს) — არც ბარათზე, არც ფილტრში
        $field = ShareDomain::classifierField($domain);
        $classifierHidden = $field === null || in_array($field, $hidden, true);

        $genre = trim((string) $request->query('genre', ''));
        if ($genre !== '' && ! $classifierHidden) {
            $this->filterByClassifier($query, $domain, $genre);
        }

        $perPage = min(max((int) $request->integer('per_page', self::PER_PAGE), 1), 100);
        $page = max(1, (int) $request->integer('page', 1));

        /* §40.13 — პლეილისტის ბარათი სიმღერების რიცხვით; ⚠️ `owner`-ის გარეშე და
           მფლობელის ცხადი id-ით (§33.3-ის გაკვეთილი: შესულ უცხოს „0 სიმღერა" ეწერებოდა) */
        if (ShareDomain::isList($domain)) {
            $this->profiles->withSongCount($query, $owner);
        }

        $paginator = ShareDomain::withClassifier($query, $domain)
            ->orderByDesc($table.'.id')
            ->paginate($perPage, ['*'], 'page', $page);

        $records = $paginator->getCollection();
        // ⚠️ „უკვე გაქვს" — იგივე წესი, რასაც დამატების გეგმა კითხულობს (`ShareMatcher`)
        $mine = $viewer !== null && ! $own ? ShareMatcher::matches($viewer, $domain, $records) : [];

        return response()->json([
            'data' => $records->map(fn (Model $record) => $this->card($link, $domain, $record, $hidden, $classifierHidden, $mine, $viewer !== null && ! $own))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
            'genres' => $classifierHidden ? [] : $this->classifierFacet($owner, $domain, $spec),
        ]);
    }

    /**
     * **ბმულში მყოფი პლეილისტის სიმღერები, მისივე რიგით (Tasks §40.13).**
     *
     * ⚠️ **ყველა სიმღერა ჩანს — პირადიც** (§33-ის Q24): სიმღერა მშობლის
     * ხილვადობას იღებს, ბმული კი თვითონაა თანხმობა. „მხოლოდ საჯაროები"
     * პლეილისტს ეხება და არა მის სიმღერებს — ფანჯარა ამას წითლად ამბობს.
     * ⚠️ სიმღერები მფლობელისაა (`ownSongs()` — `owner`-ის გარეშე, ცხადი id-ით;
     * `trash` რჩება): pivot-ში ხელით ჩაწერილი სხვისი სიმღერა არ ჩანს.
     * ⚠️ ბმულის გარეთ მყოფი პლეილისტი **404**-ია (`share_record_not_found`) —
     * კლიენტს ვენდობით იმაში, *რას* ითხოვს, და არა იმაში, *რა არის* ბმულში.
     */
    public function playlist(Request $request, string $token, int $playlist): JsonResponse
    {
        [$link, $owner] = ShareResolver::resolve($token);

        $domains = ShareScope::liveDomains($link, $owner);
        if (! isset($domains['playlist'])) {
            ShareResolver::deny('share_not_found', 404);
        }

        $query = ShareScope::query($owner, 'playlist', $domains['playlist']);
        $record = $this->profiles->withSongCount($query, $owner)->whereKey($playlist)->first();

        if (! $record) {
            ShareResolver::deny('share_record_not_found', 404);
        }

        $viewer = $request->user();
        $own = $viewer !== null && (int) $viewer->id === (int) $owner->id;
        // Tasks §10 — გაზიარების ბმულიდან შესვლა ჟურნალში `share`-ით; მფლობელი არ ითვლება
        $this->visits->fromPublic($record, $request, $owner, RecordVisit::SOURCE_SHARE);
        $perPage = min(max((int) $request->integer('per_page', 100), 1), 100);
        $page = max(1, (int) $request->integer('page', 1));

        $songs = $this->profiles->playlistSongs($owner, $record)
            // ⚠️ ჟანრი `owner`-ის გარეშე (`ShareDomain::withClassifier()`-ის მიზეზი, §1.2)
            ->with(['genres' => fn ($q) => $q->withoutGlobalScope('owner')])
            ->paginate($perPage, ['*'], 'page', $page);

        // `playlist` და `song` ერთ მოდულს ეკუთვნის — ერთი ველების კონფიგი ორივესთვის
        $hidden = $this->fields->hiddenOnPublic($owner, ShareDomain::module('song'));
        $field = ShareDomain::classifierField('song');
        $classifierHidden = $field === null || in_array($field, $hidden, true);

        $records = $songs->getCollection();
        $mark = $viewer !== null && ! $own;
        $mine = $mark ? ShareMatcher::matches($viewer, 'song', $records) : [];

        return response()->json([
            'playlist' => PublicDomain::card('playlist', $record, $hidden),
            'data' => $records->map(fn (Model $song) => $this->card($link, 'song', $song, $hidden, $classifierHidden, $mine, $mark))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $songs->currentPage(),
                'last_page' => $songs->lastPage(),
                'per_page' => $songs->perPage(),
                'total' => $songs->total(),
            ],
        ]);
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * ნახვების მრიცხველი.
     *
     * ⚠️ **მფლობელი არ ითვლება** („მიმღების თვალით" ნახვა ნახვა არაა) და ერთი
     * მნახველი საათში ერთხელ ითვლება — თორემ ფანჯარაზე დაბრუნება და გვერდის
     * განახლება რიცხვს უაზროდ გაზრდიდა.
     * ⚠️ **query builder-ით** და არა მოდელით: `increment()` მოდელზე `updated`
     * მოვლენას ისვრის, ე.ი. ყოველი გახსნა ჟურნალში „განახლდა"-დ ჩაიწერებოდა.
     */
    private function countView(ShareLink $link, Request $request, bool $own): void
    {
        if ($own) {
            return;
        }

        $viewer = $request->user();
        $key = 'share-view:'.$link->id.':'.($viewer ? 'u'.$viewer->id : 'ip'.$request->ip());

        if (Cache::add($key, 1, now()->addHour())) {
            DB::table('share_links')->where('id', $link->id)->increment('views', 1, ['last_opened_at' => now()]);
        }
    }

    /**
     * ძებნა სათაურით — დომენის საკუთარ სვეტებში (`PublicDomain::search()` —
     * ხილვადობის სიის იგივე რუკა): მედიაზე თარგმანების ცხრილი, დანარჩენზე
     * `title`/`name`/ავტორი/შემსრულებელი.
     */
    private function search(Builder $query, string $domain, string $term): void
    {
        $map = PublicDomain::search($domain);
        $table = $query->getModel()->getTable();
        $like = Like::contains($term);

        if ($map['relation'] !== null) {
            $query->whereHas($map['relation'], function ($t) use ($map, $like) {
                $t->where(function ($w) use ($map, $like) {
                    foreach ($map['columns'] as $column) {
                        $w->orWhere($column, 'like', $like);
                    }
                });
            });

            return;
        }

        $query->where(function (Builder $w) use ($map, $table, $like) {
            foreach ($map['columns'] as $column) {
                $w->orWhere($table.'.'.$column, 'like', $like);
            }
        });
    }

    /**
     * ჟანრის/კატეგორიის/ტიპის ფილტრი — მედიაზე slug, დანარჩენზე **მფლობელის** id.
     *
     * ⚠️ სტრუქტურით (სვეტი/pivot) და არა `whereHas()`-ით: ლექსიკონის რელაცია
     * `owner` scope-ს ხელახლა დაადებდა და შესულ უცხოს არაფერი დარჩებოდა.
     */
    private function filterByClassifier(Builder $query, string $domain, string $value): void
    {
        if (ShareDomain::classifierIsGlobal($domain)) {
            $query->whereHas('genres', fn ($g) => $g->where('slug', $value));

            return;
        }

        $table = $query->getModel()->getTable();
        $shape = ShareDomain::classifierShape($domain);
        $id = (int) $value;

        if ($shape['type'] === 'column') {
            $query->where($table.'.'.$shape['column'], $id);

            return;
        }

        $query->whereIn($table.'.id', DB::table($shape['table'])->where($shape['related'], $id)->select($shape['foreign']));
    }

    /**
     * ვიწრო ბარათი + კლასიფიკატორი (+ შესულს `in_library`).
     *
     * ⚠️ **მთავარი ფოტოს გასაღები ითარგმნება** — ველების კატალოგი მას
     * `poster`/`cover`/`thumbnail`/`photo`-ს ეძახის, ბარათი — `image`-ს (§33-ის
     * ცნობილი შეუსაბამობა). აქ ის ითარგმნება, თორემ მფლობელის „ბარათზე არ
     * გამოჩნდეს" ფოტოზე არაფერს იზამდა.
     * ⚠️ **`genres` ყველა დომენზეა** — ჟანრი, კატეგორია თუ ტიპი, ერთი ფორმით
     * (`value` · სახელი ორივე ენაზე): მიმღების გვერდს ერთი ბარათი აქვს.
     *
     * @param  list<string>  $hidden
     * @param  array<int, array{id: int, trashed: bool}>  $mine
     */
    private function card(ShareLink $link, string $domain, Model $record, array $hidden, bool $classifierHidden, array $mine, bool $mark): array
    {
        $card = PublicDomain::card($domain, $record, $hidden);
        $photo = ShareDomain::photoField($domain);

        if ($photo !== null && in_array($photo, $hidden, true)) {
            unset($card['image']);
        }

        if (! $link->show_status) {
            unset($card['status']);
        }

        /* Tasks §9 (Q1) — გადამრთველი **მფლობელის** ქულას მალავს: მედიაზე ეს
           `my_rating`-ია, ბარათის `rating` კი TMDB-ის საშუალოა და საჯარო ფაქტად რჩება. */
        if (! $link->show_rating && ShareDomain::hasPersonalRating($domain)) {
            unset($card[ShareDomain::personalRatingKey($domain)]);
        }

        if (! $classifierHidden) {
            $card['genres'] = ShareDomain::classifierEntries($record, $domain)
                ->map(fn (Model $entry) => [
                    'value' => ShareDomain::classifierValue($domain, $entry),
                    'name_ka' => $entry->getAttribute('name_ka'),
                    'name_en' => $entry->getAttribute('name_en'),
                ])
                ->values()
                ->all();
        }

        if ($mark) {
            $card['in_library'] = $mine[(int) $record->getKey()] ?? null;
        }

        return $card;
    }

    /**
     * სექციის ჟანრები/კატეგორიები/ტიპები რაოდენობებით — ფილტრისთვის.
     *
     * ⚠️ **ძებნისა და ფილტრის გარეშე** ითვლება: თორემ ერთი ჟანრის არჩევისას
     * დანარჩენები სიიდან გაქრებოდა და გადართვა შეუძლებელი გახდებოდა.
     * ⚠️ **ნედლი სტრუქტურა** (`genreables`, pivot ან სვეტი) და არა რელაცია:
     * რელაციას `owner` scope მოჰყვება, რომელიც შესულ უცხოს **მის საკუთარ**
     * ჩანაწერებზე მოჭრიდა. სახელები ლექსიკონიდან `owner`-ის გარეშე იკითხება;
     * ურნაში მყოფი ჟანრი (`trash`) არ ჩანს.
     *
     * @param  array<string, mixed>  $spec
     * @return list<array{value: string, name_ka: ?string, name_en: ?string, count: int}>
     */
    private function classifierFacet(User $owner, string $domain, array $spec): array
    {
        if (! ShareDomain::hasClassifier($domain)) {
            return [];
        }

        $scope = ShareScope::query($owner, $domain, $spec);
        $table = $scope->getModel()->getTable();
        $ids = $scope->select($table.'.id');

        if (ShareDomain::classifierIsGlobal($domain)) {
            $counts = DB::table('genreables')
                ->where('genreable_type', $domain)
                ->whereIn('genreable_id', $ids)
                ->groupBy('genre_id')
                ->select('genre_id as entry', DB::raw('count(*) as aggregate'))
                ->pluck('aggregate', 'entry');
        } else {
            $shape = ShareDomain::classifierShape($domain);

            $counts = $shape['type'] === 'column'
                ? DB::table($table)
                    ->whereIn('id', $ids)
                    ->whereNotNull($shape['column'])
                    ->groupBy($shape['column'])
                    ->select($shape['column'].' as entry', DB::raw('count(*) as aggregate'))
                    ->pluck('aggregate', 'entry')
                : DB::table($shape['table'])
                    ->whereIn($shape['foreign'], $ids)
                    ->groupBy($shape['related'])
                    ->select($shape['related'].' as entry', DB::raw('count(*) as aggregate'))
                    ->pluck('aggregate', 'entry');
        }

        if ($counts->isEmpty()) {
            return [];
        }

        $model = (string) ShareDomain::classifier($domain)['model'];

        return $model::withoutGlobalScope('owner')
            ->whereIn('id', $counts->keys()->all())
            ->get()
            ->map(fn (Model $entry) => [
                'value' => ShareDomain::classifierValue($domain, $entry),
                'name_ka' => $entry->getAttribute('name_ka'),
                'name_en' => $entry->getAttribute('name_en'),
                'count' => (int) ($counts[$entry->getKey()] ?? 0),
            ])
            ->sortByDesc('count')
            ->values()
            ->all();
    }
}
