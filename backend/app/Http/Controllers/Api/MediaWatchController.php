<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MediaWatch;
use App\Support\MediaDomain;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * **ხელახლა ნახვის ჟურნალი (FEAT-14).**
 *
 * `GET|POST /api/media/watches/{type}/{id}` · `DELETE /api/media-watches/{watch}`
 *
 * ⚠️ **ერთი კონტროლერი სამივე მედია-დომენზე** — `/media/sync/{type}/{id}`-ის
 * ფორმა; სამი თითქმის იდენტური endpoint სწორედ ის დუბლირებაა, რომელსაც
 * `MediaDomain` ამ პროექტში ყოველ ჯერზე ცვლის.
 *
 * ⚠️ **მხოლოდ მედია-დომენებია და ეს გამორჩენა არ არის.** ვიდეოს საკუთარი
 * `watch_count`/`POST /videos/{id}/watched` აქვს (დაკვრის მრიცხველი —
 * სხვა ფაქტი), წიგნსა და თამაშს კი „როდის დავასრულე" სვეტადაც არ აქვთ.
 */
class MediaWatchController extends Controller
{
    /** ჟურნალის სია */
    public function index(Request $request, string $type, int $id)
    {
        $record = $this->record($request, $type, $id);

        return response()->json([
            'data' => $record->watches()->get()->map(fn (MediaWatch $w) => $this->row($w))->all(),
        ]);
    }

    /**
     * „კიდევ ვნახე".
     *
     * ⚠️ **თარიღი არჩევითია** — ჩვეულებრივ „ახლა"-ა, მაგრამ ჟურნალს
     * წარსულის შევსებაც სჭირდება („გასულ კვირას ვნახე"). მომავალი
     * თარიღი **422-ია**: ჟურნალი წარსულის ჩანაწერია და მომავალი ნახვა
     * `watched_at`-ს (ე.ი. „ბოლო ნახვას") მომავალში გადაწევდა.
     */
    public function store(Request $request, string $type, int $id)
    {
        $record = $this->record($request, $type, $id);

        $data = $request->validate([
            'watched_at' => ['nullable', 'date', 'before_or_equal:now'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $watch = $record->logWatch(
            isset($data['watched_at']) ? Carbon::parse($data['watched_at']) : null,
            $data['note'] ?? null,
        );

        return response()->json(['data' => $this->row($watch)], 201);
    }

    /**
     * ერთი ნახვის წაშლა.
     *
     * ⚠️ **`watched_at` აქვე სწორდება** — ბოლო რიგის წაშლის შემდეგ
     * ჩანაწერის „ბოლო ნახვა" წინა რიგზე უნდა დაბრუნდეს, ცარიელ
     * ჟურნალზე კი `null` გახდეს. ეს ერთადერთი წყაროს წესია
     * (`syncWatchedAt()`), და მისი გამოტოვება ორ რიცხვს დააშორებდა.
     */
    public function destroy(Request $request, MediaWatch $mediaWatch)
    {
        // `EnsureRecordOwnership` ისედაც ამოწმებს, მაგრამ ცხადი შემოწმება
        // აქ იაფია და კონტროლერს თვითმყოფადს ტოვებს
        abort_unless((int) $mediaWatch->user_id === (int) $request->user()->getKey(), 404);

        $record = $mediaWatch->watchable;
        $mediaWatch->delete();

        $record?->syncWatchedAt();

        return response()->noContent();
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * ⚠️ **`owner` scope-ს ვენდობით და ცხადად არაფერს ვწერთ** — სხვისი
     * ჩანაწერი ისედაც 404-ია (`BelongsToUser`), ე.ი. მეორე `where`
     * იმავე ფაქტს ორჯერ იტყოდა.
     */
    private function record(Request $request, string $type, int $id): Model
    {
        abort_unless(MediaDomain::has($type), 404);

        $user = $request->user();
        abort_unless($user->hasModule($type) && $user->hasPermission($type, 'view'), 403);

        return MediaDomain::query($type)->findOrFail($id);
    }

    private function row(MediaWatch $watch): array
    {
        return [
            'id' => $watch->id,
            'watched_at' => $watch->watched_at?->toIso8601String(),
            'note' => $watch->note,
        ];
    }
}
