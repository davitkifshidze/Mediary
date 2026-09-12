<?php

namespace App\Services\Notes;

use App\Models\Module;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * მიწოდების არხების პარამეტრები (Tasks §13.3) — ტელეგრამის ბოტის token/chat id.
 *
 * ⚠️ **ელფოსტა აქ აღარაა (Tasks §8.2)** — არხი მთლიანად ამოღებულია. ძველი
 * `email` გასაღები pivot-ის JSON-ში შეიძლება დარჩეს; მას უბრალოდ არავინ
 * კითხულობს (ნარჩენის წაშლა ერთადერთ ბლობში სხვა მოდულის პარამეტრებსაც
 * გადაატრიალებდა — `settings`-ში გალერეისა და ველების კონფიგიც დევს).
 *
 * ⚠️ **`module_user.settings`-შია და არა `users.settings`-ში.** ეს პარამეტრები
 * მხოლოდ ამ მოდულს ეხება, per-module კონფიგი კი უკვე არსებობს
 * (`PUT /api/modules/{key}/settings`) — ანგარიშის დონეზე მათი გატანა
 * პარამეტრების გვერდს სხვისი მოდულის ველებით დაამძიმებდა.
 *
 * ⚠️ pivot-ის `settings` **JSON სტრიქონია** და არა cast-ული მასივი
 * (`CLAUDE.md`-ის gotcha) — ამიტომ `json_decode` ხელით.
 */
class NoteChannelSettings
{
    public const MODULE_KEY = 'note';

    /** @return array{telegram_bot_token: string|null, telegram_chat_id: string|null} */
    public function for(User $user): array
    {
        $settings = $this->raw($user);

        return [
            'telegram_bot_token' => $this->str($settings['telegram_bot_token'] ?? null),
            'telegram_chat_id' => $this->str($settings['telegram_chat_id'] ?? null),
        ];
    }

    /** ნედლი JSON pivot-იდან — CLI-შიც მუშაობს (Auth-ს არ ეყრდნობა) */
    private function raw(User $user): array
    {
        $moduleId = Module::where('key', self::MODULE_KEY)->value('id');

        if (! $moduleId) {
            return [];
        }

        $json = DB::table('module_user')
            ->where('user_id', $user->getKey())
            ->where('module_id', $moduleId)
            ->value('settings');

        return json_decode((string) $json, true) ?: [];
    }

    private function str(mixed $value): ?string
    {
        $value = is_string($value) ? trim($value) : null;

        return $value === '' ? null : $value;
    }
}
