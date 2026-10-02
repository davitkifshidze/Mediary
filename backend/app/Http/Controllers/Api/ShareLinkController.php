<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ShareLink;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Share\ShareScope;
use App\Support\AppTime;
use App\Support\ShareDomain;
use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * **გაზიარების ბმულების მართვა — მფლობელის მხარე (Tasks §40.4–40.5).**
 *
 * ⚠️ `{shareLink}` მოდელზე ებმება: `BelongsToUser` + `EnsureRecordOwnership`
 * სხვის ბმულს თვითონ აქცევს 404-ად, ე.ი. აქ ცალკე შემოწმება არ სჭირდება.
 *
 * ⚠️ **`module:`/`permission:` middleware აქ არ დგას** — ბმული სამ დომენს
 * ერთად ფარავს და დომენი პარამეტრში კი არა, სხეულშია. უფლება
 * `ShareDomain::availableFor()`-ით მოწმდება (`ShareScope::normalize()`).
 */
class ShareLinkController extends Controller
{
    public function __construct(private AuditLogger $audit) {}

    /** ჩემი ბმულები — ახლები ზემოთ */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $links = ShareLink::query()->latest('id')->get();

        return response()->json([
            'data' => (function () use ($links, $user) {
                // ⚠️ „ვინ დაიმატა" ერთი query-თი მთელ სიაზე და არა ბმულზე
                $importers = $this->importers($links->pluck('id')->all());

                return $links->map(fn (ShareLink $link) => $this->payload($link, $user, $importers[$link->id] ?? []))
                    ->values()
                    ->all();
            })(),
            'meta' => [
                'enabled' => $this->enabled(),
                'available' => ShareDomain::availableFor($user),
                'expiry_days' => ShareLink::EXPIRY_DAYS,
                'default_expiry_days' => ShareLink::DEFAULT_EXPIRY_DAYS,
            ],
        ]);
    }

    /**
     * **რამდენი მოხვდება ბმულში** (`GET` — მხოლოდ ითვლის).
     *
     * ⚠️ რიცხვი იმავე `ShareScope::query()`-დან მოდის, რომელიც მიმღების
     * გვერდს ხატავს — „ფანჯარამ 128 თქვა, ბმულში 125-ია" ვერ მოხდება.
     */
    public function preview(Request $request): JsonResponse
    {
        $data = $request->validate(ShareScope::rules());
        $user = $request->user();

        return response()->json(ShareScope::counts($user, ShareScope::normalize($user, $data['domains'])));
    }

    public function store(Request $request): JsonResponse
    {
        if (! $this->enabled()) {
            return response()->json(['message' => 'share_links_disabled'], 409);
        }

        $data = $request->validate([...ShareScope::rules(), ...$this->settingsRules()]);
        $user = $request->user();

        $link = new ShareLink([
            'name' => $data['name'] ?? null,
            'domains' => ShareScope::normalize($user, $data['domains']),
            'show_status' => (bool) ($data['show_status'] ?? true),
            'show_rating' => (bool) ($data['show_rating'] ?? true),
        ]);
        $link->user_id = $user->id;
        $link->expires_at = $this->expiry(
            array_key_exists('expires_days', $data) ? $data['expires_days'] : ShareLink::DEFAULT_EXPIRY_DAYS,
        );
        $link->assignNewToken();
        $link->save();

        return response()->json(['data' => $this->payload($link, $user)], 201);
    }

    /**
     * რედაქტირება — **URL იგივე რჩება** (ტოკენი არ იცვლება).
     *
     * ⚠️ `expires_days` მხოლოდ მაშინ ცვლის ვადას, როცა მოსულია — და ვადას
     * **ახლიდან** ითვლის („კიდევ 30 დღე"), არა შექმნის დღიდან.
     * ⚠️ `revoked: false` გაუქმებულს აბრუნებს; გამორთულ მექანიზმზე ეს
     * ბმულის ხელახლა გახსნა იქნებოდა, ამიტომ მაშინ 409-ია.
     */
    public function update(Request $request, ShareLink $shareLink): JsonResponse
    {
        $rules = ShareScope::rules();
        $rules['domains'] = ['sometimes', ...$rules['domains']];

        $data = $request->validate([...$rules, ...$this->settingsRules(), 'revoked' => ['sometimes', 'boolean']]);
        $user = $request->user();

        if (array_key_exists('revoked', $data) && ! $data['revoked'] && ! $this->enabled()) {
            return response()->json(['message' => 'share_links_disabled'], 409);
        }

        if (array_key_exists('domains', $data)) {
            $shareLink->domains = ShareScope::normalize($user, $data['domains']);
        }

        foreach (['name', 'show_status', 'show_rating'] as $key) {
            if (array_key_exists($key, $data)) {
                $shareLink->{$key} = $data[$key];
            }
        }

        if (array_key_exists('expires_days', $data)) {
            $shareLink->expires_at = $this->expiry($data['expires_days']);
        }

        if (array_key_exists('revoked', $data)) {
            $shareLink->revoked_at = $data['revoked'] ? ($shareLink->revoked_at ?? AppTime::now()) : null;
        }

        $shareLink->save();

        return response()->json(['data' => $this->payload($shareLink, $user)]);
    }

    public function destroy(ShareLink $shareLink)
    {
        $shareLink->delete();

        return response()->noContent();
    }

    /**
     * **ახალი ბმული — ძველი კვდება.** ძველი ტოკენის ჰეში იცვლება, ე.ი. ის
     * უბრალოდ აღარ მოიძებნება (404). გაუქმებულიც ამით ცოცხლდება.
     *
     * ⚠️ **ჟურნალი ხელით იწერება**: ცვლილება მხოლოდ ტოკენის ორი სვეტია, ორივე
     * `AuditRegistry::HIDDEN`-შია, ე.ი. ავტომატური „განახლდა" ცარიელი რიგი
     * იქნებოდა და ვერაფერს იტყოდა. `saveQuietly()` იმიტომ, რომ ეს ცარიელი
     * რიგი საერთოდ არ ჩაიწეროს.
     */
    public function regenerate(Request $request, ShareLink $shareLink): JsonResponse
    {
        if (! $this->enabled()) {
            return response()->json(['message' => 'share_links_disabled'], 409);
        }

        $wasRevoked = $shareLink->isRevoked();

        $shareLink->assignNewToken();
        $shareLink->revoked_at = null;
        $shareLink->saveQuietly();

        $this->audit->model(
            $shareLink,
            AuditLog::ACTION_UPDATE,
            $wasRevoked ? ['revoked' => true] : null,
            ['regenerated' => true] + ($wasRevoked ? ['revoked' => false] : []),
        );

        return response()->json(['data' => $this->payload($shareLink, $request->user())]);
    }

    /* ---------- დამხმარეები ---------- */

    private function enabled(): bool
    {
        return (bool) config('mediary.share_links');
    }

    /** @return array<string, list<mixed>> */
    private function settingsRules(): array
    {
        return [
            'name' => ['sometimes', 'nullable', 'string', 'max:80'],
            'show_status' => ['sometimes', 'boolean'],
            'show_rating' => ['sometimes', 'boolean'],
            // `null` — უვადო
            'expires_days' => ['sometimes', 'nullable', Rule::in(ShareLink::EXPIRY_DAYS)],
        ];
    }

    private function expiry(mixed $days): ?CarbonInterface
    {
        return $days === null || $days === '' ? null : AppTime::now()->addDays((int) $days);
    }

    /**
     * ბმული მფლობელის ეკრანისთვის.
     *
     * ⚠️ რიცხვები **ცოცხალია** (Q47) და მხოლოდ იმ დომენებზე, რაც მფლობელს ჯერ
     * კიდევ შეუძლია გააზიაროს; გათიშული მოდულის დომენი `unavailable`-ში
     * ჩანს — ბმულიდან ის მიმღებისთვის ჩუმად ქრება და მფლობელმა ეს უნდა იცოდეს.
     */
    /**
     * ვინ დაიმატა თითო ბმულიდან და რამდენი (Tasks §40.5/§40.8) — ახლები ზემოთ.
     *
     * ⚠️ მხოლოდ username და საჩვენებელი სახელი გადის — მფლობელს მეტი არაფერი
     * სჭირდება და მიმღების ელფოსტა მისი საქმე არ არის.
     *
     * @param  list<int>  $ids
     * @return array<int, list<array{username: ?string, display_name: string, added: int, last_added_at: ?string}>>
     */
    private function importers(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $rows = DB::table('share_link_imports')
            ->join('users', 'users.id', '=', 'share_link_imports.user_id')
            ->whereIn('share_link_imports.share_link_id', $ids)
            ->orderByDesc('share_link_imports.last_added_at')
            ->get([
                'share_link_imports.share_link_id',
                'share_link_imports.added',
                'share_link_imports.last_added_at',
                'users.username',
                'users.name',
                'users.first_name',
                'users.last_name',
            ]);

        $out = [];

        foreach ($rows as $row) {
            $full = trim(($row->first_name ?? '').' '.($row->last_name ?? ''));

            $out[(int) $row->share_link_id][] = [
                'username' => $row->username,
                'display_name' => $full ?: ($row->name ?: (string) $row->username),
                'added' => (int) $row->added,
                'last_added_at' => $row->last_added_at
                    ? Carbon::parse((string) $row->last_added_at)->toIso8601String()
                    : null,
            ];
        }

        return $out;
    }

    /**
     * @param  list<array<string, mixed>>|null  $importers  `null` — თვითონ წაიკითხოს (ერთი ბმული)
     */
    private function payload(ShareLink $link, User $owner, ?array $importers = null): array
    {
        $live = ShareScope::liveDomains($link, $owner);
        $counts = [];

        foreach ($live as $domain => $spec) {
            $counts[(string) $domain] = ShareScope::query($owner, (string) $domain, $spec)->count();
        }

        $url = $link->url();

        return [
            'id' => $link->id,
            'name' => $link->name,
            'url' => $url,
            // ⚠️ `APP_KEY` შეიცვალა → ბმული მუშაობს, მაგრამ ღიად ვეღარ ჩანს
            'readable' => $url !== null,
            'domains' => (object) ($link->domains ?? []),
            'counts' => (object) $counts,
            'unavailable' => array_values(array_diff(array_keys((array) $link->domains), array_keys($live))),
            'show_status' => $link->show_status,
            'show_rating' => $link->show_rating,
            'expires_at' => $link->expires_at?->toIso8601String(),
            'revoked_at' => $link->revoked_at?->toIso8601String(),
            'state' => $link->state(),
            'views' => $link->views,
            'imports' => $link->imports,
            'importers' => $importers ?? ($this->importers([$link->id])[$link->id] ?? []),
            'last_opened_at' => $link->last_opened_at?->toIso8601String(),
            'created_at' => $link->created_at?->toIso8601String(),
        ];
    }
}
