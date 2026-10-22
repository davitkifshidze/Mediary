<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DutyPatternResource;
use App\Models\DutyPattern;
use App\Models\DutyShift;
use App\Models\DutyShiftType;
use App\Models\DutyWorkplace;
use App\Support\DutyPay;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * **მორიგეობის რიტმები** — `/duty/patterns`.
 *
 * ⚠️ **„გაგრძელება" (`POST …/{id}/continue`, `until`)** რიტმიდან ნამდვილ
 * მორიგეობებს ქმნის `generated_until`-დან `until`-მდე — მოდელით, თითო ჩანაწერი
 * (აუდიტი ყოველ დღეს წერს, `batch`-ის წესი), ერთ ტრანზაქციაში. დღე, რომელზეც
 * იმავე სამსახურის მორიგეობა უკვე დგას (ნებისმიერი სტატუსით), **გამოიტოვება** —
 * პასუხი „N დაემატა · M გამოტოვდა". ⚠️ ბოლო სეგმენტი `continue` `create`-ია:
 * ის მორიგეობებს ქმნის.
 *
 * ⚠️ **`adopt_ids`** (შექმნა და შეცვლა) — „მონიშნულებიდან რიტმი": უკვე დასმული
 * იმავე სამსახურის მორიგეობები რიტმს მიეკუთვნება (`pattern_id`) და
 * `generated_until` ბოლო მათგანია, ე.ი. გაგრძელება მის შემდეგიდან იწყება.
 */
class DutyPatternController extends Controller
{
    public function index()
    {
        // ურნაში მყოფი სამსახურის რიტმი არ ჩანს — მისი გაგრძელება ვერ მოხერხდება
        return DutyPatternResource::collection(
            DutyPattern::query()->whereHas('workplace')->orderBy('workplace_id')->orderBy('id')->get(),
        );
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $pattern = DB::transaction(function () use ($data, $request) {
            $pattern = DutyPattern::create([
                ...array_diff_key($data, ['adopt_ids' => true]),
                'user_id' => $request->user()->id,
            ]);

            if (! empty($data['adopt_ids'])) {
                $this->adopt($pattern, $data['adopt_ids']);
            }

            return $pattern;
        });

        return (new DutyPatternResource($pattern->fresh()))->response()->setStatusCode(201);
    }

    public function update(Request $request, DutyPattern $dutyPattern)
    {
        $data = $this->validated($request, $dutyPattern);

        DB::transaction(function () use ($data, $dutyPattern) {
            $dutyPattern->update(array_diff_key($data, ['adopt_ids' => true]));

            if (! empty($data['adopt_ids'])) {
                $this->adopt($dutyPattern, $data['adopt_ids']);
            }
        });

        return new DutyPatternResource($dutyPattern->fresh());
    }

    /** ურნაში — მისი მორიგეობები რჩება (`pattern_id`-ით) */
    public function destroy(DutyPattern $dutyPattern)
    {
        $dutyPattern->moveToTrash();

        return response()->noContent();
    }

    /** **გაგრძელება** `until`-მდე — ახალი მორიგეობები, დაკავებული დღე გამოიტოვება */
    public function continue(Request $request, DutyPattern $dutyPattern)
    {
        $data = $request->validate(['until' => ['required', 'date_format:Y-m-d']]);

        // ⚠️ ურნაში მყოფი სამსახური `trash` scope-ით „არ არსებობს"
        $workplace = DutyWorkplace::query()->with('rates')->find($dutyPattern->workplace_id);
        abort_unless($workplace, 404, 'not_found');

        $from = $dutyPattern->continuesFrom();
        $until = CarbonImmutable::parse($data['until']);

        if ($until->lessThan($from)) {
            return response()->json(['created' => 0, 'skipped' => 0, 'generated_until' => $dutyPattern->generated_until?->toDateString()]);
        }

        abort_if($from->diffInDays($until) > DutyPattern::MAX_DAYS, 422, 'duty_range_too_long');

        $type = $dutyPattern->type_id ? DutyShiftType::query()->find($dutyPattern->type_id) : null;
        $hours = (float) $dutyPattern->hours;
        $dates = $dutyPattern->datesBetween($from, $until);

        // იმავე სამსახურის დაკავებული დღეები (ნებისმიერი სტატუსით) — შენი გადაწყვეტილებაა
        $taken = DutyShift::query()
            ->where('workplace_id', $workplace->id)
            ->whereIn('date', $dates)
            ->pluck('date')
            ->map(fn ($date) => $date->toDateString())
            ->all();

        $fresh = array_values(array_diff($dates, $taken));

        DB::transaction(function () use ($fresh, $dutyPattern, $workplace, $type, $hours, $until, $request) {
            foreach ($fresh as $date) {
                DutyShift::create([
                    'user_id' => $request->user()->id,
                    'date' => $date,
                    'workplace_id' => $workplace->id,
                    'type_id' => $type?->id,
                    'pattern_id' => $dutyPattern->id,
                    'hours' => $hours,
                    'start_time' => $dutyPattern->start_time,
                    'status' => DutyShift::SCHEDULED,
                    'pay' => DutyPay::for($workplace, $type, $hours),
                ]);
            }

            $dutyPattern->update(['generated_until' => $until->toDateString()]);
        });

        return response()->json([
            'created' => count($fresh),
            'skipped' => count($dates) - count($fresh),
            'generated_until' => $until->toDateString(),
        ]);
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * მონიშნული მორიგეობები რიტმს მიეკუთვნება — მხოლოდ ჩემი და იმავე სამსახურის;
     * `generated_until` — ბოლო მათგანი.
     *
     * @param  list<int>  $ids
     */
    private function adopt(DutyPattern $pattern, array $ids): void
    {
        $shifts = DutyShift::query()
            ->whereIn('id', array_map('intval', $ids))
            ->where('workplace_id', $pattern->workplace_id)
            ->get();

        foreach ($shifts as $shift) {
            $shift->update(['pattern_id' => $pattern->id]);
        }

        $last = $shifts->max(fn (DutyShift $shift) => $shift->date->toDateString());

        if ($last !== null && ($pattern->generated_until === null || $last > $pattern->generated_until->toDateString())) {
            $pattern->update(['generated_until' => $last]);
        }
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?DutyPattern $pattern = null): array
    {
        $userId = $request->user()->id;
        $live = fn (string $table) => Rule::exists($table, 'id')->whereNull('trashed_at')->where('user_id', $userId);
        $sometimes = $pattern ? 'sometimes' : 'required';

        $data = $request->validate([
            'workplace_id' => [$sometimes, 'integer', $live('duty_workplaces')],
            'type_id' => ['nullable', 'integer', $live('duty_shift_types')],
            'hours' => ['nullable', 'numeric', 'min:0.5', 'max:72'],
            'interval_days' => [$sometimes, 'integer', 'min:1', 'max:'.DutyPattern::MAX_INTERVAL],
            'anchor_date' => [$sometimes, 'date_format:Y-m-d'],
            'start_time' => ['nullable', 'date_format:H:i'],
            'is_active' => ['sometimes', 'boolean'],
            'generated_until' => ['nullable', 'date_format:Y-m-d'],
            'adopt_ids' => ['sometimes', 'array', 'max:400'],
            'adopt_ids.*' => ['integer'],
        ]);

        // საათები ტიპისაა, თუ ცხადად არ მოვიდა; ტიპის გარეშე — სავალდებულო
        $typeId = array_key_exists('type_id', $data) ? $data['type_id'] : $pattern?->type_id;
        $type = $typeId ? DutyShiftType::query()->find($typeId) : null;

        if (! isset($data['hours']) && (array_key_exists('type_id', $data) || ! $pattern)) {
            abort_if($type === null, 422, 'duty_hours_required');
            $data['hours'] = (float) $type->hours;
        }

        return $data;
    }
}
