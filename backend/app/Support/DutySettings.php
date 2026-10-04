<?php

namespace App\Support;

use App\Models\DutyShift;
use App\Models\Module;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * **მორიგეობის მოდულის პარამეტრები (Tasks §34.2–34.3)** — `module_user.settings.duty`.
 *
 *  · `period` — პერიოდის წესების ისტორია (`DutyPeriod`, `[{since, day}]`);
 *  · `currency` — ვალუტის ნიშანი („₾“);
 *  · `default_workplace_id` / `default_type_id` — სწრაფი დამატების საწყისი არჩევანი;
 *  · `remind_at` / `remind_telegram` — შეხსენება წინა დღეს (§34.7, `DutyReminder`).
 *
 * ⚠️ **პერიოდის დღის შეცვლა მომავალზე მოქმედებს** (Q8, `setPeriodDay()`): ახალი წესი
 * მომდევნო პერიოდის დასაწყისიდან იწყება, მიმდინარე და ძველი თავის საზღვრებს
 * ინახავს. ⚠️ **გამონაკლისი — ჯერ არაფერი ჩაგიწერია** (მიმდინარე და წინა
 * პერიოდებში მორიგეობა არ არის): მაშინ შესანახი ისტორია არ არსებობს და დღე
 * მაშინვე იცვლება — მოდულის პირველი გამართვა „შემდეგი თვიდან“ უაზრო იქნებოდა.
 */
final class DutySettings
{
    public const KEY = 'duty';

    public const DEFAULT_CURRENCY = '₾';

    /**
     * @return array{period: list<array{since: ?string, day: int}>, currency: string, default_workplace_id: ?int, default_type_id: ?int, remind_at: ?string, remind_telegram: bool}
     */
    public static function read(User $user): array
    {
        $module = self::module();
        $stored = $module ? (ModuleSettings::read($user, $module)[self::KEY] ?? []) : [];

        return self::parse(is_array($stored) ? $stored : []);
    }

    /**
     * **ნედლი ბლობის გაწმენდა** — ერთი წესი სამ მკითხველზე: `read()`, დეშბორდი
     * (pivot უკვე ჩატვირთულია) და შეხსენება (cron — `Auth`-ის გარეშე).
     *
     * ⚠️ ბლობს საერთო `PUT /modules/{key}/settings`-იც ეხება, ე.ი. აქ არაფერი
     * ითვლება სანდოდ: არასწორი მნიშვნელობა ნაგულისხმევზე ბრუნდება.
     *
     * @param  array<string, mixed>  $stored
     * @return array{period: list<array{since: ?string, day: int}>, currency: string, default_workplace_id: ?int, default_type_id: ?int, remind_at: ?string, remind_telegram: bool}
     */
    public static function parse(array $stored): array
    {
        $remind = $stored['remind_at'] ?? null;

        return [
            'period' => self::serialize(DutyPeriod::normalize(is_array($stored['period'] ?? null) ? $stored['period'] : [])),
            'currency' => is_string($stored['currency'] ?? null) && trim($stored['currency']) !== ''
                ? mb_substr(trim($stored['currency']), 0, 5)
                : self::DEFAULT_CURRENCY,
            'default_workplace_id' => is_numeric($stored['default_workplace_id'] ?? null) ? (int) $stored['default_workplace_id'] : null,
            'default_type_id' => is_numeric($stored['default_type_id'] ?? null) ? (int) $stored['default_type_id'] : null,
            // §34.7 — „20:00“; `null` — შეხსენება გამორთულია
            'remind_at' => is_string($remind) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $remind) ? $remind : null,
            'remind_telegram' => (bool) ($stored['remind_telegram'] ?? false),
        ];
    }

    /** @return list<array{since: ?string, day: int}> */
    public static function rules(User $user): array
    {
        return self::read($user)['period'];
    }

    /**
     * ჩაწერა — მხოლოდ მოწოდებული გასაღებები (`ModuleSettings::merge()`-ის წესი).
     *
     * @param  array<string, mixed>  $values
     * @return array<string, mixed> ახალი პარამეტრები
     */
    public static function write(User $user, array $values): array
    {
        $current = self::read($user);

        if (array_key_exists('period_start_day', $values)) {
            $current['period'] = self::setPeriodDay($user, $current['period'], (int) $values['period_start_day']);
        }

        foreach (['currency', 'default_workplace_id', 'default_type_id', 'remind_at', 'remind_telegram'] as $key) {
            if (array_key_exists($key, $values)) {
                $current[$key] = $values[$key];
            }
        }

        if ($module = self::module()) {
            ModuleSettings::merge($user, $module, [self::KEY => $current]);
        }

        return self::read($user);
    }

    /**
     * ახალი „პერიოდის პირველი დღე“.
     *
     * ⚠️ მომავალში დაგეგმილი (ჯერ დაუწყებელი) ცვლილება იცვლება და არ გროვდება —
     * ორი სხვადასხვა „შემდეგი თვიდან“ ერთმანეთს არ უნდა გადაეფაროს.
     *
     * @param  list<array{since: ?string, day: int}>  $rules
     * @return list<array{since: ?string, day: int}>
     */
    private static function setPeriodDay(User $user, array $rules, int $day): array
    {
        $day = max(DutyPeriod::MIN_DAY, min(DutyPeriod::MAX_DAY, $day));
        $today = AppTime::now()->startOfDay();

        // დაგეგმილი (მომავალი) წესი ქრება — მის ადგილს ახალი პასუხი იკავებს
        $rules = array_values(array_filter(
            $rules,
            fn (array $rule) => $rule['since'] === null || $rule['since'] <= $today->toDateString(),
        ));

        $current = DutyPeriod::containing($today, $rules);
        $nextStart = $current['to']->addDay();

        $recorded = DutyShift::withoutGlobalScope('owner')
            ->where('user_id', $user->getKey())
            ->where('date', '<', $nextStart->toDateString())
            ->exists();

        if (! $recorded) {
            return [['since' => null, 'day' => $day]];
        }

        if (DutyPeriod::dayAt($today, $rules) === $day) {
            return $rules;
        }

        $rules[] = ['since' => $nextStart->toDateString(), 'day' => $day];

        return $rules;
    }

    /**
     * @param  list<array{since: ?CarbonImmutable, day: int}>  $rules
     * @return list<array{since: ?string, day: int}>
     */
    private static function serialize(array $rules): array
    {
        return array_map(fn (array $rule) => [
            'since' => $rule['since']?->toDateString(),
            'day' => $rule['day'],
        ], $rules);
    }

    private static function module(): ?Module
    {
        return Module::query()->where('key', 'duty')->first();
    }
}
