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
        $merged = [...self::read($user, $module), ...$values];

        $attrs = ['settings' => json_encode($merged)];

        // `enabled_at` მხოლოდ პირველად (super_admin-ს pivot-ი შეიძლება საერთოდ არ ჰქონდეს)
        if (! $user->modules()->where('modules.id', $module->id)->exists()) {
            $attrs['enabled_at'] = now();
        }

        $user->modules()->syncWithoutDetaching([$module->id => $attrs]);

        return $merged;
    }
}
