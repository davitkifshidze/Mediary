<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\ApprovalRequestResource;
use App\Models\ApprovalRequest;
use App\Services\Genres\GenreRemover;
use App\Services\Notify\Notifier;
use App\Support\NotificationType;
use App\Support\UploadLimits;
use Illuminate\Http\Request;

/**
 * მოთხოვნების განხილვა (I4): მოდულის ჩართვა, გლობალური ჟანრის წაშლა,
 * საცავის ლიმიტი (17.4) და ატვირთვის ლიმიტი (§34.5).
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

        /* ⚠️ **მთვლელები პასუხშივე მოდის და არა ცალკე რექვესთით** (2026-09-15).
           ჭრილები აუდიტ-ლოგის ბარათებად გადავიდა, ბარათი კი რიცხვის გარეშე
           იმავე უფერო პილულაა, რაც იყო — „რამდენი დევს რიგში" სწორედ ის
           ფაქტია, რისთვისაც აქ შემოდიხარ.

           ⚠️ **ჭრილი საკუთარ თავს არ ზღუდავს** (აუდიტის `summary()`-ის წესი):
           რიცხვები მთელ ცხრილს ითვლიან, თორემ „რიგის" არჩევისთანავე
           დანარჩენი სამი ნულზე ჩამოვიდოდა და „სხვაგან რა დევს" კითხვას
           პასუხი აღარ ექნებოდა. */
        $counts = ApprovalRequest::query()
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return ApprovalRequestResource::collection($items)->additional([
            'counts' => [
                'pending' => (int) ($counts['pending'] ?? 0),
                'approved' => (int) ($counts['approved'] ?? 0),
                'rejected' => (int) ($counts['rejected'] ?? 0),
                'all' => (int) $counts->sum(),
            ],
        ]);
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
            ApprovalRequest::TYPE_UPLOAD => $this->approveUpload($approvalRequest, $request),
            default => ['ok' => false, 'reason' => 'unknown_type'],
        };

        if (! $result['ok']) {
            /* ⚠️ `*_count` ყველა დომენზე და არა ორ ხელით ჩაწერილზე (Tasks BUG-19).
               ⚠️ სტატუსი handler-ს შეუძლია თქვას (§34.5 — `role_escalation` 403-ია,
               არა 422: „ეს ნებართვა არ გაქვს" და „მოთხოვნა არასწორია" სხვადასხვაა). */
            return response()->json([
                'message' => $result['reason'],
                ...array_filter(
                    $result,
                    fn (string $key) => str_ends_with($key, '_count'),
                    ARRAY_FILTER_USE_KEY,
                ),
            ], $result['status'] ?? 422);
        }

        $approvalRequest->forceFill([
            'status' => 'approved',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'review_note' => $note,
        ])->save();

        $this->tell($approvalRequest, NotificationType::REQUEST_APPROVED, $note);

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

        $this->tell($approvalRequest, NotificationType::REQUEST_REJECTED, $request->input('review_note'));

        return new ApprovalRequestResource($approvalRequest->load(['user', 'module', 'genre', 'reviewer']));
    }

    /**
     * **FEAT-19 — მთხოვნელს ვატყობინებთ.**
     *
     * ⚠️ **პასუხის დაბრუნებამდე და ცვლილების შემდეგ**: ადრე
     * მომხმარებელი სტატუსს `/modules`-ზე ხელით ამოწმებდა, ე.ი. „დამტკიცდა"
     * ფაქტი არსად არ მიდიოდა. `Notifier` არასდროს აგდებს გამონაკლისს,
     * ამიტომ ეს ხაზი დამტკიცების ჩავარდნას ვერ გამოიწვევს.
     *
     * ⚠️ **მოდულის სახელი `data`-ში ორივე ენაზე მიდის** — ტექსტი
     * ინტერფეისში იწერება, ე.ი. ერთ ენაზე ჩაწერილი სახელი მეორეზე
     * გადართვისას უცვლელი დარჩებოდა.
     */
    private function tell(ApprovalRequest $req, string $type, ?string $note): void
    {
        $upload = $req->type === ApprovalRequest::TYPE_UPLOAD ? ($req->payload ?? []) : [];

        app(Notifier::class)->send($req->user, $type, array_filter([
            'request_type' => $req->type,
            'module' => $req->module?->key,
            'module_ka' => $req->module?->name_ka,
            'module_en' => $req->module?->name_en,
            /* §34.5 — ატვირთვის მოთხოვნა: **ვისზე გავრცელდა** შეტყობინებამ უნდა
               თქვას (`upload_scope`), და რა — სახეობა, ფორმატები, ზომა. ტექსტი
               ისევ ინტერფეისში იწერება. */
            'upload_kind' => $upload['kind'] ?? null,
            'upload_formats' => ($upload['formats'] ?? []) ?: null,
            'upload_max_kb' => $upload['max_kb'] ?? null,
            'upload_scope' => $upload['granted_scope'] ?? null,
            'note' => $note,
        ], fn ($v) => $v !== null && $v !== ''));
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

    /**
     * **Tasks §34.5 — ატვირთვის ლიმიტი.** ადმინი ირჩევს, ვისზე ვრცელდება (Q42):
     * `user` — **პირადი გამონაკლისი** (ნაგულისხმევი), `all` — ინსტალაციის
     * ლიმიტი იცვლება ყველასთვის. არჩევანი მოთხოვნაზე ინახება (`granted_scope`),
     * ე.ი. სიაც და მთხოვნელის შეტყობინებაც ამბობს, ვისზე გავრცელდა.
     *
     * ⚠️ **„ყველასთვის" მხოლოდ სუპერადმინს შეუძლია** — ეს ინსტალაციის
     * ლიმიტის შეცვლაა (§34.2-ის რედაქტორი `super_admin`-ზეა), `admin:requests`
     * კი ერთი სექციის უფლებაა: SEC-02-ის წესით ის ძალაუფლების გაცემის
     * ლიცენზია ვერ იქნება → **403 `role_escalation`**.
     *
     * ⚠️ **ფორმატები ხელახლა იფილტრება** — მოთხოვნის შემდეგ კატალოგი შეიძლება
     * შეიცვალა, და ძველი payload აქტიურ შიგთავსს ვერც ამ გზით ჩართავს.
     */
    private function approveUpload(ApprovalRequest $req, Request $request): array
    {
        if (! $req->user) {
            return ['ok' => false, 'reason' => 'user_missing'];
        }

        $scope = (string) ($request->input('scope') ?: 'user');

        if (! in_array($scope, ApprovalRequest::UPLOAD_SCOPES, true)) {
            return ['ok' => false, 'reason' => 'upload_scope_invalid'];
        }

        if ($scope === 'all' && ! $request->user()->isSuperAdmin()) {
            return ['ok' => false, 'reason' => 'role_escalation', 'status' => 403];
        }

        $payload = $req->payload ?? [];
        $kind = (string) ($payload['kind'] ?? '');

        if (! array_key_exists($kind, UploadLimits::KINDS)) {
            return ['ok' => false, 'reason' => 'upload_kind_unknown'];
        }

        $formats = array_values(array_intersect(
            UploadLimits::selectable($kind),
            array_map('strval', (array) ($payload['formats'] ?? [])),
        ));
        $maxKb = isset($payload['max_kb']) ? (int) $payload['max_kb'] : null;

        if ($scope === 'all') {
            UploadLimits::widenInstallation($kind, $formats, $maxKb, $request->user());
        } else {
            UploadLimits::widenPersonal($req->user, $kind, $formats, $maxKb);
        }

        $req->payload = [...$payload, 'granted_scope' => $scope];

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
