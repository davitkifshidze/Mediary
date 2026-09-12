<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ApprovalRequestResource;
use App\Models\ApprovalRequest;
use App\Models\Module;
use Illuminate\Http\Request;

/**
 * მომხმარებლის მხარე: მოდულის ჩართვის მოთხოვნა და საკუთარი მოთხოვნების სია.
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
        $data = $request->validate([
            'module_key' => ['required', 'string', 'exists:modules,key'],
            'message' => ['nullable', 'string', 'max:1000'],
        ]);

        $user = $request->user();
        $module = Module::where('key', $data['module_key'])->firstOrFail();

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
