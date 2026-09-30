<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ApprovalRequestResource;
use App\Models\ApprovalRequest;
use App\Models\Module;
use App\Support\UploadLimits;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * მომხმარებლის მხარე: მოდულის ჩართვის, საცავისა და ატვირთვის ლიმიტის (§34.5)
 * მოთხოვნები და საკუთარი მოთხოვნების სია.
 * ჟანრის წაშლის მოთხოვნა GenreController::destroy()-იდან იქმნება.
 */
class ApprovalRequestController extends Controller
{
    /** ჩემი მოთხოვნები */
    public function index(Request $request)
    {
        $items = ApprovalRequest::where('user_id', $request->user()->id)
            ->with(['module', 'genre', 'reviewer'])
            ->orderByDesc('id')
            ->get();

        return ApprovalRequestResource::collection($items);
    }

    /** მოდულის ჩართვის თხოვნა ადმინთან */
    public function storeModuleRequest(Request $request)
    {
        /* ⚠️ §37.6 — **პირადი მოდულის მოთხოვნა არ არსებობს**, და მისი გასაღები
           უცნობის პასუხს იღებს (422). აქამდე `exists:modules,key` ნებისმიერ
           გასაღებს უშვებდა: სხვისი პირადი მოდულის გასაღები 201-ს აბრუნებდა,
           უცნობი კი 422-ს — ე.ი. endpoint ნებისმიერი ანგარიშისთვის არსებობის
           ორაკული იყო (Q28), ადმინი კი `/requests`-ზე სხვისი მოდულის სახელს
           ხედავდა და დამტკიცებით მას მესამე პირს მიაბამდა. */
        $data = $request->validate([
            'module_key' => ['required', 'string', Rule::exists('modules', 'key')->whereNull('owner_id')],
            'message' => ['nullable', 'string', 'max:1000'],
        ]);

        $user = $request->user();
        $module = Module::base()->where('key', $data['module_key'])->firstOrFail();

        if (! $module->is_active) {
            return response()->json(['message' => 'module_inactive'], 422);
        }

        if ($user->hasModule($module->key)) {
            return response()->json(['message' => 'module_already_enabled'], 422);
        }

        $existing = ApprovalRequest::where('user_id', $user->id)
            ->where('module_id', $module->id)
            ->where('type', ApprovalRequest::TYPE_MODULE)
            ->pending()
            ->first();

        if ($existing) {
            return (new ApprovalRequestResource($existing->load(['module'])))
                ->response()->setStatusCode(200);
        }

        $req = ApprovalRequest::create([
            'user_id' => $user->id,
            'type' => ApprovalRequest::TYPE_MODULE,
            'module_id' => $module->id,
            'message' => $data['message'] ?? null,
            'status' => 'pending',
        ]);

        return (new ApprovalRequestResource($req->load(['module'])))
            ->response()->setStatusCode(201);
    }

    /**
     * 17.4 — საცავის ლიმიტის გაზრდის მოთხოვნა.
     *
     * ⚠️ `requested_bytes` **სასურველი სრული ლიმიტია** და არა მატება: ასე
     * დამტკიცება დეტერმინისტულია — ადმინი რომც შუალედში შეცვალოს კვოტა,
     * შედეგი ერთი და იგივე რიცხვია. მატება რომ გვეწერა, ორი დამტკიცება
     * ერთმანეთს დაუჯამდებოდა.
     */
    public function storeStorageRequest(Request $request)
    {
        $user = $request->user();
        $current = (int) $user->storage_quota_bytes;

        $data = $request->validate([
            // ჭერი იგივეა, რაც ადმინის ხელით ცვლილებაზე (`AdminUserController::update`)
            'requested_bytes' => ['required', 'integer', 'min:10485760', 'max:1099511627776'],
            'message' => ['nullable', 'string', 'max:1000'],
        ]);

        if ($data['requested_bytes'] <= $current) {
            return response()->json(['message' => 'storage_request_not_an_increase'], 422);
        }

        $existing = ApprovalRequest::where('user_id', $user->id)
            ->where('type', ApprovalRequest::TYPE_STORAGE)
            ->pending()
            ->first();

        // ერთ user-ს ერთდროულად ერთი ღია მოთხოვნა აქვს — მეორეს ვერ დააგროვებს
        if ($existing) {
            return response()->json(['message' => 'storage_request_pending'], 422);
        }

        $req = ApprovalRequest::create([
            'user_id' => $user->id,
            'type' => ApprovalRequest::TYPE_STORAGE,
            // კონტექსტი მოთხოვნის მომენტისთვის — ადმინი ხედავს, რას ეყრდნობოდა
            'payload' => [
                'requested_bytes' => (int) $data['requested_bytes'],
                'current_bytes' => $current,
                'used_bytes' => (int) $user->storage_used_bytes,
            ],
            'message' => $data['message'] ?? null,
            'status' => 'pending',
        ]);

        return (new ApprovalRequestResource($req))->response()->setStatusCode(201);
    }

    /**
     * **Tasks §34.5 — ატვირთვის ლიმიტის მოთხოვნა** („მინდა ავტვირთო JPG და არ
     * მაქვს — ჩამირთე").
     *
     * ⚠️ **ფორმატი სიიდან ირჩევა** (`UploadLimits::selectable()`): აქტიური
     * შიგთავსი (svg, html, xml, js, php…) **ვერც შეიქმნება** — 422
     * მოთხოვნამდე, და არა დამტკიცებისას: უსაფრთხოების წესი ადმინის
     * ყურადღებაზე არ უნდა ეკიდოს.
     *
     * ⚠️ **payload-ში მხოლოდ ახალი ფორმატი იწერება** — ის, რაც უკვე აქვს,
     * ადმინს „ჩართვად" არ უნდა ეჩვენოს. ზომაც მხოლოდ ზრდაა; არაფერი ახალი
     * → **422 `upload_request_nothing_new`** (კვოტის `not_an_increase`-ის წესი).
     *
     * ⚠️ **ერთ სახეობაზე ერთი ღია მოთხოვნა** — მეორე ადმინის რიგს უაზროდ
     * გაზრდიდა; სხვადასხვა სახეობაზე კი ერთდროულად შეიძლება.
     */
    public function storeUploadRequest(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'kind' => ['required', 'string', Rule::in(array_keys(UploadLimits::KINDS))],
            'formats' => ['nullable', 'array', 'max:60'],
            'formats.*' => ['string', 'max:10'],
            'max_kb' => ['nullable', 'integer', 'min:'.UploadLimits::MIN_KB, 'max:'.UploadLimits::CEILING_KB],
            'message' => ['nullable', 'string', 'max:1000'],
        ]);

        $kind = $data['kind'];
        $wanted = $data['formats'] ?? [];

        if ($wanted !== [] && UploadLimits::isLocked($kind)) {
            return response()->json(['message' => 'upload_formats_locked'], 422);
        }

        $bad = UploadLimits::outside($kind, $wanted);

        if ($bad !== []) {
            return response()->json(['message' => 'upload_format_not_allowed', 'kind' => $kind, 'formats' => $bad], 422);
        }

        $current = UploadLimits::effective($kind, $user);
        $formats = array_values(array_diff(
            array_intersect(UploadLimits::selectable($kind), array_map('strtolower', $wanted)),
            $current['formats'],
        ));
        $maxKb = isset($data['max_kb']) && (int) $data['max_kb'] > $current['max_kb'] ? (int) $data['max_kb'] : null;

        if ($formats === [] && $maxKb === null) {
            return response()->json(['message' => 'upload_request_nothing_new'], 422);
        }

        $pending = ApprovalRequest::where('user_id', $user->id)
            ->where('type', ApprovalRequest::TYPE_UPLOAD)
            ->pending()
            ->get()
            ->contains(fn (ApprovalRequest $r) => ($r->payload['kind'] ?? null) === $kind);

        if ($pending) {
            return response()->json(['message' => 'upload_request_pending'], 422);
        }

        $req = ApprovalRequest::create([
            'user_id' => $user->id,
            'type' => ApprovalRequest::TYPE_UPLOAD,
            // კონტექსტი მოთხოვნის მომენტისთვის — ადმინი ხედავს, რას ეყრდნობოდა
            'payload' => [
                'kind' => $kind,
                'formats' => $formats,
                'max_kb' => $maxKb,
                'current_max_kb' => $current['max_kb'],
                'current_formats' => $current['formats'],
            ],
            'message' => $data['message'] ?? null,
            'status' => 'pending',
        ]);

        return (new ApprovalRequestResource($req))->response()->setStatusCode(201);
    }

    /** მოთხოვნის გაუქმება (მხოლოდ საკუთარი, მხოლოდ pending) */
    public function destroy(Request $request, ApprovalRequest $approvalRequest)
    {
        abort_unless($approvalRequest->user_id === $request->user()->id, 404);

        if ($approvalRequest->status !== 'pending') {
            return response()->json(['message' => 'already_reviewed'], 422);
        }

        $approvalRequest->delete();

        return response()->noContent();
    }
}
