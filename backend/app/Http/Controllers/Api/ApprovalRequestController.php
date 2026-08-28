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
