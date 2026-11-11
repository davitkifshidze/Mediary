<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * **ჩანაწერების ხელით გადალაგება** — `POST …/reorder {ids}`.
 *
 * ⚠️ **მოწოდებული ჩანაწერები იმავე „უჯრებს" ინაწილებს, რაც მანამდე ეკავათ**:
 * მათი ახლანდელი `sort_order` მნიშვნელობები ზრდადობით ლაგდება და ახალი რიგით
 * ურიგდება. ამიტომ:
 *  · ფილტრით ნაჩვენები ნაწილის გადალაგება დამალულ ჩანაწერებს ადგილს არ უცვლის;
 *  · 500-იანი გვერდის მიღმა დარჩენილი ჩანაწერები ხელუხლებელია;
 *  · „თავში" / „ბოლოში" იგივე მოთხოვნაა — სია ახალი რიგით.
 *
 * ⚠️ **სხვისი და ურნაში მყოფი id უბრალოდ იგნორირდება** — მოთხოვნა მოდელის
 * გლობალურ scope-ებს გადის (`owner`, `trash`), ე.ი. ასეთი ჩანაწერი არ
 * მოიძებნება და არც შეიცვლება; 422 აქ ზედმეტია (სია შეიძლება სხვა ჩანართში
 * უკვე შეცვლილი იყოს).
 *
 * ⚠️ `updated_at` არ იცვლება — გადალაგება ჩანაწერის რედაქტირება არ არის
 * („ბოლოს შეცვლილით" დალაგება მას არ უნდა გრძნობდეს) და აუდიტშიც არ იწერება.
 */
trait ReordersRecords
{
    /** ერთ მოთხოვნაში — სიის ერთი გვერდი (`per_page`-ის ჭერი) */
    private const REORDER_LIMIT = 500;

    /**
     * @param  class-string<Model>  $model  `HasManualOrder`-იანი მოდელი
     */
    protected function reorderRecords(Request $request, string $model): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['present', 'array', 'max:'.self::REORDER_LIMIT],
            'ids.*' => ['integer'],
        ]);

        $wanted = collect($data['ids'])->map(fn ($id) => (int) $id)->unique()->values();
        $current = $model::query()->whereKey($wanted->all())->pluck('sort_order', 'id');
        $ids = $wanted->filter(fn (int $id) => $current->has($id))->values();

        $slots = $current->values()->map(fn ($value) => (int) $value)->sort()->values();

        // ძველი მონაცემი ერთნაირი მნიშვნელობებით (ყველა 0) — უჯრები უმცირესიდან მიყოლებით
        if ($slots->unique()->count() !== $slots->count()) {
            $from = (int) $slots->first();
            $slots = collect(range($from, $from + $ids->count() - 1));
        }

        $table = (new $model)->getTable();

        DB::transaction(function () use ($ids, $slots, $table) {
            foreach ($ids as $index => $id) {
                DB::table($table)->where('id', $id)->update(['sort_order' => $slots[$index]]);
            }
        });

        return response()->json(['ids' => $ids->all()]);
    }
}
