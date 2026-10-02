<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ShareLink;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Share\ShareImporter;
use App\Services\Share\ShareMatcher;
use App\Services\Share\ShareResolver;
use App\Services\Share\ShareScope;
use App\Support\ShareDomain;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * **ბმულიდან საკუთარ ბიბლიოთეკაში დამატება — შესულისთვის (Tasks §40.8).**
 *
 * ორი ბიჯი, ზუსტად CSV-იმპორტის (FEAT-07) ფორმით:
 *  · `POST /shares/{token}/plan` — რა შედის არჩევანში და რომელი უკვე გაქვს.
 *    ⚠️ **გარე წყაროს არ ეკითხება**: 300 ფილმი 300 TMDB-მოთხოვნა იქნებოდა
 *    მხოლოდ რიცხვის საჩვენებლად. მდგომარეობა: ახალი · გაქვს · ურნაშია.
 *  · `POST /shares/{token}/item` — ერთი ჩანაწერი; რიგი თითოს ცალკე აგზავნის
 *    (`syncDelayMs`-ის პაუზით — თითო ერთეული TMDB-ს ეკითხება).
 *
 * ⚠️ **ჩანაწერი ბმულის ფარგლებში ხელახლა იკითხება** (`ShareScope::query()`):
 * კლიენტს ვენდობით იმაში, *რას* ითხოვს, და არა იმაში, *რა არის* ბმულში —
 * ფარგლის გარეთ მყოფი id 404-ია, სხვა ფილმის id კი ბმულით ვერ გამოიტანება.
 *
 * ⚠️ **უფლება ცხადად კონტროლერშია** (`hasModule` + `create`): `module:`/
 * `permission:` middleware აქ ვერ იმუშავებდა — პარამეტრი ტოკენია და არა
 * `type` (`ImportController::guard()`-ის ფორმა, იგივე კოდებით).
 *
 * ⚠️ **საკუთარი ბმული — 409 `share_own_link`**: „ჩემი ფილმების ჩემთან
 * დამატება" ცარიელი ოპერაციაა და, უარესი, ჟურნალს ცრუ „იმპორტით" აავსებდა.
 */
class ShareImportController extends Controller
{
    public function __construct(
        private ShareImporter $importer,
        private AuditLogger $audit,
    ) {}

    public function plan(Request $request, string $token): JsonResponse
    {
        [$link, $owner] = ShareResolver::resolve($token);
        $viewer = $request->user();
        $this->refuseOwn($viewer, $owner);

        $data = $request->validate([
            'domain' => ['required', 'string', Rule::in(ShareDomain::keys())],
            // არჩეული ბარათები; არ მოსულა — მთელი სექცია
            'ids' => ['nullable', 'array', 'max:'.ShareScope::MAX_IDS],
            'ids.*' => ['integer'],
        ]);

        $domain = $data['domain'];
        $spec = $this->spec($link, $owner, $domain);

        $query = ShareScope::query($owner, $domain, $spec);
        $table = $query->getModel()->getTable();

        if (! empty($data['ids'])) {
            $query->whereIn($table.'.id', array_map('intval', $data['ids']));
        }

        $records = $query->orderByDesc($table.'.id')->get();
        $matches = ShareMatcher::matches($viewer, $domain, $records);

        $items = $records->map(function ($record) use ($matches) {
            $mine = $matches[(int) $record->getKey()] ?? null;

            return [
                'id' => (int) $record->getKey(),
                'title_ka' => $record->title_ka,
                'title_en' => $record->title_en,
                'year' => $record->year,
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
            // ⚠️ „როგორც გამზიარებელს აქვს" მხოლოდ მაშინ, როცა ბმული სტატუსს აზიარებს (Q48)
            'status_modes' => $link->show_status ? ['default', 'owner'] : ['default'],
        ]);
    }

    public function item(Request $request, string $token): JsonResponse
    {
        [$link, $owner] = ShareResolver::resolve($token);
        $viewer = $request->user();
        $this->refuseOwn($viewer, $owner);

        $data = $request->validate([
            'domain' => ['required', 'string', Rule::in(ShareDomain::keys())],
            'id' => ['required', 'integer'],
            'status_mode' => ['nullable', Rule::in(['default', 'owner'])],
        ]);

        $domain = $data['domain'];
        $spec = $this->spec($link, $owner, $domain);
        $module = ShareDomain::module($domain);

        abort_unless($viewer->hasModule($module), 403, 'module_disabled');
        abort_unless($viewer->hasPermission($module, 'create'), 403, 'forbidden');

        $statusMode = $data['status_mode'] ?? 'default';

        // ⚠️ სტატუსი, რომელსაც ბმული არ აზიარებს, ბმულიდანვე ვერ „გაიჟონება"
        if ($statusMode === 'owner' && ! $link->show_status) {
            return response()->json(['message' => 'share_status_hidden'], 422);
        }

        $query = ShareScope::query($owner, $domain, $spec);
        $record = $query->with('genres')->whereKey((int) $data['id'])->first();

        if (! $record) {
            return response()->json(['message' => 'share_record_not_found'], 404);
        }

        $result = $this->importer->add($link, $owner, $viewer, $domain, $record, $statusMode);

        if ($result['result'] === 'added') {
            /* ⚠️ ცალკე `ACTION_*` არ იბადება (FEAT-07-ის წესი): ჩანაწერის შექმნას
               `AuditObserver` ისედაც წერს. აქ მხოლოდ **წყარო** ემატება — „ეს ფილმი
               ნინოს ბმულიდან შემოვიდა" ის ფაქტია, რომელსაც მოდელის ივენთი ვერ იცის. */
            $this->audit->log(AuditLog::ACTION_IMPORT, [
                'module' => $module,
                'subject_type' => $domain,
                'subject_id' => $result['id'],
                'subject_label' => $record->title_ka ?: $record->title_en,
                'new_values' => ['source' => 'share', 'share_link' => $link->id, 'owner' => $owner->username],
            ]);
        }

        return response()->json(['ok' => true, ...$result]);
    }

    /* ---------- დამხმარეები ---------- */

    private function refuseOwn(User $viewer, User $owner): void
    {
        if ((int) $viewer->id === (int) $owner->id) {
            ShareResolver::deny('share_own_link', 409);
        }
    }

    /**
     * სექციის ცოცხალი ფარგალი — ბმულის გარეთ მყოფი ან მფლობელს გათიშული
     * დომენი არ არსებობს (404, მიმღების გვერდის იგივე პასუხი).
     *
     * @return array<string, mixed>
     */
    private function spec(ShareLink $link, User $owner, string $domain): array
    {
        $domains = ShareScope::liveDomains($link, $owner);

        if (! isset($domains[$domain])) {
            ShareResolver::deny('share_not_found', 404);
        }

        return $domains[$domain];
    }
}
