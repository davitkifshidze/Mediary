<?php

use App\Models\UserCredential;
use App\Support\CredentialProviders;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ტელეგრამის ბოტის ტოკენი „მონაცემებში"** (§21.9, შენი მითითება 2026-09-15:
 * „ყველაფერი მონაცემებში უნდა იყოს, ტელეგრამის ჩატბოტისაც").
 *
 * ⚠️ **მიზეზი მხოლოდ ადგილი არაა.** `module_user.settings` ღია JSON-ია და
 * მოდულების **ყოველ** სიაში ბრუნდება — ე.ი. ბოტის ტოკენი, რომელიც ბოტზე
 * სრულ წვდომას იძლევა, ღიად ეგზავნებოდა ბრაუზერს და ღიად ეწერა ბაზაში.
 * `user_credentials`-ში ის დაშიფრულია, ნიღბიანია და ნახვა ცხადი მოქმედებაა.
 *
 * ⚠️ **ძველი გასაღებები pivot-ში რჩება და ეს განზრახაა.** ერთი, საერთო JSON
 * ბლობია, სადაც გალერეის პარამეტრები, ველების კონფიგი და სტატუსების განლაგებაც
 * ზის — ორი გასაღების ამოსაჭრელად მთელი ბლობის გადაწერა იმაზე მეტ რისკს
 * ატარებს, ვიდრე წაუკითხავი ნარჩენი. `NoteChannelSettings` ახალს კითხულობს
 * პირველად, ძველს — მხოლოდ მაშინ, თუ ახალში არაფერია.
 *
 * ⚠️ **Eloquent გამოიყენება განზრახ**: `credentials` სვეტს `encrypted:array`
 * cast აქვს, ე.ი. პირდაპირ `DB::table()->insert()` შიფრავად კი არა, ღია
 * ტექსტად ჩაწერდა — ზუსტად იმას, რასაც ეს მიგრაცია ასწორებს.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('module_user') || ! Schema::hasTable('user_credentials')) {
            return;
        }

        $moduleId = DB::table('modules')->where('key', 'note')->value('id');

        if (! $moduleId) {
            return;
        }

        $rows = DB::table('module_user')->where('module_id', $moduleId)->get(['user_id', 'settings']);

        foreach ($rows as $row) {
            $settings = json_decode((string) $row->settings, true) ?: [];

            $token = trim((string) ($settings['telegram_bot_token'] ?? ''));
            $chat = trim((string) ($settings['telegram_chat_id'] ?? ''));

            if ($token === '' && $chat === '') {
                continue;
            }

            $fields = [];

            if ($token !== '') {
                $fields['bot_token'] = $token;
            }

            if ($chat !== '') {
                $fields['chat_id'] = $chat;
            }

            // ⚠️ `firstOrNew`: მიგრაციის ხელახლა გაშვება არსებულს არ გადააწერს
            $credential = UserCredential::firstOrNew([
                'user_id' => $row->user_id,
                'provider' => CredentialProviders::TELEGRAM,
            ]);

            if ($credential->exists) {
                continue;
            }

            $credential->credentials = $fields;
            $credential->is_active = true;
            $credential->save();
        }
    }

    public function down(): void
    {
        DB::table('user_credentials')->where('provider', CredentialProviders::TELEGRAM)->delete();
    }
};
