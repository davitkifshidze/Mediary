<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DutyWorkplaceResource;
use App\Models\DutyRate;
use App\Models\DutyShift;
use App\Models\DutyWorkplace;
use App\Support\DictionaryRecords;
use App\Support\DictionaryTrash;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * **სამსახურები** — `/duty/workplaces`: სახელი, მოკლე ასო, ფერი,
 * საათობრივი განაკვეთი და **ტარიფები ტიპების მიხედვით** (`rates`) ერთ ფორმაში.
 *
 * ⚠️ **ტარიფები მთლიანად მოდის** (`rates: [{type_id, pay}]`): სიაში არმყოფი ან
 * ცარიელი თანხა — ტარიფის მოხსნაა („ამ ტიპზე საათობრივით ითვალე“). ⚠️ ცვლილება
 * ძველ მორიგეობებს არ ეხება — მათი თანხა ჩანაწერზეა (`DutyShift::$pay`).
 *
 * ⚠️ **წაშლა კლასიფიკატორის წესითაა** (`DictionaryRecords`): მორიგეობები სხვა
 * სამსახურზე გადადის (`move_to`), უსამსახუროდ რჩება (`clear_records`) ან ურნაში
 * მიდის (`delete_records`); სამსახური თვითონ — ურნაში (`DictionaryTrash`).
 */
class DutyWorkplaceController extends Controller
{
    public function index(Request $request)
    {
        // ზარმაცი ნაგულისხმევი — ერთი სამსახური ინტერფეისის ენაზე
        DutyWorkplace::ensureDefault($request->user()->id, $request->query('locale') === 'en' ? 'en' : 'ka');

        return DutyWorkplaceResource::collection($this->ordered()->get());
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $workplace = DB::transaction(function () use ($data, $request) {
            $workplace = DutyWorkplace::create([
                ...array_diff_key($data, ['rates' => true]),
                'user_id' => $request->user()->id,
                'sort_order' => (int) DutyWorkplace::max('sort_order') + 1,
            ]);

            $this->syncRates($workplace, $data['rates'] ?? []);

            return $workplace;
        });

        return (new DutyWorkplaceResource($this->fresh($workplace)))->response()->setStatusCode(201);
    }

    public function update(Request $request, DutyWorkplace $dutyWorkplace)
    {
        $data = $this->validated($request, $dutyWorkplace);

        DB::transaction(function () use ($data, $dutyWorkplace) {
            $dutyWorkplace->update(array_diff_key($data, ['rates' => true]));

            if (array_key_exists('rates', $data)) {
                $this->syncRates($dutyWorkplace, $data['rates'] ?? []);
            }
        });

        return new DutyWorkplaceResource($this->fresh($dutyWorkplace));
    }

    /** წაშლა — `move_to` · `clear_records` · `delete_records` (კლასიფიკატორის წესი) */
    public function destroy(Request $request, DutyWorkplace $dutyWorkplace)
    {
        $data = $request->validate(
            DictionaryRecords::rules(
                $request,
                Rule::exists('duty_workplaces', 'id')->whereNull('trashed_at')->where('user_id', $request->user()->id),
                $dutyWorkplace->id,
            ),
            DictionaryRecords::messages(),
        );

        if ($request->boolean('delete_records')) {
            $deleted = DictionaryRecords::trash(DutyShift::where('workplace_id', $dutyWorkplace->id));
            DictionaryTrash::trash($dutyWorkplace, 'duty_workplace');

            return response()->json(['moved' => 0, 'deleted' => $deleted]);
        }

        $moveTo = DictionaryRecords::moveTarget($data);

        // ⚠️ ids **გადატანამდე** — აღდგენამ მათი დაბრუნება უნდა შემოგთავაზოს
        $records = DutyShift::where('workplace_id', $dutyWorkplace->id);
        $ids = (clone $records)->pluck('id')->all();

        $moved = DictionaryRecords::move($records, fn (DutyShift $shift) => $shift->workplace_id = $moveTo);

        DictionaryTrash::trash($dutyWorkplace, 'duty_workplace', $ids, $moveTo);

        return response()->json(['moved' => $moved, 'deleted' => 0]);
    }

    /** მთელი რიგი ერთად (`PlaceCategoryController::reorder()`-ის წესი) */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => [
                'integer',
                Rule::exists('duty_workplaces', 'id')->whereNull('trashed_at')->where('user_id', $request->user()->id),
            ],
        ]);

        foreach ($data['ids'] as $i => $id) {
            DutyWorkplace::whereKey($id)->update(['sort_order' => $i + 1]);
        }

        return DutyWorkplaceResource::collection($this->ordered()->get());
    }

    /* ---------- დამხმარეები ---------- */

    private function ordered()
    {
        return DutyWorkplace::query()->with('rates')->withCount('shifts')->orderBy('sort_order')->orderBy('id');
    }

    private function fresh(DutyWorkplace $workplace): DutyWorkplace
    {
        return $this->ordered()->findOrFail($workplace->id);
    }

    /**
     * ტარიფები — მოწოდებული სია **მთლიანად** ცვლის ძველს.
     *
     * @param  list<array{type_id: int, pay: mixed}>  $rates
     */
    private function syncRates(DutyWorkplace $workplace, array $rates): void
    {
        $keep = [];

        foreach ($rates as $rate) {
            if (($rate['pay'] ?? null) === null || $rate['pay'] === '') {
                continue;
            }

            DutyRate::updateOrCreate(
                ['workplace_id' => $workplace->id, 'type_id' => (int) $rate['type_id']],
                ['pay' => round((float) $rate['pay'], 2)],
            );

            $keep[] = (int) $rate['type_id'];
        }

        $workplace->rates()->whereNotIn('type_id', $keep)->delete();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?DutyWorkplace $workplace = null): array
    {
        $userId = $request->user()->id;

        return $request->validate([
            'name' => [$workplace ? 'sometimes' : 'required', 'string', 'max:120'],
            'short' => ['nullable', 'string', 'max:3'],
            'color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'hourly_rate' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'is_active' => ['sometimes', 'boolean'],
            'rates' => ['sometimes', 'array', 'max:100'],
            'rates.*.type_id' => [
                'required', 'integer', 'distinct',
                Rule::exists('duty_shift_types', 'id')->whereNull('trashed_at')->where('user_id', $userId),
            ],
            'rates.*.pay' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
        ]);
    }
}
