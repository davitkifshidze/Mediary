<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Genre;
use App\Models\ShareLink;
use App\Models\User;
use App\Services\Modules\FieldSettings;
use App\Services\Profile\PublicProfileService;
use App\Services\Share\ShareScope;
use App\Support\Like;
use App\Support\PublicDomain;
use App\Support\ShareDomain;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Exceptions\HttpResponseException;
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
    ) {}

    /** ბმულის თავი: ვინ გაგიზიარა, სექციები რაოდენობებით, ვადა */
    public function show(Request $request, string $token): JsonResponse
    {
        [$link, $owner] = $this->resolve($token);

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
        [$link, $owner] = $this->resolve($token);

        $domains = ShareScope::liveDomains($link, $owner);
        // ⚠️ ბმულის გარეთ მყოფი (ან მას შემდეგ გათიშული) დომენი არ არსებობს
        if (! isset($domains[$domain])) {
            $this->deny('share_not_found', 404);
        }

        $spec = $domains[$domain];
        $viewer = $request->user();
        $own = $viewer !== null && (int) $viewer->id === (int) $owner->id;

        $query = ShareScope::query($owner, $domain, $spec);
        $table = $query->getModel()->getTable();

        $term = trim((string) $request->query('q', ''));
        if ($term !== '') {
            $query->whereHas('translations', fn ($t) => $t->where('title', 'like', Like::contains($term)));
        }

        $genre = trim((string) $request->query('genre', ''));
        if ($genre !== '') {
            $query->whereHas('genres', fn ($g) => $g->where('slug', $genre));
        }

        $perPage = min(max((int) $request->integer('per_page', self::PER_PAGE), 1), 100);
        $page = max(1, (int) $request->integer('page', 1));

        $paginator = $query->with('genres')
            ->orderByDesc($table.'.id')
            ->paginate($perPage, ['*'], 'page', $page);

        $records = $paginator->getCollection();
        $hidden = $this->fields->hiddenOnPublic($owner, ShareDomain::module($domain));
        $mine = $viewer !== null && ! $own ? $this->inLibrary($viewer, $domain, $records) : [];

        return response()->json([
            'data' => $records->map(fn (Model $record) => $this->card($link, $domain, $record, $hidden, $mine, $viewer !== null && ! $own))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
            'genres' => in_array('genres', $hidden, true) ? [] : $this->genreFacet($owner, $domain, $spec),
        ]);
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * ბმული და მისი მფლობელი — ან 404 / 410.
     *
     * @return array{0: ShareLink, 1: User}
     */
    private function resolve(string $token): array
    {
        if (! config('mediary.share_links')) {
            $this->deny('share_not_found', 404);
        }

        $link = ShareLink::findByToken($token);

        if (! $link) {
            $this->deny('share_not_found', 404);
        }

        $owner = User::find($link->user_id);

        // ⚠️ გათიშული ანგარიშის ბმული „არ არსებობს" და არა „ამოიწურა"
        if (! $owner || ! $owner->is_active) {
            $this->deny('share_not_found', 404);
        }

        if ($link->isRevoked()) {
            $this->deny('share_revoked', 410);
        }

        if ($link->isExpired()) {
            $this->deny('share_expired', 410);
        }

        return [$link, $owner];
    }

    /** @return never */
    private function deny(string $code, int $status): void
    {
        throw new HttpResponseException(response()->json(['message' => $code], $status));
    }

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
     * ვიწრო ბარათი + ჟანრები (+ შესულს `in_library`).
     *
     * ⚠️ **`poster` → `image`** — ველების კატალოგი მთავარ ფოტოს `poster`-ს
     * ეძახის, ბარათი — `image`-ს (§33-ის ცნობილი შეუსაბამობა). აქ ის
     * ითარგმნება, თორემ მფლობელის „ბარათზე არ გამოჩნდეს" პოსტერზე არაფერს
     * იზამდა.
     *
     * @param  list<string>  $hidden
     * @param  array<string, array{id: int, trashed: bool}>  $mine
     */
    private function card(ShareLink $link, string $domain, Model $record, array $hidden, array $mine, bool $mark): array
    {
        $card = PublicDomain::card($domain, $record, $hidden);

        if (in_array('poster', $hidden, true)) {
            unset($card['image']);
        }

        if (! $link->show_status) {
            unset($card['status']);
        }

        // მედიის `rating` TMDB-ის ქულაა და არა მფლობელის — გადამრთველი მას არ ეხება
        if (! $link->show_rating && ShareDomain::hasPersonalRating($domain)) {
            unset($card['rating']);
        }

        if (! in_array('genres', $hidden, true)) {
            $card['genres'] = $record->genres
                ->map(fn (Genre $g) => ['slug' => $g->slug, 'name_ka' => $g->name_ka, 'name_en' => $g->name_en])
                ->values()
                ->all();
        }

        if ($mark) {
            $card['in_library'] = $mine[$this->identityKey($domain, $record) ?? ''] ?? null;
        }

        return $card;
    }

    /**
     * „უკვე გაქვს ✓" — მნახველის ჩანაწერები იმავე იდენტობით (`PublicDomain::MATCH`).
     *
     * ⚠️ **ურნაც ჩანს** (`trashed: true`) — 40.1-ის გაკვეთილი: „არ გაქვს"
     * ურნაში მყოფზე ტყუილი იქნებოდა და დამატება 409-ზე წაიქცეოდა.
     * ⚠️ **ერთი query გვერდზე** და არა ჩანაწერზე.
     *
     * @param  Collection<int, Model>  $records
     * @return array<string, array{id: int, trashed: bool}>
     */
    private function inLibrary(User $viewer, string $domain, Collection $records): array
    {
        $columns = PublicDomain::MATCH[$domain]['columns'] ?? [];
        $first = $columns[0] ?? null;

        if ($first === null) {
            return [];
        }

        $values = $records->pluck($first)->filter(fn ($v) => $v !== null && $v !== '')->unique()->values()->all();

        if ($values === []) {
            return [];
        }

        $model = ShareDomain::model($domain);

        // ⚠️ `withOnly([])` — მოდელის `$with` (თარგმანი, სტატუსი) აქ ზედმეტი query-ა
        $rows = $model::withoutGlobalScopes(['owner', 'trash'])
            ->withOnly([])
            ->where('user_id', $viewer->id)
            ->whereIn($first, $values)
            ->get(['id', 'trashed_at', ...$columns]);

        $out = [];
        foreach ($rows as $row) {
            $key = $this->identityKey($domain, $row);

            // ⚠️ ცოცხალი ურნაში მყოფზე უპირატესია — ორივე თუ არის, „გაქვს"
            if ($key !== null && (! isset($out[$key]) || $out[$key]['trashed'])) {
                $out[$key] = ['id' => (int) $row->id, 'trashed' => $row->trashed_at !== null];
            }
        }

        return $out;
    }

    /** იდენტობის გასაღები — ცარიელ სვეტზე `null` (ასეთი ჩანაწერი არ ემთხვევა) */
    private function identityKey(string $domain, Model $record): ?string
    {
        $parts = [];

        foreach (PublicDomain::MATCH[$domain]['columns'] ?? [] as $column) {
            $value = $record->getAttribute($column);

            if ($value === null || $value === '') {
                return null;
            }

            $parts[] = (string) $value;
        }

        return $parts === [] ? null : implode("\x1f", $parts);
    }

    /**
     * სექციის ჟანრები რაოდენობებით — ფილტრისთვის.
     *
     * ⚠️ **ძებნისა და ჟანრის ფილტრის გარეშე** ითვლება: თორემ ერთი ჟანრის
     * არჩევისას დანარჩენები სიიდან გაქრებოდა და გადართვა შეუძლებელი გახდებოდა.
     * ⚠️ **ნედლი `genreables`** და არა `Genre::movies()`: იმ რელაციას `owner`
     * scope მოჰყვება, რომელიც შესულ უცხოს **მის საკუთარ** ფილმებზე მოჭრიდა.
     *
     * @param  array<string, mixed>  $spec
     * @return list<array{slug: string, name_ka: ?string, name_en: ?string, count: int}>
     */
    private function genreFacet(User $owner, string $domain, array $spec): array
    {
        $scope = ShareScope::query($owner, $domain, $spec);
        $ids = $scope->select($scope->getModel()->getTable().'.id');

        $counts = DB::table('genreables')
            ->where('genreable_type', $domain)
            ->whereIn('genreable_id', $ids)
            ->groupBy('genre_id')
            ->select('genre_id', DB::raw('count(*) as aggregate'))
            ->pluck('aggregate', 'genre_id');

        if ($counts->isEmpty()) {
            return [];
        }

        return Genre::whereIn('id', $counts->keys())
            ->get()
            ->map(fn (Genre $g) => [
                'slug' => $g->slug,
                'name_ka' => $g->name_ka,
                'name_en' => $g->name_en,
                'count' => (int) ($counts[$g->id] ?? 0),
            ])
            ->sortByDesc('count')
            ->values()
            ->all();
    }
}
