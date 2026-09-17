<?php

use App\Models\UserCredential;
use App\Support\CredentialProviders;
use App\Support\ModuleSettings;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ღია ბოტის ტოკენის ამოჭრა `module_user.settings`-იდან (Tasks SEC-12).**
 *
 * ⚠️ §21.9-ის მიგრაცია (`2026_09_15_000003_move_telegram_into_credentials`)
 * ტოკენს `user_credentials`-ში **დააკოპირა** და ძველი გასაღებები „განზრახ"
 * დატოვა. ეს ნარჩენი არ იყო „წაუკითხავი": `GET /api/modules` pivot-ის JSON-ს
 * ფილტრის გარეშე აბრუნებდა, ე.ი. ღია ტოკენი ყოველ მოდულების სიაში
 * ბრაუზერს ეგზავნებოდა და ყოველ dump-ში/`/backups`-ში ხვდებოდა.
 *
 * ⚠️ **ჯერ ავსება, მერე წაშლა — და ავსება ველ-ველ.** `NoteChannelSettings`
 * ჯერ `user_credentials`-ს კითხულობს და **ნაკლულ ველზე** pivot-ზე ვარდება,
 * ე.ი. ჩანაწერი, რომელსაც ტოკენი აქვს და `chat_id` — არა, `chat_id`-ს
 * pivot-იდან იღებდა. ყოველ ველის ცალკე შემოწმების გარეშე ამ რიგის წაშლა
 * შეხსენებას ჩუმად აჩუმებდა. ⚠️ `user_credentials`-ში **უკვე მდგომ**
 * მნიშვნელობას pivot-ისა არასდროს ცვლის — ის ახალია.
 *
 * ⚠️ **Eloquent განზრახ** — `credentials` `encrypted:array`-ია; `DB::table()`
 * ღია ტექსტს ჩაწერდა (§21.9-ის იგივე წესი). ⚠️ დანარჩენი JSON (ველები,
 * გალერეა, `status_sections`) **უცვლელი** რჩება.
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

            if (! array_intersect_key($settings, array_flip(ModuleSettings::RETIRED_KEYS))) {
                continue;
            }

            $this->backfill((int) $row->user_id, [
                'bot_token' => trim((string) ($settings['telegram_bot_token'] ?? '')),
                'chat_id' => trim((string) ($settings['telegram_chat_id'] ?? '')),
            ]);

            DB::table('module_user')
                ->where('user_id', $row->user_id)
                ->where('module_id', $moduleId)
                ->update(['settings' => json_encode(ModuleSettings::withoutRetired($settings))]);
        }
    }

    /**
     * ⚠️ **`down()` ღია ტოკენს არ აბრუნებს** — ეს სწორედ ის ხვრელი იქნებოდა,
     * რომელსაც მიგრაცია ხურავს. `user_credentials`-ში ყველაფერი რჩება, და
     * `NoteChannelSettings` ისედაც იქიდან კითხულობს.
     */
    public function down(): void {}

    /** @param  array{bot_token: string, chat_id: string}  $pivot */
    private function backfill(int $userId, array $pivot): void
    {
        $credential = UserCredential::firstOrNew([
            'user_id' => $userId,
            'provider' => CredentialProviders::TELEGRAM,
        ]);

        $fields = $credential->exists ? (array) $credential->credentials : [];
        $changed = [];

        foreach ($pivot as $field => $value) {
            if ($value !== '' && trim((string) ($fields[$field] ?? '')) === '') {
                $fields[$field] = $value;
                $changed[] = $field;
            }
        }

        if (! $changed) {
            return;
        }

        $credential->credentials = $fields;

        if (! $credential->exists) {
            $credential->is_active = true;
        }

        // CredentialController-ის წესი: ახალი გასაღების ჭდე ძველ გასაღებს ეკუთვნოდა
        if (in_array('bot_token', $changed, true)) {
            $credential->verified_at = null;
        }

        $credential->save();
    }
};
