<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * **მორიგეობის პერიოდი — „თვე“, რომელიც შენ განსაზღვრე.**
 *
 * პერიოდი იწყება „პერიოდის პირველ დღეს“ (1–28) და მთავრდება მომდევნო თვის იმავე
 * დღის წინა დღეს: 15 → 15 სექტ – 14 ოქტ; 1 → ჩვეულებრივი კალენდარული თვე.
 * ⚠️ 28-ზე მეტი არ არის — თებერვალს 29/30/31 არ აქვს და პერიოდი „დაცურავდა“.
 *
 * ⚠️ **ცვლილება მომავალზე მოქმედებს, ძველი პერიოდები თავის საზღვრებს ინახავს**.
 * ამიტომ წესი ერთი რიცხვი კი არა, **ისტორიაა**: `[{since, day}]` —
 * `since` ახალი წესის პირველი დღეა (`null` — თავიდანვე). გარდამავალი პერიოდი
 * შეიძლება მოკლე იყოს (1 → 15 ცვლილებაზე: „1 ნოე – 14 ნოე“) — ეს პატიოსანია:
 * არც ერთი დღე ორ პერიოდში არ ხვდება და არც ერთი არ იკარგება.
 *
 * ⚠️ **წესები სამსახურისაა** (`DutyWorkplace::periodRules()`); ცარიელი სია —
 * კალენდარული თვე („ყველა სამსახურის" ხედი, დეშბორდი).
 */
final class DutyPeriod
{
    public const MIN_DAY = 1;

    public const MAX_DAY = 28;

    /**
     * პერიოდი, რომელშიც თარიღი ხვდება.
     *
     * @param  list<array{since: ?string, day: int}>  $rules
     * @return array{from: CarbonImmutable, to: CarbonImmutable}
     */
    public static function containing(CarbonInterface|string $date, array $rules): array
    {
        $day = self::startOf($date);
        [$rule, $next] = self::ruleAt($day, self::normalize($rules));
        $start = $rule['day'];

        $from = $day->day >= $start ? $day->day($start) : $day->startOfMonth()->subMonth()->day($start);
        $boundary = $day->day >= $start ? $day->startOfMonth()->addMonth()->day($start) : $day->day($start);
        $to = $boundary->subDay();

        // გარდამავალი პერიოდი — წესის საზღვრებით მოჭრილი
        if ($rule['since'] !== null && $from->lessThan($rule['since'])) {
            $from = $rule['since'];
        }

        if ($next !== null && $to->greaterThanOrEqualTo($next['since'])) {
            $to = $next['since']->subDay();
        }

        return ['from' => $from, 'to' => $to];
    }

    /** @param list<array{since: ?string, day: int}> $rules */
    public static function previous(CarbonInterface|string $date, array $rules): array
    {
        return self::containing(self::containing($date, $rules)['from']->subDay(), $rules);
    }

    /** @param list<array{since: ?string, day: int}> $rules */
    public static function next(CarbonInterface|string $date, array $rules): array
    {
        return self::containing(self::containing($date, $rules)['to']->addDay(), $rules);
    }

    /**
     * ბოლო `$count` პერიოდი `$until`-მდე (ჩათვლით), ძველიდან ახლისკენ — ჯამების გრაფიკი.
     *
     * @param  list<array{since: ?string, day: int}>  $rules
     * @return list<array{from: CarbonImmutable, to: CarbonImmutable}>
     */
    public static function lastPeriods(CarbonInterface|string $until, array $rules, int $count): array
    {
        $out = [self::containing($until, $rules)];

        while (count($out) < $count) {
            array_unshift($out, self::containing($out[0]['from']->subDay(), $rules));
        }

        return $out;
    }

    /**
     * **ახალი „პერიოდის პირველი დღე“** — წესების ახალი ისტორია.
     *
     * ⚠️ ცვლილება მომდევნო პერიოდის დასაწყისიდან მოქმედებს, მიმდინარე და ძველი
     * თავის საზღვრებს ინახავს. ⚠️ **გამონაკლისი — ჯერ არაფერი ჩაწერილა**
     * (`$recordedBefore` მომდევნო პერიოდამდე მორიგეობას ვერ პოულობს): შესანახი
     * ისტორია არ არსებობს და დღე მაშინვე იცვლება. ⚠️ მომავალში დაგეგმილი (ჯერ
     * დაუწყებელი) ცვლილება იცვლება და არ გროვდება.
     *
     * @param  list<array{since: ?string, day: int}>  $rules
     * @param  \Closure(string): bool  $recordedBefore  არის თუ არა მორიგეობა ამ დღემდე (`Y-m-d`, არაჩათვლით)
     * @return list<array{since: ?string, day: int}>
     */
    public static function withDay(array $rules, int $day, CarbonInterface $today, \Closure $recordedBefore): array
    {
        $day = max(self::MIN_DAY, min(self::MAX_DAY, $day));
        $today = self::startOf($today);

        // დაგეგმილი (მომავალი) წესი ქრება — მის ადგილს ახალი პასუხი იკავებს
        $rules = array_values(array_filter(
            $rules,
            fn (array $rule) => $rule['since'] === null || $rule['since'] <= $today->toDateString(),
        ));

        $nextStart = self::containing($today, $rules)['to']->addDay();

        if (! $recordedBefore($nextStart->toDateString())) {
            return [['since' => null, 'day' => $day]];
        }

        if (self::dayAt($today, $rules) === $day) {
            return $rules;
        }

        $rules[] = ['since' => $nextStart->toDateString(), 'day' => $day];

        return $rules;
    }

    /**
     * წესები შესანახად/პასუხისთვის — გაწმენდილი, თარიღი `Y-m-d`-ით.
     *
     * @param  list<mixed>  $rules
     * @return list<array{since: ?string, day: int}>
     */
    public static function serialize(array $rules): array
    {
        return array_map(fn (array $rule) => [
            'since' => $rule['since']?->toDateString(),
            'day' => $rule['day'],
        ], self::normalize($rules));
    }

    /** მოქმედი დღე თარიღზე — „პერიოდის პირველი დღე“ */
    public static function dayAt(CarbonInterface|string $date, array $rules): int
    {
        return self::ruleAt(self::startOf($date), self::normalize($rules))[0]['day'];
    }

    /**
     * წესების გაწმენდა: დალაგება, დღე 1–28-ში, პირველი `since = null`.
     *
     * ⚠️ რიგი `module_user.settings`-იდან მოდის, რომელსაც საერთო `PUT
     * /modules/{key}/settings` ხელსაც ახლებს — ე.ი. აქ არაფერი ითვლება
     * სანდოდ; ცარიელზე ნაგულისხმევი კალენდარული თვეა.
     *
     * @param  list<mixed>  $rules
     * @return list<array{since: ?CarbonImmutable, day: int}>
     */
    public static function normalize(array $rules): array
    {
        $out = [];

        foreach ($rules as $rule) {
            if (! is_array($rule) || ! is_numeric($rule['day'] ?? null)) {
                continue;
            }

            $since = null;

            if (is_string($rule['since'] ?? null) && $rule['since'] !== '') {
                try {
                    $since = self::startOf($rule['since']);
                } catch (\Throwable) {
                    continue;
                }
            }

            $out[] = ['since' => $since, 'day' => max(self::MIN_DAY, min(self::MAX_DAY, (int) $rule['day']))];
        }

        usort($out, fn (array $a, array $b) => match (true) {
            $a['since'] === null && $b['since'] === null => 0,
            $a['since'] === null => -1,
            $b['since'] === null => 1,
            default => $a['since']->getTimestamp() <=> $b['since']->getTimestamp(),
        });

        if ($out === [] || $out[0]['since'] !== null) {
            array_unshift($out, ['since' => null, 'day' => $out[0]['day'] ?? self::MIN_DAY]);
        }

        return $out;
    }

    /**
     * @param  list<array{since: ?CarbonImmutable, day: int}>  $rules
     * @return array{0: array{since: ?CarbonImmutable, day: int}, 1: array{since: CarbonImmutable, day: int}|null}
     */
    private static function ruleAt(CarbonImmutable $day, array $rules): array
    {
        $current = $rules[0];
        $next = null;

        foreach ($rules as $rule) {
            if ($rule['since'] === null || $rule['since']->lessThanOrEqualTo($day)) {
                $current = $rule;
            } elseif ($next === null) {
                $next = $rule;
            }
        }

        return [$current, $next];
    }

    private static function startOf(CarbonInterface|string $date): CarbonImmutable
    {
        return ($date instanceof CarbonInterface
            ? CarbonImmutable::instance($date)->setTimezone(AppTime::zone())
            : CarbonImmutable::parse($date, AppTime::zone()))->startOfDay();
    }
}
