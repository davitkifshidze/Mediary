<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\PublicDomain;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * **Tasks §16.1 — ერთი ჩანაწერის ხილვადობა.**
 *
 * `PATCH /api/visibility/{domain}/{id}` — **ერთი** endpoint რვავე დომენზე,
 * და არა თითო `PATCH /movies/{id}/visibility` (რვა route, რვა კონტროლერის
 * მეთოდი, რვა ადგილი, სადაც წესი შეიძლება დაშორდეს). ნიმუში არსებობს:
 * `/media/sync/{type}/{id}` და `/translations/{type}/{id}` ასევე მუშაობს.
 *
 * ⚠️ **`module:@type`/`permission:@type` middleware აქ განზრახ არ ეწერება.**
 * ის route-ის პარამეტრს პირდაპირ მოდულის key-ად კითხულობს, `playlist` კი
 * მოდული **არაა** — ის `song`-ის შიგნით ცხოვრობს (§15). რუკა
 * `PublicDomain::module()` სწორედ ამას აგვარებს, ამიტომ ორივე შემოწმება
 * (წვდომა + `update` უფლება) აქვე, ცხადად კეთდება.
 *
 * ⚠️ **`PATCH` და არა `POST`** — `EnsureModulePermission` POST-იდან `create`-ს
 * გამოიყვანდა და მხოლოდ რედაქტირების უფლების მქონე user-ს ცრუ 403 დაუბრუნდებოდა.
 */
class VisibilityController extends Controller
{
    /** სიის გვერდის ზომა — ჭერი, რომ ერთი პასუხი არ გაიბეროს */
    private const PER_PAGE_MAX = 100;

    /**
     * **§6.1 — ერთი დომენის ჩანაწერები ხილვადობით.**
     *
     * პროფილზე გადატანილ მართვას სია სჭირდება, ე.ი. „რა მაქვს და რომელია
     * საჯარო" ერთი შეკითხვით უნდა მოვიდეს. ⚠️ **მოდულის `index` განზრახ არ
     * გამოიყენება**: ის სრულ ჩანაწერს აბრუნებს (სინქრონის სტატუსი, ფაილების
     * მრიცხველები, ჩემი პროგრესი) და დომენიდან დომენში ფორმა განსხვავებულია —
     * აქ კი ცხრა დომენს **ერთი** ვიწრო ბარათი სჭირდება (`PublicDomain::card()`),
     * იგივე, რასაც საჯარო პროფილი ხატავს.
     */
    public function index(Request $request, string $domain)
    {
        [, $model] = $this->guard($request, $domain, 'view');

        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'only' => ['nullable', Rule::in(['all', ...PublicDomain::VALUES])],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::PER_PAGE_MAX],
        ]);

        $perPage = (int) ($data['per_page'] ?? 24);
        $page = (int) ($data['page'] ?? 1);

        // ხილვადობის ჯამები **გაფილტვრამდე** — ჩიპების რიცხვები ძებნაზე არ უნდა ხტუნავდეს
        $counts = [
            'public' => $model::query()->where('visibility', 'public')->count(),
            'private' => $model::query()->where('visibility', '!=', 'public')->count(),
        ];

        $query = $this->search($model::query(), $domain, $data['q'] ?? null);
        $only = $data['only'] ?? 'all';

        if ($only === 'public') {
            $query->where('visibility', 'public');
        } elseif ($only === 'private') {
            $query->where('visibility', '!=', 'public');
        }

        // პლეილისტის ბარათი სიმღერების რაოდენობას კითხულობს (`card()`)
        if ($domain === 'playlist') {
            $query->withCount('songs');
        }

        $total = $query->count();
        $records = $query->orderByDesc('id')->forPage($page, $perPage)->get();

        return response()->json([
            'data' => $records->map(fn (Model $record) => [
                ...PublicDomain::card($domain, $record),
                'visibility' => $record->visibility === 'public' ? 'public' : 'private',
            ])->all(),
            'meta' => [
                'total' => $total,
                'page' => $page,
                'per_page' => $perPage,
                'last_page' => max(1, (int) ceil($total / $perPage)),
                ...$counts,
            ],
        ]);
    }

    /**
     * **§6.1 — მასობრივი გადართვა** (`ids[]` ან მთელი დომენი).
     *
     * ⚠️ **სკოუპი ყოველთვის ცხადია** — `all: true` ცალკე დროშაა და არა
     * „ცარიელი `ids`", ე.ი. გამორჩენილი მონიშვნა ვერასდროს გადაიქცევა
     * „ყველაფერში" (იგივე წესი, რაც `PurgeService`-ს აქვს).
     */
    public function bulk(Request $request, string $domain)
    {
        [$user, $model] = $this->guard($request, $domain, 'update');

        $data = $request->validate([
            'visibility' => ['required', Rule::in(PublicDomain::VALUES)],
            'all' => ['nullable', 'boolean'],
            'ids' => ['nullable', 'array', 'max:2000'],
            'ids.*' => ['integer'],
        ]);

        $query = $model::query();

        if (! ($data['all'] ?? false)) {
            $ids = array_values(array_unique(array_map('intval', $data['ids'] ?? [])));

            if (! $ids) {
                return response()->json(['message' => 'nothing_selected'], 422);
            }

            $query->whereIn('id', $ids);
        }

        // `owner` global scope-ი ისედაც ჭრის; ცხადი `user_id` მაინც რჩება —
        // scope `Auth::id()`-ზეა დამოკიდებული და მისი ჩუმად გამორთვა
        // (CLI-კონტექსტი) მასობრივ განახლებას სხვის ჩანაწერზე გაუშვებდა.
        $updated = $query->where('user_id', $user->id)
            ->update(['visibility' => $data['visibility']]);

        return response()->json([
            'domain' => $domain,
            'visibility' => $data['visibility'],
            'updated' => $updated,
        ]);
    }

    public function update(Request $request, string $domain, int $id)
    {
        abort_unless(PublicDomain::has($domain), 404);

        $user = $request->user();
        $module = PublicDomain::module($domain);

        abort_unless($user->hasModule($module), 403, 'module_disabled');
        abort_unless($user->hasPermission($module, 'update'), 403, 'forbidden');

        $data = $request->validate([
            'visibility' => ['required', Rule::in(PublicDomain::VALUES)],
        ]);

        /** @var class-string<Model> $model */
        $model = PublicDomain::model($domain);

        // `owner` global scope ჩართულია → სხვისი ჩანაწერი ისედაც 404-ია.
        // ცხადი შემოწმება მაინც რჩება: scope `Auth::id()`-ზეა დამოკიდებული და
        // მისი ჩუმად გამორთვა (მაგ. CLI-კონტექსტი) აქ 404-ს არ უნდა შლიდეს.
        $record = $model::findOrFail($id);
        abort_unless($record->user_id === $user->id, 404);

        $record->visibility = $data['visibility'];
        $record->save();

        return response()->json([
            'domain' => $domain,
            'id' => $record->id,
            'visibility' => $record->visibility,
        ]);
    }

    /* ---------- შიგნეული ---------- */

    /**
     * დომენის ცნობა + მოდულის წვდომა + უფლება — სამივე ერთ ადგილას, რომ
     * სამი endpoint ერთმანეთს არ დაშორდეს.
     *
     * @return array{0: User, 1: class-string<Model>}
     */
    private function guard(Request $request, string $domain, string $action): array
    {
        abort_unless(PublicDomain::has($domain), 404);

        $user = $request->user();
        $module = PublicDomain::module($domain);

        abort_unless($user->hasModule($module), 403, 'module_disabled');
        abort_unless($user->hasPermission($module, $action), 403, 'forbidden');

        return [$user, PublicDomain::model($domain)];
    }

    /**
     * ძებნა `PublicDomain::SEARCH`-ის რუკით.
     *
     * ⚠️ ფილმი/სერიალი სათაურს **ცალკე ცხრილში** ინახავს, ე.ი. მათზე
     * `whereHas('translations')`-ია და არა სვეტზე `like` — ზუსტად ისე,
     * როგორც `MovieController::index()` ეძებს.
     */
    private function search(mixed $query, string $domain, ?string $term): mixed
    {
        $term = trim((string) $term);

        if ($term === '') {
            return $query;
        }

        $map = PublicDomain::SEARCH[$domain] ?? ['relation' => null, 'columns' => []];

        if ($map['relation']) {
            return $query->whereHas($map['relation'], fn ($q) => $q->where(
                fn ($inner) => $this->orLike($inner, $map['columns'], $term),
            ));
        }

        return $query->where(fn ($q) => $this->orLike($q, $map['columns'], $term));
    }

    /** @param  list<string>  $columns */
    private function orLike(mixed $query, array $columns, string $term): void
    {
        foreach ($columns as $column) {
            $query->orWhere($column, 'like', "%{$term}%");
        }
    }
}
