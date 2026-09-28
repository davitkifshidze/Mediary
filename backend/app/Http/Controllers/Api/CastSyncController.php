<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\CastMember;
use App\Services\Audit\AuditLogger;
use App\Services\Cast\CastEnricher;
use App\Services\Cast\CastPool;
use App\Support\AppTime;
use App\Support\CredentialProviders;
use App\Support\MediaDomain;
use App\Support\MissingCredential;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * **მსახიობების მონაცემების მასობრივი სინქრონიზაცია** (Tasks §39).
 *
 * შენი სიტყვები: „მინდა მასობრივი მსახიობების ინფოს სინქრონიზაცია —
 * პროფილი, სოციალები და რაც ხდება ახლა სათითაოდ".
 *
 * ⚠️ **ფორმა `MediaSyncController`-ისაა**: `plan` აბრუნებს რიგს, შემდეგ
 * თითო მსახიობზე ერთი მოკლე რექვესთი მიდის (`ui/queue.tsx`, სახეობა
 * `cast`) — ერთნაკადიანი `artisan serve` არ იბლოკება და გაჩერებაც
 * შესაძლებელია. ერთეული კი ის `CastEnricher::run()`-ია, რასაც მსახიობის
 * გვერდის ღილაკი იძახებს — მხოლოდ ველების სია განსხვავდება.
 *
 * ⚠️ **`module:`/`permission:` middleware აქ ვერ დგას**: მსახიობს მოდული არ
 * აქვს (`cast_members` გლობალური ლექსიკონია). „ვის შეუძლია" ჩართული
 * მედია-მოდული წყვეტს (`CastPool::typesFor()`), ხოლო ავზი **ამ ბიბლიოთეკის**
 * მსახიობებია — სხვისი ჩანაწერის მსახიობი ფარგლებში ვერ მოხვდება.
 *
 * ⚠️ **ჟურნალში ერთი რიგი გაშვებაზე** (§39.6) — იხ. `AuditLog::ACTION_CAST_SYNC`.
 * ის `plan`-ის `start`-ზე იწერება: გეგმა და გაშვება **ერთი query-დან** მოდის
 * (`/purge`-ის წესი), ე.ი. ჟურნალის „რამდენზე" ზუსტად ის რიცხვია, რაც რიგში ჩადგა.
 */
class CastSyncController extends Controller
{
    /**
     * ფარგლები (§39.1).
     *
     * ⚠️ **`never` ნაგულისხმევია**: TMDB-ის ბიუჯეტი საერთოა, ხოლო უკვე
     * განახლებულის ხელახლა კითხვა უმეტესად ხარჯია.
     * ⚠️ **`stale` „არასდროს განახლებულსაც" მოიცავს** — ნიშნის არქონა
     * „უსასრულოდ ძველია" და არა „ახალი" (`Video::downloadStale()`-ის წესი:
     * ცარიელი დრო ძველად ითვლება).
     */
    public const SCOPES = ['never', 'stale', 'all', 'ids'];

    /** „N დღეზე ადრე" — ნაგულისხმევი */
    public const DEFAULT_STALE_DAYS = 30;

    /**
     * სავარაუდო ტემპი — ორი TMDB-მოთხოვნა (ფაქტები + ქართული სახელი) და
     * ფოტო CDN-იდან, პლუს რიგის პაუზა. ⚠️ შეფასებაა და არა გაზომვა.
     */
    private const ITEMS_PER_MINUTE = 45;

    /** „კონკრეტული მსახიობების" ამრჩევის ჭერი — გალერეის `CAST_POOL_LIMIT`-ის ტოლი */
    private const CANDIDATE_LIMIT = 1000;

    public function plan(Request $request, CastEnricher $enricher, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'types' => ['nullable', 'array'],
            'types.*' => [MediaDomain::rule()],
            'scope' => ['nullable', Rule::in(self::SCOPES)],
            'days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'ids' => ['nullable', 'array', 'max:'.self::CANDIDATE_LIMIT],
            'ids.*' => ['integer', 'min:1'],
            // ამრჩევში ძებნა — ბიბლიოთეკაში ათასობით მსახიობი შეიძლება იყოს
            'q' => ['nullable', 'string', 'max:200'],
            'fields' => ['sometimes', 'array', 'min:1'],
            'fields.*' => [Rule::in(CastEnricher::FIELDS)],
            'overwrite_photo' => ['nullable', 'boolean'],
            // ⚠️ გაშვება — იგივე გეგმა + ჟურნალის ერთი რიგი (იხ. კლასის შენიშვნა)
            'start' => ['nullable', 'boolean'],
        ]);

        $types = CastPool::typesFor($request->user(), $data['types'] ?? null);

        if (! $types) {
            return response()->json(['message' => 'module_disabled'], 403);
        }

        $scope = $data['scope'] ?? 'never';
        $days = (int) ($data['days'] ?? self::DEFAULT_STALE_DAYS);
        $ids = array_values(array_unique(array_map('intval', $data['ids'] ?? [])));

        // ⚠️ **ყოველ ჭრილს ახალი query** — `where`/`count` builder-ს ადგილზე
        // ცვლის, ე.ი. ერთი საერთო ობიექტი შემდეგ დათვლას ჩუმად დააბინძურებდა
        // (FEAT-08-ის გაკვეთილი)
        $scoped = fn () => $this->scoped(CastPool::query($types), $scope, $days, $ids);

        // TMDB-ის id-ის გარეშე განახლება შეუძლებელია — ჩუმად არ ვაგდებთ, ვითვლით
        $withoutTmdb = $scoped()->whereNull('tmdb_person_id')->count();

        $members = $scoped()
            ->whereNotNull('tmdb_person_id')
            ->orderBy('name')
            ->orderBy('id')
            ->get();

        $items = $members->map(fn (CastMember $m) => [
            'type' => 'actor',
            'id' => $m->id,
            'title' => $m->name_ka ?: $m->name,
        ])->values()->all();

        $fields = $data['fields'] ?? CastEnricher::FIELDS;

        if ($request->boolean('start') && $items) {
            $audit->log(AuditLog::ACTION_CAST_SYNC, [
                'module' => 'cast',
                'new_values' => array_filter([
                    'count' => count($items),
                    'scope' => $scope,
                    'days' => $scope === 'stale' ? $days : null,
                    'types' => implode(', ', $types),
                    'fields' => implode(', ', $fields),
                    'overwrite_photo' => $request->boolean('overwrite_photo') ?: null,
                ], fn ($value) => $value !== null),
            ]);
        }

        $candidates = $scope === 'ids'
            ? $this->candidates($types, $data['q'] ?? null, $ids)
            : ['list' => [], 'truncated' => false];

        return response()->json([
            'types' => $types,
            'items' => $items,
            'count' => count($items),
            'eta_seconds' => (int) ceil(count($items) * 60 / self::ITEMS_PER_MINUTE),
            'skipped_without_tmdb' => $withoutTmdb,
            // ⚠️ ფარგლების გარეშე — „ბიბლიოთეკაში სულ N მსახიობია", ე.ი.
            // ნულოვანი გეგმა თავის მიზეზს ატარებს („ყველას უკვე განახლებია")
            'pool_total' => CastPool::query($types)->count(),
            'never_synced' => CastPool::query($types)->whereNull('details_synced_at')->count(),
            'cast' => $candidates['list'],
            'cast_truncated' => $candidates['truncated'],
            // ⚠️ გასაღების გარეშე რიგი ყოველ ერთეულზე ჩავარდებოდა — ფანჯარა ამას წინასწარ ამბობს
            'tmdb' => $enricher->configured(),
        ]);
    }

    /**
     * **რიგის ერთი ნაბიჯი** — ერთი მსახიობი.
     *
     * ⚠️ per-item შეცდომა 200-ით ბრუნდება (`ok:false` + `error`), რომ რიგი არ
     * გაწყდეს — `MediaSyncController::item()`-ის იგივე წესი.
     * ⚠️ **ჟურნალი აქ ჩახშობილია** (იხ. `AuditLog::ACTION_CAST_SYNC`) —
     * გაშვების რიგი `plan`-მა უკვე დაწერა.
     */
    public function item(Request $request, CastMember $castMember, CastEnricher $enricher, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'fields' => ['sometimes', 'array', 'min:1'],
            'fields.*' => [Rule::in(CastEnricher::FIELDS)],
            'overwrite_photo' => ['nullable', 'boolean'],
        ]);

        if (! $enricher->configured()) {
            return MissingCredential::response(CredentialProviders::TMDB);
        }

        $result = $audit->suppress(fn () => $enricher->run(
            $castMember,
            $data['fields'] ?? CastEnricher::FIELDS,
            $request->boolean('overwrite_photo'),
        ));

        return response()->json([
            'ok' => $result !== CastEnricher::FAILED,
            // ⚠️ „უცვლელი" და „TMDB-ზე არაფერია" ჩავარდნა არაა — ხელახლა ცდა არაფერს შეცვლის
            'skipped' => in_array($result, [CastEnricher::UNCHANGED, CastEnricher::EMPTY, CastEnricher::NO_ID], true),
            'result' => $result,
            'error' => $result === CastEnricher::FAILED ? ($enricher->lastError() ?? 'tmdb_unavailable') : null,
            'title' => $castMember->refresh()->name_ka ?: $castMember->name,
        ]);
    }

    /** ფარგლების ფილტრი ავზზე */
    private function scoped(Builder $pool, string $scope, int $days, array $ids): Builder
    {
        return match ($scope) {
            'never' => $pool->whereNull('details_synced_at'),
            'stale' => $pool->where(fn ($w) => $w
                ->whereNull('details_synced_at')
                ->orWhere('details_synced_at', '<', AppTime::now()->subDays($days))),
            /* ⚠️ **ცარიელი არჩევანი არაფერს ნიშნავს და არა „ყველას"**
               (`GalleryScope`-ის წესი) — თორემ მონიშვნის მოხსნა მთელ
               ბიბლიოთეკას გაუშვებდა. ⚠️ `whereIn` **ავზზეა**, ე.ი. სხვისი
               ჩანაწერის მსახიობის id აქ უბრალოდ ქრება (§39.7). */
            'ids' => $ids ? $pool->whereIn('id', $ids) : $pool->whereRaw('1 = 0'),
            default => $pool,
        };
    }

    /**
     * „კონკრეტული მსახიობების" ამრჩევი — ავზი ძებნით, სახელით.
     *
     * ⚠️ **მონიშნული ჭერს არ ექვემდებარება** (გალერეის გაკვეთილი): ანბანით
     * გვიან მდგომი მონიშნული მსახიობი ჭრილს მიღმა დარჩებოდა და ეკრანიდან
     * ჩუმად გაქრებოდა, მაშინ როცა რიგში მაინც ზის.
     *
     * @param  list<string>  $types
     * @param  list<int>  $selected
     * @return array{list: list<array<string, mixed>>, truncated: bool}
     */
    private function candidates(array $types, ?string $q, array $selected): array
    {
        $list = CastPool::query($types, null, $q)
            ->orderBy('name')
            ->orderBy('id')
            ->limit(self::CANDIDATE_LIMIT)
            ->get();

        $truncated = $list->count() >= self::CANDIDATE_LIMIT;

        $missing = array_diff($selected, $list->pluck('id')->all());

        if ($missing) {
            $list = $list->concat(CastPool::query($types)->whereIn('id', $missing)->get());
        }

        return [
            'list' => $list->map(fn (CastMember $m) => [
                'id' => $m->id,
                'name' => $m->name,
                'name_ka' => $m->name_ka,
                'has_tmdb' => (bool) $m->tmdb_person_id,
                'details_synced_at' => $m->details_synced_at?->toIso8601String(),
            ])->values()->all(),
            'truncated' => $truncated,
        ];
    }
}
