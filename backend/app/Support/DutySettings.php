<?php

namespace App\Support;

use App\Models\Module;
use App\Models\User;

/**
 * **მორიგეობის მოდულის პარამეტრები** — `module_user.settings.duty`.
 *
 *  · `currency` — ვალუტის ნიშანი („₾“);
 *  · `default_workplace_id` / `default_type_id` — სწრაფი დამატების საწყისი არჩევანი;
 *  · `remind_at` / `remind_telegram` — შეხსენება წინა დღეს (`DutyReminder`).
 *
 * ⚠️ **ანაზღაურების პერიოდი აქ აღარ არის** — ის სამსახურისაა
 * (`DutyWorkplace::periodRules()`); ბლობში დარჩენილი ძველი `period` არ იკითხება
 * (მიგრაციამ სამსახურებზე გადაიტანა).
 */
final class DutySettings
{
    public const KEY = 'duty';

    public const DEFAULT_CURRENCY = '₾';

    /**
     * @return array{currency: string, default_workplace_id: ?int, default_type_id: ?int, remind_at: ?string, remind_telegram: bool}
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
     * @return array{currency: string, default_workplace_id: ?int, default_type_id: ?int, remind_at: ?string, remind_telegram: bool}
     */
    public static function parse(array $stored): array
    {
        $remind = $stored['remind_at'] ?? null;

        return [
            'currency' => is_string($stored['currency'] ?? null) && trim($stored['currency']) !== ''
                ? mb_substr(trim($stored['currency']), 0, 5)
                : self::DEFAULT_CURRENCY,
            'default_workplace_id' => is_numeric($stored['default_workplace_id'] ?? null) ? (int) $stored['default_workplace_id'] : null,
            'default_type_id' => is_numeric($stored['default_type_id'] ?? null) ? (int) $stored['default_type_id'] : null,
            // „20:00“; `null` — შეხსენება გამორთულია
            'remind_at' => is_string($remind) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $remind) ? $remind : null,
            'remind_telegram' => (bool) ($stored['remind_telegram'] ?? false),
        ];
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

    private static function module(): ?Module
    {
        return Module::query()->where('key', 'duty')->first();
    }
}
