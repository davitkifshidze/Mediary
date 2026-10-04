<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DutyShiftResource;
use App\Models\DutyShift;
use App\Services\Duty\DutyReminder;
use App\Support\AppTime;
use App\Support\DutyPeriod;
use App\Support\DutySettings;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

/**
 * **მორიგეობის პერიოდი, პარამეტრები და ჯამები (Tasks §34.3–34.5ა).**
 *
 *  · `GET /duty/period?date=` — პერიოდი თარიღით + წინა და შემდეგი (ნავიგაცია);
 *  · `GET|PUT /duty/settings` — პერიოდის დღე, ვალუტა, ნაგულისხმევები;
 *  · `GET /duty/summary?from&to` — ჯამი: სულ, სამსახურებით, ტიპებით;
 *  · `GET /duty/summary/periods?count=` — ბოლო N პერიოდი სამსახურებით (გრაფიკი).
 *
 * ⚠️ **ჯამი SQL-ში ჯგუფდება და PHP-ში იკეცება** — ერთი `group by` სამივე ჭრილს
 * იძლევა; თითო სამსახურზე ცალკე query ზუსტად ის შეცდომაა, რასაც დეშბორდმა
 * (PERF-05) თავი დააღწია. ⚠️ **თანხის გარეშე მორიგეობა ჯამში 0 არ არის** —
 * ის ცალკე ითვლება (`unpaid`), რომ „₾ 1 200“ ტყუილად სრულ ჯამად არ იკითხებოდეს.
 */
class DutyController extends Controller
{
    /** გრაფიკის ჭერი — ორი წელი */
    public const MAX_PERIODS = 24;

    public function period(Request $request)
    {
        $data = $request->validate(['date' => ['nullable', 'date_format:Y-m-d']]);

        $rules = DutySettings::rules($request->user());
        $date = $data['date'] ?? AppTime::now();

        return response()->json($this->periodPayload(DutyPeriod::containing($date, $rules), $rules));
    }

    public function settings(Request $request)
    {
        return response()->json($this->settingsPayload($request));
    }

    public function updateSettings(Request $request)
    {
        $userId = $request->user()->id;

        $data = $request->validate([
            'period_start_day' => ['sometimes', 'integer', 'min:'.DutyPeriod::MIN_DAY, 'max:'.DutyPeriod::MAX_DAY],
            'currency' => ['sometimes', 'string', 'max:5'],
            'default_workplace_id' => [
                'sometimes', 'nullable', 'integer',
                Rule::exists('duty_workplaces', 'id')->whereNull('trashed_at')->where('user_id', $userId),
            ],
            'default_type_id' => [
                'sometimes', 'nullable', 'integer',
                Rule::exists('duty_shift_types', 'id')->whereNull('trashed_at')->where('user_id', $userId),
            ],
            // §34.7 — შეხსენება წინა დღეს; `null` — გამორთულია
            'remind_at' => ['sometimes', 'nullable', 'date_format:H:i'],
            'remind_telegram' => ['sometimes', 'boolean'],
        ]);

        DutySettings::write($request->user(), $data);

        return response()->json($this->settingsPayload($request));
    }

    /**
     * **ჯამი შუალედზე** — `from`/`to` (ან მიმდინარე პერიოდი); `workplace_id[]` — ჭრა.
     *
     * ⚠️ `previous` მხოლოდ მაშინ მოდის, როცა შუალედი **ზუსტად პერიოდია** —
     * „წინა პერიოდთან შედარება“ ნებისმიერ შუალედზე აზრს კარგავს.
     */
    public function summary(Request $request)
    {
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'workplace_id' => ['nullable', 'array'],
            'workplace_id.*' => ['integer'],
        ]);

        $rules = DutySettings::rules($request->user());

        if (empty($data['from']) || empty($data['to'])) {
            $period = DutyPeriod::containing($data['from'] ?? $data['to'] ?? AppTime::now(), $rules);
        } else {
            $period = ['from' => CarbonImmutable::parse($data['from']), 'to' => CarbonImmutable::parse($data['to'])];
            abort_if($period['from']->diffInDays($period['to']) > DutyShiftController::MAX_RANGE_DAYS, 422, 'duty_range_too_long');
        }

        $workplaces = array_map('intval', $data['workplace_id'] ?? []);
        $current = $this->totals($period['from'], $period['to'], $workplaces);

        $exact = DutyPeriod::containing($period['from'], $rules);
        $isPeriod = $exact['from']->equalTo($period['from']) && $exact['to']->equalTo($period['to']);

        if ($isPeriod) {
            $previous = DutyPeriod::previous($period['from'], $rules);
            $current['previous'] = [
                'from' => $previous['from']->toDateString(),
                'to' => $previous['to']->toDateString(),
                ...$this->totals($previous['from'], $previous['to'], $workplaces)['totals'],
            ];
        }

        return response()->json([
            'from' => $period['from']->toDateString(),
            'to' => $period['to']->toDateString(),
            'is_period' => $isPeriod,
            ...$current,
        ]);
    }

    /**
     * **ბოლო N პერიოდი სამსახურებით** — გრაფიკი „თვეებით“ (§34.4).
     *
     * ⚠️ ერთი query მთელ შუალედზე (დღე × სამსახური) და PHP-ში პერიოდებად დაყოფა —
     * პერიოდის საზღვრები წესების ისტორიაზეა დამოკიდებული და SQL-ში არ ითვლება.
     */
    public function periods(Request $request)
    {
        $data = $request->validate([
            'count' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_PERIODS],
            'until' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $rules = DutySettings::rules($request->user());
        $periods = DutyPeriod::lastPeriods($data['until'] ?? AppTime::now(), $rules, (int) ($data['count'] ?? 12));

        $rows = DutyShift::query()
            ->whereBetween('date', [$periods[0]['from']->toDateString(), end($periods)['to']->toDateString()])
            ->selectRaw('date, workplace_id, count(*) as shifts, sum(hours) as hours, sum(pay) as pay')
            ->groupBy('date', 'workplace_id')
            ->get();

        $out = [];

        foreach ($periods as $period) {
            $from = $period['from']->toDateString();
            $to = $period['to']->toDateString();

            $inside = $rows->filter(function ($row) use ($from, $to) {
                $date = substr((string) $row->getRawOriginal('date'), 0, 10);

                return $date >= $from && $date <= $to;
            });

            $out[] = [
                'from' => $from,
                'to' => $to,
                'totals' => $this->fold($inside),
                'workplaces' => $inside->groupBy(fn ($row) => (string) $row->workplace_id)
                    ->map(fn (Collection $group, string $key) => ['workplace_id' => $key === '' ? null : (int) $key, ...$this->fold($group)])
                    ->values()
                    ->all(),
            ];
        }

        return response()->json(['data' => $out]);
    }

    /**
     * **ხვალინდელი მორიგეობების შეხსენება ღია აპისთვის (§34.7)** — `GET /duty/reminders/due`.
     *
     * ⚠️ ჯერ თვითონ ასრულებს შეხსენებას ამ ანგარიშზე (`DutyReminder::run()` —
     * cron-ის გარეშეც, ტელეგრამიც), მერე აბრუნებს **ყველა** უკვე შეხსენებულ ხვალინდელს —
     * ბრაუზერი ჩვენებას თვითონ იმახსოვრებს (ერთი და იგივე ორჯერ არ ჩნდება).
     */
    public function due(Request $request, DutyReminder $reminder)
    {
        $reminder->run($request->user());

        $tomorrow = AppTime::now()->addDay()->toDateString();

        return DutyShiftResource::collection(
            DutyShift::query()
                ->with(['workplace', 'type'])
                ->where('date', $tomorrow)
                ->whereNotNull('reminded_at')
                ->orderBy('start_time')
                ->orderBy('id')
                ->get(),
        );
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * @param  list<int>  $workplaces
     * @return array{totals: array<string, mixed>, workplaces: list<array<string, mixed>>, types: list<array<string, mixed>>}
     */
    private function totals(CarbonImmutable $from, CarbonImmutable $to, array $workplaces): array
    {
        $rows = DutyShift::query()
            ->whereBetween('date', [$from->toDateString(), $to->toDateString()])
            ->when($workplaces !== [], fn ($q) => $q->whereIn('workplace_id', $workplaces))
            ->selectRaw('workplace_id, type_id, count(*) as shifts, sum(hours) as hours, sum(pay) as pay, sum(case when pay is null then 1 else 0 end) as unpaid')
            ->groupBy('workplace_id', 'type_id')
            ->get();

        $by = fn (string $column) => $rows->groupBy(fn ($row) => (string) $row->{$column})
            ->map(fn (Collection $group, string $key) => [$column => $key === '' ? null : (int) $key, ...$this->fold($group)])
            ->values()
            ->all();

        return [
            'totals' => $this->fold($rows),
            'workplaces' => $by('workplace_id'),
            'types' => $by('type_id'),
        ];
    }

    /** @return array{shifts: int, hours: float, pay: float, unpaid: int} */
    private function fold(Collection $rows): array
    {
        return [
            'shifts' => (int) $rows->sum('shifts'),
            'hours' => round((float) $rows->sum('hours'), 1),
            'pay' => round((float) $rows->sum('pay'), 2),
            'unpaid' => (int) $rows->sum(fn ($row) => (int) ($row->unpaid ?? 0)),
        ];
    }

    /**
     * @param  array{from: CarbonImmutable, to: CarbonImmutable}  $period
     * @param  list<array{since: ?string, day: int}>  $rules
     * @return array<string, mixed>
     */
    private function periodPayload(array $period, array $rules): array
    {
        $previous = DutyPeriod::previous($period['from'], $rules);
        $next = DutyPeriod::next($period['from'], $rules);

        return [
            'from' => $period['from']->toDateString(),
            'to' => $period['to']->toDateString(),
            'previous' => ['from' => $previous['from']->toDateString(), 'to' => $previous['to']->toDateString()],
            'next' => ['from' => $next['from']->toDateString(), 'to' => $next['to']->toDateString()],
        ];
    }

    /** პარამეტრები + მოქმედი დღე, დაგეგმილი ცვლილება და მიმდინარე პერიოდი */
    private function settingsPayload(Request $request): array
    {
        $settings = DutySettings::read($request->user());
        $today = AppTime::now()->startOfDay();
        $pending = collect($settings['period'])->first(fn (array $rule) => $rule['since'] !== null && $rule['since'] > $today->toDateString());

        return [
            ...$settings,
            'period_start_day' => DutyPeriod::dayAt($today, $settings['period']),
            // ⚠️ მომავალი წესი — „15-დან, 1 ნოემბრიდან“: გვერდი ამას ცხადად წერს
            'pending' => $pending,
            'current' => $this->periodPayload(DutyPeriod::containing($today, $settings['period']), $settings['period']),
        ];
    }
}
