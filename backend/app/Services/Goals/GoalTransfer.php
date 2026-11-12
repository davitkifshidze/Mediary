<?php

namespace App\Services\Goals;

use App\Models\Goal;
use App\Models\User;
use App\Services\Stats\LibraryStats;

/**
 * **მიზნები ექსპორტსა და იმპორტში.**
 *
 * მიზანი მოდულის ჩანაწერი არ არის, ამიტომ მოდულის ფაილის **კონვერტში** მგზავრობს
 * (`goals` — დამატებითი ველების განსაზღვრებებისა და სტატუსების გვერდით) და იმპორტი
 * მას იმ მოდულის ნებისმიერ ჩანაწერთან ერთად ამატებს.
 *
 * ⚠️ **პირობა სახელით გადის** და არა id-ით: კლასიფიკატორის id სხვა ანგარიშზე სხვა
 * რიგია. იმპორტში სახელი მიმღების ლექსიკონში იძებნება; ვერ ნაპოვნი პირობიანი მიზანი
 * **გამოიტოვება** და არა უპირობოდ იწერება — „დრამა 10" უპირობო „10" სხვა მიზანია.
 * კატეგორიას ჩანაწერების იმპორტი თვითონ ქმნის, ე.ი. მომდევნო ჩანაწერზე მიზანი
 * თავისით შემოვა (`merge()` იდემპოტენტურია).
 * ⚠️ ცხადი `user_id` და `owner` scope-ის გარეშე — ექსპორტი რიგის worker-იდანაც ეშვება.
 */
class GoalTransfer
{
    public function __construct(private readonly LibraryStats $stats) {}

    /** @return list<array<string, mixed>> */
    public function export(User $user, string $module): array
    {
        $names = $this->stats->classifiers($user, $module);

        return Goal::withoutGlobalScope('owner')
            ->where('user_id', $user->getKey())
            ->where('module', $module)
            ->orderBy('starts_on')
            ->orderBy('id')
            ->get()
            // წაშლილ კლასიფიკატორზე დარჩენილი მიზანი არაფერს ითვლის — ფაილშიც არ გადის
            ->filter(fn (Goal $goal) => ! $goal->classifier_id || isset($names[$goal->classifier_id]))
            ->map(fn (Goal $goal) => [
                'name' => $goal->name,
                'period' => $goal->period,
                'starts_on' => $goal->starts_on,
                'ends_on' => $goal->ends_on,
                'target' => $goal->target,
                'classifier' => $goal->classifier_id ? $names[$goal->classifier_id] : null,
            ])
            ->values()
            ->all();
    }

    /**
     * ფაილის მიზნების დამატება — რაც უკვე არის, მეორედ არ იწერება.
     *
     * @param  array<int, mixed>  $goals
     * @return int რამდენი დაემატა
     */
    public function merge(User $user, string $module, array $goals): int
    {
        if ($goals === [] || LibraryStats::goalModules([$module]) === []) {
            return 0;
        }

        $names = null;
        $added = 0;
        $room = Goal::MAX - Goal::withoutGlobalScope('owner')->where('user_id', $user->getKey())->count();

        foreach ($goals as $item) {
            if ($room <= 0 || ! is_array($item) || ! $this->valid($item)) {
                continue;
            }

            $classifier = null;

            if (is_array($item['classifier'] ?? null)) {
                $names ??= $this->stats->classifiers($user, $module);
                $classifier = $this->match($names, $item['classifier']);

                if ($classifier === null) {
                    continue;
                }
            }

            $attrs = [
                'user_id' => $user->getKey(),
                'module' => $module,
                'period' => $item['period'],
                'starts_on' => $item['starts_on'],
                'ends_on' => $item['ends_on'],
                'target' => (int) $item['target'],
                'classifier_id' => $classifier,
                'name' => is_string($item['name'] ?? null) && trim($item['name']) !== '' ? mb_substr(trim($item['name']), 0, Goal::NAME_MAX) : null,
            ];

            if (Goal::withoutGlobalScope('owner')->where($attrs)->exists()) {
                continue;
            }

            Goal::withoutGlobalScope('owner')->create($attrs);
            $added++;
            $room--;
        }

        return $added;
    }

    /** @param  array<string, mixed>  $item */
    private function valid(array $item): bool
    {
        $date = fn (mixed $value) => is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) && strtotime($value) !== false;

        return in_array($item['period'] ?? null, Goal::PERIODS, true)
            && $date($item['starts_on'] ?? null)
            && $date($item['ends_on'] ?? null)
            && $item['starts_on'] <= $item['ends_on']
            && is_numeric($item['target'] ?? null)
            && (int) $item['target'] >= 1
            && (int) $item['target'] <= 100000;
    }

    /**
     * @param  array<int, array{name_ka: ?string, name_en: ?string}>  $names
     * @param  array<string, mixed>  $wanted
     */
    private function match(array $names, array $wanted): ?int
    {
        foreach (['name_ka', 'name_en'] as $key) {
            $value = is_string($wanted[$key] ?? null) ? trim($wanted[$key]) : '';

            if ($value === '') {
                continue;
            }

            foreach ($names as $id => $name) {
                // ქართული ტექსტი PHP-ში ედრება და არა SQL-ში
                if (trim((string) ($name[$key] ?? '')) === $value) {
                    return (int) $id;
                }
            }
        }

        return null;
    }
}
