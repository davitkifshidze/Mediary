<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Tasks §8.2 — ელფოსტის არხი შეხსენებებიდან **მთლიანად ამოღებულია**
 * („არ გვინდა", 2026-09-11).
 *
 * ⚠️ **მხოლოდ კოდიდან მოხსნა არ იკმარებდა.** უკვე შენახულ შეხსენებას
 * `channels`-ში შეიძლება `"email"` ეწეროს; კოდი მას ჩუმად გამოტოვებდა და
 * თუ ეს **ერთადერთი** არხი იყო, შეხსენება „აქტიური" დარჩებოდა და არსად
 * აღარ მისულიყო. ამიტომ არსებული ნაკრებები აქვე სწორდება და არხის გარეშე
 * დარჩენილი `browser`-ზე გადადის (ნაგულისხმევი, რომელსაც დამოკიდებულება
 * არ სჭირდება).
 *
 * ⚠️ **`note_notifications`-ის ძველი რიგები არ იშლება** — ეს **ჟურნალია**
 * და არა რიგი: „გაიგზავნა ელფოსტით, მაშინ და მაშინ" ისტორიული ფაქტია,
 * რომლის წაშლაც აღრიცხვას გაანადგურებდა (იგივე მიზეზი, რის გამოც
 * `AuditLog::PROTECTED_ACTIONS` არსებობს).
 *
 * ⚠️ **უკან დაბრუნება მონაცემს ვერ აღადგენს** და `down()` ამას ცხადად ამბობს:
 * რომელ შეხსენებას ჰქონდა `email` მონიშნული, აღარსად წერია.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('note_reminders')
            ->select('id', 'channels')
            ->orderBy('id')
            ->chunk(200, function ($rows) {
                foreach ($rows as $row) {
                    $channels = json_decode((string) $row->channels, true);

                    if (! is_array($channels) || ! in_array('email', $channels, true)) {
                        continue;
                    }

                    $clean = array_values(array_filter(
                        $channels,
                        fn ($channel) => $channel !== 'email',
                    ));

                    DB::table('note_reminders')
                        ->where('id', $row->id)
                        // ⚠️ ცარიელი ნაკრები არ რჩება: მხოლოდ-email შეხსენება
                        // სხვაგვარად უხმოდ დარჩებოდა
                        ->update(['channels' => json_encode($clean ?: ['browser'])]);
                }
            });
    }

    public function down(): void
    {
        // ⚠️ განზრახ ცარიელია — ვერავინ იტყვის, რომელ შეხსენებას ჰქონდა
        // ელფოსტა მონიშნული. არხის დაბრუნება კოდის საქმეა და არა მიგრაციის.
    }
};
