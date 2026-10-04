<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DutyShiftResource;
use App\Models\DutyShift;
use App\Models\DutyShiftType;
use App\Models\DutyWorkplace;
use App\Support\AppTime;
use App\Support\DutyPay;
use App\Support\DutyPeriod;
use App\Support\DutySettings;
use App\Support\Like;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

/**
 * **მორიგეობები (Tasks §34)** — `/duty/shifts`.
 *
 * ⚠️ **სია თარიღების შუალედით იკითხება და არა გვერდებით**: კალენდარი, სია და
 * ჯამები ერთ პერიოდს ხატავს (≤ ~60 რიგი), კალკულატორი — ნებისმიერ შუალედს
 * (ჭერი 3 წელი). შუალედის გარეშე — მიმდინარე პერიოდი (`DutyPeriod`).
 *
 * ⚠️ **თანხა: გასაღების არსებობა ნიშნავს გადაწერას.** `pay` მოთხოვნაში არის
 * (თუნდაც `null`) — ჩაიწერება ის; არ არის — ტარიფიდან ითვლება (`DutyPay`).
 * იგივე წესი `type_id`-ზე: ცხადი `null` — ქასთომ საათები (საათები
 * სავალდებულოა), გასაღების არქონა — ნაგულისხმევი ტიპი.
 *
 * ⚠️ **მასობრივი მოქმედებები** (§34.5): `POST /duty/shifts/batch` — ბევრი დღე ერთ
 * ტრანზაქციაში (`batch` `create`-ია — `bulk` `UPDATE_ENDPOINTS`-შია და
 * უფლებას შეცვლიდა); `PATCH /duty/shifts` — მონიშნულების სამსახური/ტიპი
 * (თანხა ხელახლა ითვლება); `DELETE /duty/shifts` — ურნაში.
 */
class DutyShiftController extends Controller
{
    /** კალკულატორის ჭერი — სამი წელი ერთ მოთხოვნაში */
    public const MAX_RANGE_DAYS = 1096;

    /** ერთიან მონიშვნაში ერთდროულად შესაქმნელი დღეები */
    public const MAX_BATCH = 100;

    public function index(Request $request)
    {
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'workplace_id' => ['nullable', 'integer'],
            'type_id' => ['nullable', 'integer'],
            'favorite' => ['nullable', 'boolean'],
            'q' => ['nullable', 'string', 'max:100'],
        ]);

        [$from, $to] = $this->range($request, $data);

        $shifts = DutyShift::query()
            ->with(['workplace', 'type'])
            ->whereBetween('date', [$from->toDateString(), $to->toDateString()])
            ->when(isset($data['workplace_id']), fn ($q) => $q->where('workplace_id', (int) $data['workplace_id']))
            ->when(isset($data['type_id']), fn ($q) => $q->where('type_id', (int) $data['type_id']))
            ->when(! empty($data['favorite']), fn ($q) => $q->where('is_favorite', true))
            ->when(isset($data['q']) && trim((string) $data['q']) !== '', fn ($q) => $q->where('note', 'like', Like::contains(trim((string) $data['q']))))
            ->orderBy('date')
            ->orderBy('start_time')
            ->orderBy('id')
            ->get();

        return DutyShiftResource::collection($shifts)->additional([
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules($request));

        $shift = DutyShift::create([
            ...$this->resolve($request, $data, $request->all()),
            'user_id' => $request->user()->id,
        ]);

        return (new DutyShiftResource($shift->load(['workplace', 'type'])))->response()->setStatusCode(201);
    }

    public function show(DutyShift $dutyShift)
    {
        return new DutyShiftResource($dutyShift->load(['workplace', 'type']));
    }

    /**
     * ⚠️ სამსახურის/ტიპის/საათების შეცვლაზე თანხა **ხელახლა ითვლება**, თუ ის
     * მოთხოვნაში ცხადად არ მოვიდა — თორემ 12-იანის 24-იანად ქცევა ძველ თანხას
     * დატოვებდა.
     */
    public function update(Request $request, DutyShift $dutyShift)
    {
        $data = $request->validate($this->rules($request, partial: true));
        $input = $request->all();

        $changes = array_intersect_key($data, array_flip(['date', 'start_time', 'note', 'is_favorite']));

        $classifies = array_intersect_key($input, array_flip(['workplace_id', 'type_id', 'hours'])) !== [];

        if ($classifies || array_key_exists('pay', $input)) {
            $merged = [
                'workplace_id' => array_key_exists('workplace_id', $input) ? $data['workplace_id'] : $dutyShift->workplace_id,
                'type_id' => array_key_exists('type_id', $input) ? $data['type_id'] : $dutyShift->type_id,
                'hours' => array_key_exists('hours', $input)
                    ? $data['hours']
                    : (array_key_exists('type_id', $input) ? null : (float) $dutyShift->hours),
            ];

            if (array_key_exists('pay', $input)) {
                $merged['pay'] = $data['pay'];
            }

            // ⚠️ `$merged`-ის ყველა გასაღები „ცხადად მოსულია“ — ნაგულისხმევი აქ აღარაფერს ცვლის
            $changes = [...$changes, ...$this->resolve($request, $merged, $merged)];
        }

        $dutyShift->update($changes);

        return new DutyShiftResource($dutyShift->fresh(['workplace', 'type']));
    }

    /** ურნაში — აღდგენა ურნიდან */
    public function destroy(DutyShift $dutyShift)
    {
        $dutyShift->moveToTrash();

        return response()->noContent();
    }

    public function toggleFavorite(DutyShift $dutyShift)
    {
        $dutyShift->update(['is_favorite' => ! $dutyShift->is_favorite]);

        return new DutyShiftResource($dutyShift->fresh(['workplace', 'type']));
    }

    /**
     * **ერთიანი მონიშვნა — N დღე ერთ მოთხოვნაში** (§34.5).
     *
     * `workplace_id`/`type_id` — ყველა დღის საწყისი; თითო დღე (`items`) საკუთარ
     * ტიპს/საათებს/თანხას იღებს. ⚠️ **ერთ ტრანზაქციაში**: ნახევრად შექმნილი
     * პარტია კალენდარზე „ზოგი დღე მოინიშნა“-ს დატოვებდა, ახსნის გარეშე.
     * ⚠️ თითო ჩანაწერი მოდელით იქმნება — აუდიტი ყოველ დღეს ცალკე წერს.
     */
    public function batch(Request $request)
    {
        $live = $this->live($request);

        $data = $request->validate([
            'workplace_id' => ['nullable', 'integer', $live('duty_workplaces')],
            'type_id' => ['nullable', 'integer', $live('duty_shift_types')],
            'items' => ['required', 'array', 'min:1', 'max:'.self::MAX_BATCH],
            'items.*.date' => ['required', 'date_format:Y-m-d'],
            'items.*.type_id' => ['nullable', 'integer', $live('duty_shift_types')],
            'items.*.hours' => ['nullable', 'numeric', 'min:0.5', 'max:72'],
            'items.*.pay' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'items.*.start_time' => ['nullable', 'date_format:H:i'],
            'items.*.note' => ['nullable', 'string', 'max:2000'],
        ]);

        $rawItems = array_values((array) $request->input('items', []));

        // ⚠️ ჯერ ყველა რიგი იწყობა (ჩავარდნა — ჯერ არაფერი ჩაწერილა), მერე ერთად იწერება
        $rows = [];

        foreach ($data['items'] as $i => $item) {
            $raw = is_array($rawItems[$i] ?? null) ? $rawItems[$i] : [];
            $values = [
                ...array_intersect_key($item, array_flip(['date', 'start_time', 'note', 'hours', 'pay'])),
                'workplace_id' => $data['workplace_id'] ?? null,
                'type_id' => array_key_exists('type_id', $raw) ? ($item['type_id'] ?? null) : ($data['type_id'] ?? null),
            ];

            /* ⚠️ „ცხადად მოსულია“ რიგის გასაღები, ან — მის გარეშე — პარტიის: უტიპო
               პარტია (`type_id: null`) ქასთომ საათებია, გასაღების არქონა კი —
               ნაგულისხმევი ტიპი/სამსახური */
            $input = $raw;

            if ($request->exists('workplace_id')) {
                $input['workplace_id'] = $values['workplace_id'];
            }

            if (! array_key_exists('type_id', $raw) && $request->exists('type_id')) {
                $input['type_id'] = $values['type_id'];
            }

            $rows[] = $this->resolve($request, $values, $input);
        }

        $created = DB::transaction(fn () => array_map(
            fn (array $row) => DutyShift::create([...$row, 'user_id' => $request->user()->id]),
            $rows,
        ));

        return DutyShiftResource::collection(
            DutyShift::query()->with(['workplace', 'type'])->whereIn('id', array_map(fn (DutyShift $s) => $s->id, $created))
                ->orderBy('date')->orderBy('id')->get(),
        )->response()->setStatusCode(201);
    }

    /**
     * **მონიშნულების სამსახური/ტიპი** (§34.5) — `PATCH /duty/shifts`.
     *
     * ⚠️ აქ თანხა **ყოველთვის ხელახლა ითვლება** ახალი სამსახურის/ტიპის ტარიფით:
     * მასობრივი შეცვლა ხელახალი კლასიფიკაციაა („ეს დღეები B-ში იყო“), ე.ი. ძველი
     * სამსახურის თანხა ტყუილი იქნებოდა. ⚠️ ტიპის შეცვლა საათებსაც ტიპისას აძლევს.
     */
    public function bulkUpdate(Request $request)
    {
        $live = $this->live($request);

        $data = $request->validate([
            'ids' => ['required', 'array', 'max:500'],
            'ids.*' => ['integer'],
            'workplace_id' => ['sometimes', 'nullable', 'integer', $live('duty_workplaces')],
            'type_id' => ['sometimes', 'integer', $live('duty_shift_types')],
        ]);

        abort_unless(array_key_exists('workplace_id', $data) || array_key_exists('type_id', $data), 422, 'nothing_to_change');

        $workplace = array_key_exists('workplace_id', $data) && $data['workplace_id'] !== null
            ? DutyWorkplace::query()->with('rates')->find($data['workplace_id'])
            : null;
        $type = isset($data['type_id']) ? DutyShiftType::query()->find($data['type_id']) : null;

        $updated = 0;

        DB::transaction(function () use ($data, $workplace, $type, &$updated) {
            $shifts = DutyShift::query()->with(['workplace.rates', 'type'])->whereIn('id', array_map('intval', $data['ids']))->get();

            foreach ($shifts as $shift) {
                if (array_key_exists('workplace_id', $data)) {
                    $shift->workplace_id = $workplace?->id;
                    $shift->setRelation('workplace', $workplace);
                }

                if ($type) {
                    $shift->type_id = $type->id;
                    $shift->hours = $type->hours;
                    $shift->setRelation('type', $type);
                }

                $shift->pay = DutyPay::for($shift->workplace, $shift->type, (float) $shift->hours);

                if ($shift->isDirty()) {
                    $shift->save();
                    $updated++;
                }
            }
        });

        return response()->json(['updated' => $updated]);
    }

    /** მონიშნულების წაშლა (ურნაში) — `DELETE /duty/shifts` + `ids` */
    public function destroyMany(Request $request)
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'max:500'],
            'ids.*' => ['integer'],
        ]);

        $count = 0;

        foreach (DutyShift::query()->whereIn('id', array_map('intval', $data['ids']))->get() as $shift) {
            $count += $shift->moveToTrash() ? 1 : 0;
        }

        return response()->json(['trashed' => $count]);
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * შუალედი — `from`/`to`, ან მიმდინარე პერიოდი; ⚠️ 3 წელზე გრძელი — 422.
     *
     * @param  array<string, mixed>  $data
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    private function range(Request $request, array $data): array
    {
        if (empty($data['from']) || empty($data['to'])) {
            $period = DutyPeriod::containing($data['from'] ?? $data['to'] ?? AppTime::now(), DutySettings::rules($request->user()));

            return [$period['from'], $period['to']];
        }

        $from = CarbonImmutable::parse($data['from']);
        $to = CarbonImmutable::parse($data['to']);

        abort_if($from->diffInDays($to) > self::MAX_RANGE_DAYS, 422, 'duty_range_too_long');

        return [$from, $to];
    }

    /**
     * მორიგეობის ველები ბოლომდე — სამსახური, ტიპი, საათები და თანხა.
     *
     * `$data` — ვალიდირებული მნიშვნელობები; `$input` — ნედლი მოთხოვნა, საიდანაც
     * მხოლოდ **გასაღების არსებობა** იკითხება (ცხადი `null` ≠ არარსებული).
     *
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    private function resolve(Request $request, array $data, array $input): array
    {
        $settings = DutySettings::read($request->user());

        $workplaceId = array_key_exists('workplace_id', $input)
            ? ($data['workplace_id'] ?? null)
            : $this->defaultWorkplace($request, $settings);

        $typeId = array_key_exists('type_id', $input)
            ? ($data['type_id'] ?? null)
            : $this->defaultType($settings);

        $workplace = $workplaceId ? DutyWorkplace::query()->with('rates')->find($workplaceId) : null;
        $type = $typeId ? DutyShiftType::query()->find($typeId) : null;

        $hours = isset($data['hours']) ? (float) $data['hours'] : ($type ? (float) $type->hours : null);

        // ⚠️ ქასთომ მორიგეობას (ტიპის გარეშე) საათები სჭირდება — სხვაგვარად ჯამი არაფერს იტყოდა
        abort_if($hours === null, 422, 'duty_hours_required');

        $resolved = [
            'workplace_id' => $workplace?->id,
            'type_id' => $type?->id,
            'hours' => $hours,
            'pay' => array_key_exists('pay', $input)
                ? ($data['pay'] ?? null)
                : DutyPay::for($workplace, $type, $hours),
        ];

        foreach (['date', 'start_time', 'note', 'is_favorite'] as $key) {
            if (array_key_exists($key, $data)) {
                $resolved[$key] = $data[$key];
            }
        }

        return $resolved;
    }

    /** ნაგულისხმევი სამსახური — პარამეტრიდან, თორემ პირველი რიგში */
    private function defaultWorkplace(Request $request, array $settings): ?int
    {
        DutyWorkplace::ensureDefault($request->user()->id);

        $id = $settings['default_workplace_id'];

        if ($id && DutyWorkplace::query()->whereKey($id)->exists()) {
            return $id;
        }

        return DutyWorkplace::query()->orderBy('sort_order')->orderBy('id')->value('id');
    }

    /** ნაგულისხმევი ტიპი — პარამეტრიდან, თორემ პირველი რიგში */
    private function defaultType(array $settings): ?int
    {
        $id = $settings['default_type_id'];

        if ($id && DutyShiftType::query()->whereKey($id)->exists()) {
            return $id;
        }

        return DutyShiftType::query()->orderBy('sort_order')->orderBy('id')->value('id');
    }

    /** @return \Closure(string): Exists — ჩემი, ურნის გარეთ */
    private function live(Request $request): \Closure
    {
        $userId = $request->user()->id;

        return fn (string $table) => Rule::exists($table, 'id')->whereNull('trashed_at')->where('user_id', $userId);
    }

    /** @return array<string, mixed> */
    private function rules(Request $request, bool $partial = false): array
    {
        $live = $this->live($request);

        return [
            'workplace_id' => ['nullable', 'integer', $live('duty_workplaces')],
            'type_id' => ['nullable', 'integer', $live('duty_shift_types')],
            'date' => [$partial ? 'sometimes' : 'required', 'date_format:Y-m-d'],
            'start_time' => ['nullable', 'date_format:H:i'],
            'hours' => ['nullable', 'numeric', 'min:0.5', 'max:72'],
            'pay' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'note' => ['nullable', 'string', 'max:2000'],
            'is_favorite' => ['sometimes', 'boolean'],
        ];
    }
}
