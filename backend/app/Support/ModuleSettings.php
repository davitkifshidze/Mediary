<?php

namespace App\Support;

use App\Models\Module;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * `module_user.settings` — ერთი JSON ბლოკი, რომელშიც **რამდენიმე** ფუნქციაა
 * (ველები, გალერეის პარამეტრები, შეხსენების არხები, საიდბარის განლაგება).
 *
 * ⚠️ **წერა ყოველთვის შერწყმაა** — ერთი გასაღების ჩაწერა დანარჩენებს არ
 * უნდა წაშლოს (CLAUDE.md, *Field builder*).
 * ⚠️ `DB::table` განზრახ: pivot-ის JSON-ს Eloquent არ cast-ავს.
 */
final class ModuleSettings
{
    /**
     * **SEC-12 — გასაღებები, რომლებიც აქ ღიად ინახებოდა და აღარ უნდა.**
     *
     * ⚠️ §21.9-ის მიგრაცია (`move_telegram_into_credentials`) ტოკენს
     * `user_credentials`-ში **დააკოპირა**, pivot-ში კი „განზრახ" დატოვა — და
     * `GET /api/modules` pivot-ის JSON-ს ფილტრის გარეშე `user_settings`-ად
     * აბრუნებდა. ე.ი. 46-სიმბოლოიანი ბოტის ტოკენი ღიად კვლავ ყოველ მოდულების
     * სიაში ბრაუზერს ეგზავნებოდა, ყოველ dump-ში და `/backups`-ის ყოველ ფაილში
     * ხვდებოდა — ზუსტად ის, რის გამოც §21.9 კეთდებოდა. `2026_09_17_000001`
     * მიგრაცია მათ ამოჭრის (ჯერ `user_credentials`-ში ნაკლულ ველებს ავსებს).
     *
     * ⚠️ **ამ გასაღებებს ეს კლასი არც წერს, არც გარეთ გასცემს**
     * (`merge()`, `withoutRetired()`), ე.ი. ძველი კლიენტი ან ხელით
     * დაწერილი `PUT` ღია ასლს ხელახლა არ შექმნის. `chat_id` საიდუმლო არაა,
     * მაგრამ ტოკენის წყვილია და ერთი ადგილი ერთ ფაქტს — `user_credentials`.
     */
    public const RETIRED_KEYS = ['telegram_bot_token', 'telegram_chat_id'];

    /**
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    public static function withoutRetired(array $settings): array
    {
        return array_diff_key($settings, array_flip(self::RETIRED_KEYS));
    }

    /** @return array<string, mixed> */
    public static function read(User $user, Module $module): array
    {
        $json = DB::table('module_user')
            ->where('user_id', $user->getKey())
            ->where('module_id', $module->id)
            ->value('settings');

        return json_decode((string) $json, true) ?: [];
    }

    /**
     * მოწოდებული გასაღებები ჩაიწერება, დანარჩენი ადგილზე რჩება.
     *
     * @param  array<string, mixed>  $values
     * @return array<string, mixed> შერწყმული — ის, რაც მართლა ჩაიწერა
     */
    public static function merge(User $user, Module $module, array $values): array
    {
        /* ⚠️ SEC-12 — მოსული მნიშვნელობებიდან ამოღებული გასაღებები ცვივა, **ბაზაში
           მდგომი** კი (მიგრაციამდე) ადგილზე რჩება: მათ მიგრაცია ჯერ
           `user_credentials`-ში ნაკლულ ველებს ავსებს, მერე შლის — აქ წაშლა
           მიგრაციამდე ტოკენის ერთადერთ ასლს დაკარგავდა. */
        $merged = [...self::read($user, $module), ...self::withoutRetired($values)];

        $attrs = ['settings' => json_encode($merged)];

        // `enabled_at` მხოლოდ პირველად (super_admin-ს pivot-ი შეიძლება საერთოდ არ ჰქონდეს)
        if (! $user->modules()->where('modules.id', $module->id)->exists()) {
            $attrs['enabled_at'] = now();
        }

        $user->modules()->syncWithoutDetaching([$module->id => $attrs]);

        return $merged;
    }
}
