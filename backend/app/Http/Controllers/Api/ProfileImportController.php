<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Profile\PublicProfileService;
use App\Services\Share\ImportOrigin;
use App\Services\Share\ShareImporter;
use App\Services\Share\ShareMatcher;
use App\Services\Share\ShareScope;
use App\Support\ShareDomain;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * **საჯარო პროფილიდან საკუთარ ბიბლიოთეკაში დამატება — შესულისთვის.**
 *
 * გაზიარების ბმულის (`ShareImportController`) ტყუპია, ოღონდ ფარგალი ბმულის
 * წესი კი არა, **პროფილის სამი ფენაა** (`PublicProfileService::query()` — პროფილი
 * → მოდული → ჩანაწერი, ჩაკეტილი არასდროს). ორი ბიჯი:
 *  · `POST /public-profiles/{username}/plan` — რა შედის არჩევანში და რომელი უკვე გაქვს
 *    (გარე წყაროს არ ეკითხება);
 *  · `POST /public-profiles/{username}/item` — ერთი ჩანაწერი; რიგი თითოს ცალკე აგზავნის.
 *
 * ⚠️ **ჩანაწერი პროფილის query-ით ხელახლა იკითხება**, id-ით და არა `find()`-ით:
 * პირადი, ჩაკეტილი, ურნაში მყოფი ან სხვისი ჩანაწერი აქედან ვერ გამოვა — 404.
 * ⚠️ **ასლი ცალმხრივი და ერთჯერადია** (`ShareImporter`): ფაქტები და მთავარი ფოტო
 * გადმოდის, მფლობელის პირადი ნაწილი (შეფასება, რჩეული, ჩანიშვნები, ფაილები) — არა.
 * ხელახლა გაშვება მხოლოდ მას შემდეგ გასაჯაროებულს ამატებს („უკვე გაქვს" დუბლს არ უშვებს).
 * ⚠️ მფლობელი ამას ვერ ხედავს და შეტყობინებაც არ მიდის — ჟურნალში კი იწერება (`import`).
 */
class ProfileImportController extends Controller
{
    public function __construct(
        private PublicProfileService $profiles,
        private ShareImporter $importer,
        private AuditLogger $audit,
    ) {}

    public function plan(Request $request, string $username): JsonResponse
    {
        $owner = $this->owner($request, $username);
        $viewer = $request->user();

        $data = $request->validate([
            'domain' => ['required', 'string', Rule::in(ShareDomain::keys())],
            // არჩეული ბარათები; არ მოსულა — მთელი სექცია
            'ids' => ['nullable', 'array', 'max:'.ShareScope::MAX_IDS],
            'ids.*' => ['integer'],
        ]);

        $domain = $data['domain'];
        $importable = $this->section($owner, $domain);

        $query = $this->profiles->query($owner, $domain);
        $table = $query->getModel()->getTable();

        if (! empty($data['ids'])) {
            $query->whereIn($table.'.id', array_map('intval', $data['ids']));
        }

        $records = $query->get();
        $matches = ShareMatcher::matches($viewer, $domain, $records);

        $items = $records->map(function ($record) use ($matches, $domain) {
            $mine = $matches[(int) $record->getKey()] ?? null;

            return [
                'id' => (int) $record->getKey(),
                ...ShareDomain::titleOf($domain, $record),
                'state' => $mine === null ? 'new' : ($mine['trashed'] ? 'trash' : 'have'),
                'mine_id' => $mine['id'] ?? null,
            ];
        })->values();

        return response()->json([
            'domain' => $domain,
            'module' => ShareImporter::abilities($viewer, [$domain])[$domain],
            'items' => $items->all(),
            'counts' => [
                'new' => $items->where('state', 'new')->count(),
                'have' => $items->where('state', 'have')->count(),
                'trash' => $items->where('state', 'trash')->count(),
            ],
            'status_modes' => ShareDomain::statusKind($domain) === null
                ? []
                : ($importable['owner_status'] ? ['default', 'owner'] : ['default']),
        ]);
    }

    public function item(Request $request, string $username): JsonResponse
    {
        $owner = $this->owner($request, $username);
        $viewer = $request->user();

        $data = $request->validate([
            'domain' => ['required', 'string', Rule::in(ShareDomain::keys())],
            'id' => ['required', 'integer'],
            'status_mode' => ['nullable', Rule::in(['default', 'owner'])],
        ]);

        $domain = $data['domain'];
        $importable = $this->section($owner, $domain);
        $module = ShareDomain::module($domain);

        abort_unless($viewer->hasModule($module), 403, 'module_disabled');
        abort_unless($viewer->hasPermission($module, 'create'), 403, 'forbidden');

        $statusMode = $data['status_mode'] ?? 'default';

        // ⚠️ სტატუსი, რომელიც მფლობელმა საჯარო ბარათზე დამალა, გადმოტანითაც ვერ „გაიჟონება"
        if ($statusMode === 'owner' && ! $importable['owner_status']) {
            return response()->json(['message' => 'profile_status_hidden'], 422);
        }

        $query = $this->profiles->query($owner, $domain);
        // ⚠️ კლასიფიკატორი `owner` scope-ის გარეშე — სახელით გადატანას მფლობელის ჟანრები სჭირდება
        $record = ShareDomain::withClassifier($query, $domain)->whereKey((int) $data['id'])->first();

        if (! $record) {
            return response()->json(['message' => 'profile_record_not_found'], 404);
        }

        $result = $this->importer->add(ImportOrigin::profile($owner), $viewer, $domain, $record, $statusMode);

        if ($result['result'] === 'added') {
            // ⚠️ ჩანაწერის შექმნას `AuditObserver` ისედაც წერს; აქ მხოლოდ **წყარო** ემატება — ვისი პროფილიდან
            $this->audit->log(AuditLog::ACTION_IMPORT, [
                'module' => $module,
                'subject_type' => $domain,
                'subject_id' => $result['id'],
                'subject_label' => ShareDomain::label($domain, $record),
                'new_values' => [
                    'source' => ImportOrigin::PROFILE,
                    'owner' => $owner->username,
                    ...(isset($result['songs_added']) ? ['songs_added' => $result['songs_added']] : []),
                ],
                // სუპერადმინის „პროფილების" ხედი მფლობელით აჯგუფებს
                'context' => ['owner' => $owner->username, 'owner_id' => (int) $owner->id],
            ]);
        }

        return response()->json(['ok' => true, ...$result]);
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * საჯარო პროფილის მფლობელი — არასაჯარო ან არარსებული 404-ია (გვერდის იგივე პასუხი),
     * საკუთარი — 409 `profile_own`: „ჩემი ჩანაწერების ჩემთან დამატება" ცარიელი ოპერაციაა.
     */
    private function owner(Request $request, string $username): User
    {
        $owner = $this->profiles->resolve($username);
        abort_unless($owner, 404);

        if ((int) $owner->id === (int) $request->user()->id) {
            throw new HttpResponseException(response()->json(['message' => 'profile_own'], 409));
        }

        return $owner;
    }

    /**
     * სექცია, რომელიც პროფილზე ჩანს **და** გადმოსატანია — თორემ 404.
     *
     * @return array{owner_status: bool}
     */
    private function section(User $owner, string $domain): array
    {
        $importable = $this->profiles->importable($owner);

        abort_unless(isset($importable[$domain]), 404);

        return $importable[$domain];
    }
}
