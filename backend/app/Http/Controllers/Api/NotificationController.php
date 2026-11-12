<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\NotificationType;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * **შეტყობინებების ცენტრი.**
 *
 * ⚠️ **მოდულის ჯგუფის გარეთ განზრახ**: შეტყობინება მოდული არ არის —
 * ის ანგარიშის ფაქტია, ისევე როგორც საცავი და კვოტა. `module:`/`permission:`
 * middleware-ს აქ წასაკითხი პარამეტრიც არ ექნებოდა.
 *
 * ⚠️ **წვდომა `$request->user()->notifications()`-ითაა და არა id-ით**:
 * `DatabaseNotification` `BelongsToUser`-ს არ იყენებს და `EnsureRecordOwnership`
 * მას ვერ ხედავს (`Illuminate\Bus\Batch`-ის იგივე ხაფანგი), ე.ი.
 * მფლობელობა **ცხადად** უნდა შემოწმდეს. სხვისი შეტყობინება **404-ია**, მასობრივ
 * მოქმედებაში კი სხვისი id უბრალოდ არაფერს ემთხვევა.
 *
 * ⚠️ **„ნახული" ≠ „წაკითხული"**: ზარის გახსნა ყველაფერს *ნახულად* ნიშნავს
 * (`seen_at`) და რიცხვს აქრობს; *წაკითხული* (`read_at`) მხოლოდ ის ხდება, რასაც
 * დააჭირე ან ცხადად მონიშნე — და უკანაც ინიშნება წაუკითხავად. წაკითხვა
 * ნახვასაც ნიშნავს.
 *
 * ⚠️ **ორი endpoint და არა ერთი**: ზარი ყოველ 30 წამში მხოლოდ **რიცხვებს**
 * ეკითხება (`counts`), სია კი მხოლოდ მაშინ იტვირთება, როცა პანელი ან გვერდი იხსნება.
 */
class NotificationController extends Controller
{
    /** გვერდზე რამდენი — ჩადგმული სიების ზომა; ზარი თავის რიცხვს თვითონ ითხოვს */
    private const PER_PAGE = 10;

    private const PER_PAGE_MAX = 100;

    /** მასობრივი მოქმედება ერთ ჯერზე ამაზე მეტს არ იღებს */
    private const BULK_MAX = 500;

    public function index(Request $request)
    {
        $data = $request->validate([
            'unread' => ['nullable', 'boolean'],
            'type' => ['nullable', 'string', Rule::in(NotificationType::ALL)],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::PER_PAGE_MAX],
        ]);

        $user = $request->user();

        $page = $user->notifications()
            ->when($request->boolean('unread'), fn ($q) => $q->whereNull('read_at'))
            ->when($data['type'] ?? null, fn ($q, $type) => $q->where('type', $type))
            ->paginate((int) ($data['per_page'] ?? self::PER_PAGE));

        return response()->json([
            'data' => $page->getCollection()->map(fn (DatabaseNotification $n) => $this->row($n)),
            'meta' => ['total' => $page->total(), 'last_page' => $page->lastPage()],
            // ტიპების ფილტრი — მხოლოდ ის, რაც მართლა მაქვს, თავისი რიცხვით
            'types' => $user->notifications()->reorder()
                ->selectRaw('type, count(*) as total')
                ->groupBy('type')
                ->pluck('total', 'type')
                ->map(fn ($total) => (int) $total),
            ...$this->counts($user),
        ]);
    }

    /** მხოლოდ რიცხვები — ზარის 30-წამიანი პოლინგისთვის */
    public function summary(Request $request)
    {
        return response()->json($this->counts($request->user()));
    }

    /** ზარი გაიხსნა — რაც მოსული იყო, ნახულია (წაკითხული — ჯერ არა) */
    public function seen(Request $request)
    {
        $request->user()->notifications()->whereNull('seen_at')->update(['seen_at' => now()]);

        return response()->json($this->counts($request->user()));
    }

    /**
     * წაკითხვა — ერთი ან ყველა.
     *
     * ⚠️ **`PATCH` და არა `POST`**: არსებული რიგი იცვლება. აქ მოდულის
     * middleware არ დგას, ე.ი. მეთოდი უფლებას არ წყვეტს — მაგრამ წესი
     * მაინც ერთია მთელ პროექტში.
     */
    public function read(Request $request, ?string $notification = null)
    {
        $user = $request->user();

        if ($notification === null) {
            $this->markRead($user->unreadNotifications());

            return response()->json($this->counts($user));
        }

        $this->markRead($user->notifications()->whereKey($this->own($user, $notification)->getKey()));

        return response()->json($this->counts($user));
    }

    /** ისევ წაუკითხავად — „მოგვიანებით მივხედავ"; ნახულად რჩება, ზარის რიცხვი არ იზრდება */
    public function unread(Request $request, string $notification)
    {
        $user = $request->user();

        $user->notifications()->whereKey($this->own($user, $notification)->getKey())->update(['read_at' => null]);

        return response()->json($this->counts($user));
    }

    /** მონიშნულებზე ერთად: წაკითხულად · წაუკითხავად · წაშლა */
    public function bulk(Request $request)
    {
        $data = $request->validate([
            'action' => ['required', Rule::in(['read', 'unread', 'delete'])],
            'ids' => ['required', 'array', 'min:1', 'max:'.self::BULK_MAX],
            'ids.*' => ['string', 'max:64'],
        ]);

        $user = $request->user();
        // ⚠️ კავშირი მფლობელზეა შეზღუდული — სხვისი id აქ უბრალოდ არაფერს ემთხვევა
        $rows = $user->notifications()->reorder()->whereIn('id', $data['ids']);

        $affected = match ($data['action']) {
            'read' => $this->markRead($rows),
            'unread' => $rows->update(['read_at' => null]),
            'delete' => $rows->delete(),
        };

        return response()->json(['affected' => (int) $affected, ...$this->counts($user)]);
    }

    /** ერთის ან ყველას მოცილება — ⚠️ ჟურნალი `audit_logs`-ია და ის რჩება */
    public function destroy(Request $request, ?string $notification = null)
    {
        $user = $request->user();

        if ($notification === null) {
            $user->notifications()->delete();

            return response()->noContent();
        }

        $this->own($user, $notification)->delete();

        return response()->noContent();
    }

    /** ჩემი შეტყობინება ან 404 */
    private function own(User $user, string $id): DatabaseNotification
    {
        $row = $user->notifications()->whereKey($id)->first();

        abort_if(! $row, 404);

        return $row;
    }

    /** წაკითხული ნახულიცაა: `seen_at` მხოლოდ იქ იწერება, სადაც ჯერ ცარიელია */
    private function markRead($query): int
    {
        $now = now();

        (clone $query)->whereNull('seen_at')->update(['seen_at' => $now]);

        return (int) $query->whereNull('read_at')->update(['read_at' => $now]);
    }

    /**
     * @return array{unseen: int, unread: int, total: int}
     */
    private function counts(User $user): array
    {
        return [
            // ზარის რიცხვი
            'unseen' => $user->notifications()->whereNull('seen_at')->count(),
            // წერტილები და „წაუკითხავი" ფილტრი
            'unread' => $user->unreadNotifications()->count(),
            'total' => $user->notifications()->count(),
        ];
    }

    /** @return array<string, mixed> */
    private function row(DatabaseNotification $n): array
    {
        return [
            'id' => $n->id,
            'type' => $n->type,
            'data' => $n->data,
            // ⚠️ მარშრუტი სერვერისაა (იხ. `NotificationType::route()`)
            'route' => NotificationType::route($n->type, (array) $n->data),
            'read_at' => $n->read_at?->toIso8601String(),
            'seen_at' => $n->seen_at ? Carbon::parse($n->seen_at)->toIso8601String() : null,
            'created_at' => $n->created_at?->toIso8601String(),
        ];
    }
}
