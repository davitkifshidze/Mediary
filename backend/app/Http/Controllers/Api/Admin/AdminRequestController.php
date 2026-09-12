<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\ApprovalRequestResource;
use App\Models\ApprovalRequest;
use App\Services\Genres\GenreRemover;
use Illuminate\Http\Request;

/**
 * მოთხოვნების განხილვა (I4): მოდულის ჩართვა და გლობალური ჟანრის წაშლა.
 */
class AdminRequestController extends Controller
{
    public function index(Request $request)
    {
        $status = $request->string('status')->toString() ?: 'pending';

        $items = ApprovalRequest::query()
            ->when($status !== 'all', fn ($q) => $q->where('status', $status))
            ->with(['user', 'module', 'genre', 'reviewer'])
            ->orderByDesc('id')
            ->get();

        return ApprovalRequestResource::collection($items);
    }

    /** რამდენი მოთხოვნაა რიგში — ჰედერის/საიდბარის badge-ისთვის */
    public function pendingCount()
    {
        return response()->json(['pending' => ApprovalRequest::pending()->count()]);
    }

    public function approve(Request $request, ApprovalRequest $approvalRequest, GenreRemover $remover)
    {
        if ($approvalRequest->status !== 'pending') {
            return response()->json(['message' => 'already_reviewed'], 422);
        }

        $note = $request->input('review_note');

        $result = match ($approvalRequest->type) {
            ApprovalRequest::TYPE_MODULE => $this->approveModule($approvalRequest),
            ApprovalRequest::TYPE_GENRE_DELETE => $this->approveGenreDelete($approvalRequest, $remover),
            ApprovalRequest::TYPE_STORAGE => $this->approveStorage($approvalRequest, $request),
            default => ['ok' => false, 'reason' => 'unknown_type'],
        };

        if (! $result['ok']) {
            return response()->json([
                'message' => $result['reason'],
                'movies_count' => $result['movies_count'] ?? null,
                'series_count' => $result['series_count'] ?? null,
            ], 422);
        }

        $approvalRequest->forceFill([
            'status' => 'approved',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'review_note' => $note,
        ])->save();

        return new ApprovalRequestResource($approvalRequest->load(['user', 'module', 'genre', 'reviewer']));
    }

    public function reject(Request $request, ApprovalRequest $approvalRequest)
    {
        if ($approvalRequest->status !== 'pending') {
            return response()->json(['message' => 'already_reviewed'], 422);
        }

        $approvalRequest->forceFill([
            'status' => 'rejected',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'review_note' => $request->input('review_note'),
        ])->save();

        return new ApprovalRequestResource($approvalRequest->load(['user', 'module', 'genre', 'reviewer']));
    }

    /* ---------- handler-ები ტიპების მიხედვით ---------- */

    private function approveModule(ApprovalRequest $req): array
    {
        if (! $req->module) {
            return ['ok' => false, 'reason' => 'module_missing'];
        }

        $req->user->modules()->syncWithoutDetaching([
            $req->module_id => ['enabled_at' => now()],
        ]);

        return ['ok' => true];
    }

    /**
     * 17.4 — ლიმიტის გაზრდა. ადმინს შეუძლია **სხვა რიცხვზე** დათანხმდეს
     * (`granted_bytes`) — მოთხოვნილი 5 GB-ის ნაცვლად 2 GB-ის მიცემა უარი
     * არაა და ცალკე ნაკადს არ იმსახურებს. რეალურად მინიჭებული payload-შივე
     * ჩაიწერება, რომ ისტორიაში ორივე რიცხვი ჩანდეს.
     */
    private function approveStorage(ApprovalRequest $req, Request $request): array
    {
        if (! $req->user) {
            return ['ok' => false, 'reason' => 'user_missing'];
        }

        $payload = $req->payload ?? [];
        $granted = (int) ($request->input('granted_bytes') ?: ($payload['requested_bytes'] ?? 0));

        if ($granted < 10485760 || $granted > 1099511627776) {
            return ['ok' => false, 'reason' => 'storage_request_out_of_range'];
        }

        $req->user->forceFill(['storage_quota_bytes' => $granted])->save();
        $req->payload = [...$payload, 'granted_bytes' => $granted];

        return ['ok' => true];
    }

    private function approveGenreDelete(ApprovalRequest $req, GenreRemover $remover): array
    {
        if (! $req->genre) {
            // ჟანრი უკვე წაშლილია — მოთხოვნა შესრულებულად ჩაითვლება
            return ['ok' => true];
        }

        $payload = $req->payload ?? [];

        return $remover->remove(
            $req->genre,
            isset($payload['reassign_to']) ? (int) $payload['reassign_to'] : null,
            (bool) ($payload['force'] ?? false),
        );
    }
}
