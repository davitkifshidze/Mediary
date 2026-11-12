<?php

namespace App\Services\Goals;

use App\Models\Goal;
use App\Models\Module;
use App\Models\User;
use App\Services\Stats\LibraryStats;
use App\Support\AppTime;
use App\Support\CustomModules;
use Carbon\CarbonImmutable;

/**
 * **მიზნების წიგნი** — რომელ მოდულს შეუძლია მიზანი, რა პერიოდია და სად დგას ის.
 *
 * ⚠️ **პროგრესის ერთი წყარო** — `LibraryStats::doneBetween()`: იგივე სვეტი და იგივე
 * ნახვების ჟურნალი, რითაც სტატისტიკა ითვლის. მეორე დამთვლელი იმავე კითხვაზე სხვა
 * რიცხვს მოგვცემდა და განსხვავებას ვერავინ ახსნიდა.
 * ⚠️ **„დღეს" აპის ზონაშია** (`AppTime`) — შუაღამესთან UTC მიზანს ერთი დღით ადრე
 * დახურავდა ან ტემპს ერთი დღით დააგვიანებდა.
 */
class GoalBook
{
    public function __construct(private readonly LibraryStats $stats) {}

    /**
     * მოდულები, რომლებზეც ამ ანგარიშს მიზნის დასმა შეუძლია: ჩართული, ხილული და
     * „როდის დავასრულე" თარიღის მქონე (`LibraryStats::goalModules()`).
     *
     * @return list<string>
     */
    public function modules(User $user): array
    {
        $keys = Module::where('is_active', true)
            ->where(fn ($q) => $q
                ->whereIn('key', LibraryStats::modules())
                ->orWhereIn('key', CustomModules::keysOf($user)))
            ->orderBy('sort_order')
            ->orderBy('id')
            ->pluck('key')
            ->filter(fn (string $key) => $user->hasModule($key) && $user->hasPermission($key, 'view'))
            ->values()
            ->all();

        return LibraryStats::goalModules($keys);
    }

    /**
     * პერიოდის ორი თარიღი. წელი, თვე და კვირა `$anchor`-ის შემცველი პერიოდია
     * (კვირა ორშაბათით იწყება); საკუთარი — ზუსტად ის, რაც მოვიდა.
     *
     * @return array{0: string, 1: string}
     */
    public function range(string $period, string $anchor, ?string $end = null): array
    {
        $day = CarbonImmutable::parse($anchor, AppTime::zone())->startOfDay();

        return match ($period) {
            'year' => [$day->startOfYear()->toDateString(), $day->endOfYear()->toDateString()],
            'month' => [$day->startOfMonth()->toDateString(), $day->endOfMonth()->toDateString()],
            'week' => [$day->startOfWeek(CarbonImmutable::MONDAY)->toDateString(), $day->endOfWeek(CarbonImmutable::SUNDAY)->toDateString()],
            default => [$day->toDateString(), CarbonImmutable::parse($end ?? $anchor, AppTime::zone())->toDateString()],
        };
    }

    /**
     * მიზანი პასუხისთვის — პროგრესით, ტემპით და მდგომარეობით.
     *
     * - `state`: `upcoming` (ჯერ არ დაწყებულა) · `active` · `achieved` · `failed` (ვადა გავიდა);
     * - `expected`: რამდენი უნდა იყოს დღეს, თანაბარი ტემპით; `pace` = `done − expected`
     *   (დადებითი — გრაფიკს უსწრებ, უარყოფითი — ჩამორჩები). ისტორიაში ტემპი აღარ ითქმება.
     *
     * @param  array<int, array{name_ka: ?string, name_en: ?string}>  $classifiers  მოდულის კლასიფიკატორი (id → სახელი)
     * @return array<string, mixed>
     */
    public function present(User $user, Goal $goal, array $classifiers = []): array
    {
        $today = AppTime::now()->toDateString();
        $done = $this->stats->doneBetween($user, $goal->module, $goal->starts_on, $goal->ends_on, $goal->classifier_id);

        $total = CarbonImmutable::parse($goal->starts_on)->diffInDays(CarbonImmutable::parse($goal->ends_on)) + 1;
        $elapsed = match (true) {
            $today < $goal->starts_on => 0,
            $today > $goal->ends_on => $total,
            default => CarbonImmutable::parse($goal->starts_on)->diffInDays(CarbonImmutable::parse($today)) + 1,
        };
        $expected = (int) round($goal->target * $elapsed / max(1, $total));

        $state = match (true) {
            $done >= $goal->target => 'achieved',
            $today < $goal->starts_on => 'upcoming',
            $today > $goal->ends_on => 'failed',
            default => 'active',
        };

        return [
            'id' => $goal->id,
            'module' => $goal->module,
            'name' => $goal->name,
            'period' => $goal->period,
            'starts_on' => $goal->starts_on,
            'ends_on' => $goal->ends_on,
            'target' => $goal->target,
            'classifier_id' => $goal->classifier_id,
            'classifier' => $goal->classifier_id ? ($classifiers[$goal->classifier_id] ?? ['name_ka' => null, 'name_en' => null]) : null,
            'done' => $done,
            'state' => $state,
            // დასრულებული პერიოდი ისტორიაა — აქტიურ სიაში აღარ ჩანს
            'past' => $today > $goal->ends_on,
            'days_total' => (int) $total,
            'days_left' => (int) max(0, $total - $elapsed),
            'expected' => $state === 'active' ? $expected : null,
            'pace' => $state === 'active' ? $done - $expected : null,
        ];
    }
}
