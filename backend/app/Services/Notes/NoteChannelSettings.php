<?php

namespace App\Services\Notes;

use App\Models\Module;
use App\Models\User;
use App\Services\Credentials\CredentialStore;
use App\Support\CredentialProviders;
use Illuminate\Support\Facades\DB;

/**
 * მიწოდების არხების პარამეტრები (Tasks §13.3) — ტელეგრამის ბოტის token/chat id.
 *
 * ⚠️ **ელფოსტა აქ აღარაა (Tasks §8.2)** — არხი მთლიანად ამოღებულია. ძველი
 * `email` გასაღები pivot-ის JSON-ში შეიძლება დარჩეს; მას უბრალოდ არავინ
 * კითხულობს (ნარჩენის წაშლა ერთადერთ ბლობში სხვა მოდულის პარამეტრებსაც
 * გადაატრიალებდა — `settings`-ში გალერეისა და ველების კონფიგიც დევს).
 *
 * ⚠️ **2026-09-15-დან ტოკენი `user_credentials`-შია და არა `module_user.settings`-ში**
 * (შენი მითითება: „ყველაფერი მონაცემებში უნდა იყოს, ტელეგრამის ჩატბოტისაც").
 * ორი მიზეზი ერთმანეთს ემთხვევა: ტოკენი **გასაღებია** და ამ აპში გასაღები
 * ერთ ადგილას ცხოვრობს (დაშიფრული, ნიღბიანი, ნახვა/კოპირებით), ხოლო
 * `module_user.settings` **ღიად** ინახავდა და ღიად აბრუნებდა მას მოდულების
 * ყოველ სიაში.
 *
 * ⚠️ **ძველი ადგილი მაინც იკითხება** — მიგრაცია მნიშვნელობებს გადაიტანს,
 * მაგრამ fallback რჩება: ჩაწერილი pivot-ი შეიძლება მიგრაციამდე შექმნილ
 * ასლში ან სხვა კომპიუტერზე იდოს, და ჩუმად გაჩუმებული შეხსენება ყველაზე
 * ცუდი შედეგია.
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
        $userId = (int) $user->getKey();

        $token = CredentialStore::value(CredentialProviders::TELEGRAM, 'bot_token', $userId);
        $chat = CredentialStore::value(CredentialProviders::TELEGRAM, 'chat_id', $userId);

        // ძველი ადგილი — მხოლოდ იმ შემთხვევაში, თუ ახალში არაფერია
        if ($token === null || $chat === null) {
            $settings = $this->raw($user);
            $token ??= $this->str($settings['telegram_bot_token'] ?? null);
            $chat ??= $this->str($settings['telegram_chat_id'] ?? null);
        }

        return [
            'telegram_bot_token' => $token,
            'telegram_chat_id' => $chat,
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
