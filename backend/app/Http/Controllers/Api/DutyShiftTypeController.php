<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DutyShiftTypeResource;
use App\Models\DutyShift;
use App\Models\DutyShiftType;
use App\Support\DictionaryRecords;
use App\Support\DictionaryTrash;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * **მორიგეობის ტიპები** — `/duty/types`, კლასიფიკატორის შაბლონით
 * (`PlaceCategoryController`): ზარმაცი ნაგულისხმევები (8/12/24 სთ), რიგი,
 * წაშლა გადატანით.
 *
 * ⚠️ **გადატანისას საათები და თანხა არ იცვლება** — ისინი ჩანაწერის ფაქტია
 * (`DutyShift::$hours`/`$pay`); იცვლება მხოლოდ ის, რომელ ტიპად ჩანს. „უტიპოდ
 * დატოვება“ მორიგეობას ქასთომ საათებად აქცევს — იგივე საათებით.
 */
class DutyShiftTypeController extends Controller
{
    public function index(Request $request)
    {
        DutyShiftType::ensureDefaults($request->user()->id);

        return DutyShiftTypeResource::collection($this->ordered()->get());
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $type = DutyShiftType::create([
            'key' => DutyShiftType::makeKey($request->user()->id, $data['name_en'] ?: $data['name_ka']),
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'hours' => $data['hours'],
            'icon' => $data['icon'] ?? null,
            'sort_order' => (int) DutyShiftType::max('sort_order') + 1,
        ]);

        return (new DutyShiftTypeResource($type->loadCount('shifts')))->response()->setStatusCode(201);
    }

    public function update(Request $request, DutyShiftType $dutyShiftType)
    {
        $data = $this->validated($request);

        $dutyShiftType->fill([
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'hours' => $data['hours'],
            'icon' => $data['icon'] ?? $dutyShiftType->icon,
        ])->save();

        return new DutyShiftTypeResource($dutyShiftType->loadCount('shifts'));
    }

    /** წაშლა — `move_to` · `clear_records` (ქასთომ საათები) · `delete_records` */
    public function destroy(Request $request, DutyShiftType $dutyShiftType)
    {
        $data = $request->validate(
            DictionaryRecords::rules(
                $request,
                Rule::exists('duty_shift_types', 'id')->whereNull('trashed_at')->where('user_id', $request->user()->id),
                $dutyShiftType->id,
            ),
            DictionaryRecords::messages(),
        );

        if ($request->boolean('delete_records')) {
            $deleted = DictionaryRecords::trash(DutyShift::where('type_id', $dutyShiftType->id));
            DictionaryTrash::trash($dutyShiftType, 'duty_type');

            return response()->json(['moved' => 0, 'deleted' => $deleted]);
        }

        $moveTo = DictionaryRecords::moveTarget($data);

        // ⚠️ ids **გადატანამდე** — აღდგენამ მათი დაბრუნება უნდა შემოგთავაზოს
        $records = DutyShift::where('type_id', $dutyShiftType->id);
        $ids = (clone $records)->pluck('id')->all();

        $moved = DictionaryRecords::move($records, fn (DutyShift $shift) => $shift->type_id = $moveTo);

        DictionaryTrash::trash($dutyShiftType, 'duty_type', $ids, $moveTo);

        return response()->json(['moved' => $moved, 'deleted' => 0]);
    }

    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => [
                'integer',
                Rule::exists('duty_shift_types', 'id')->whereNull('trashed_at')->where('user_id', $request->user()->id),
            ],
        ]);

        foreach ($data['ids'] as $i => $id) {
            DutyShiftType::whereKey($id)->update(['sort_order' => $i + 1]);
        }

        return DutyShiftTypeResource::collection($this->ordered()->get());
    }

    /* ---------- დამხმარეები ---------- */

    private function ordered()
    {
        return DutyShiftType::query()->withCount('shifts')->orderBy('sort_order')->orderBy('id');
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name_ka' => ['required', 'string', 'max:80'],
            'name_en' => ['required', 'string', 'max:80'],
            // ⚠️ 72 — სამი დღე-ღამე; მეტი „მორიგეობა“ აღარ არის, შეცდომაა
            'hours' => ['required', 'numeric', 'min:0.5', 'max:72'],
            'icon' => ['nullable', 'string', 'max:60'],
        ]);
    }
}
