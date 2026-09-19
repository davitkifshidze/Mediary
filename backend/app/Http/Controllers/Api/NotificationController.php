<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\NotificationType;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;

/**
 * **შეტყობინებების ცენტრი (FEAT-19).**
 *
 * ⚠️ **მოდულის ჯგუფის გარეთ განზრახ**: შეტყობინება მოდული არ არის —
 * ის ანგარიშის ფაქტია, ისევე როგორც საცავი და კვოტა. `module:`/`permission:`
 * middleware-ს აქ წასაკითხი პარამეტრიც არ ექნებოდა.
 *
 * ⚠️ **წვდომა `$request->user()->notifications()`-ითაა და არა id-ით**:
 * `DatabaseNotification` `BelongsToUser`-ს არ იყენებს და `EnsureRecordOwnership`
 * მას ვერ ხედავს (`Illuminate\Bus\Batch`-ის იგივე ხაფანგი, SEC-09), ე.ი.
 * მფლობელობა **ცხადად** უნდა შემოწმდეს. სხვისი შეტყობინება **404-ია**.
 *
 * ⚠️ **ორი endpoint და არა ერთი**: ბეჯი ყოველ 30 წამში მხოლოდ **რიცხვს**
 * ეკითხება (ჩატის `unread`-ის ზუსტი ფორმა), სრული სია კი მხოლოდ მაშინ
 * იტვირთება, როცა პანელი იხსნება — თორემ ყოველი პოლინგი ორმოცდაათ
 * რიგს ეზიდებოდა.
 */
class NotificationController extends Controller
{
    /** რამდენი რიგი დაბრუნდეს — პანელი სია და არა ჟურნალი */
    private const LIMIT = 50;

    public function index(Request $request)
    {
        $rows = $request->user()->notifications()->limit(self::LIMIT)->get();

        return response()->json([
            'data' => $rows->map(fn (DatabaseNotification $n) => [
                'id' => $n->id,
                'type' => $n->type,
                'data' => $n->data,
                // ⚠️ მარშრუტი სერვერისაა (იხ. `NotificationType::route()`)
                'route' => NotificationType::route($n->type),
                'read_at' => $n->read_at?->toIso8601String(),
                'created_at' => $n->created_at?->toIso8601String(),
            ]),
            'unread' => $request->user()->unreadNotifications()->count(),
        ]);
    }

    /** მხოლოდ რიცხვი — ბეჯის 30-წამიანი პოლინგისთვის */
    public function unread(Request $request)
    {
        return response()->json(['count' => $request->user()->unreadNotifications()->count()]);
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
        if ($notification === null) {
            $request->user()->unreadNotifications()->update(['read_at' => now()]);

            return response()->json(['count' => 0]);
        }

        $row = $request->user()->notifications()->whereKey($notification)->first();

        abort_if(! $row, 404);

        $row->markAsRead();

        return response()->json(['count' => $request->user()->unreadNotifications()->count()]);
    }

    /** ერთის ან ყველას მოცილება — ⚠️ ჟურნალი `audit_logs`-ია და ის რჩება */
    public function destroy(Request $request, ?string $notification = null)
    {
        if ($notification === null) {
            $request->user()->notifications()->delete();

            return response()->noContent();
        }

        $row = $request->user()->notifications()->whereKey($notification)->first();

        abort_if(! $row, 404);

        $row->delete();

        return response()->noContent();
    }
}
