<?php

namespace App\Console\Commands;

use App\Services\Notes\ReminderDispatcher;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

/**
 * ვადამოსული შეხსენებების გაგზავნა (Tasks §13.2/§13.3).
 *
 * Scheduler-ი ამას ყოველ წუთს იძახებს (`routes/console.php`), ე.ი. მუშაობს
 * მაშინაც, როცა ბრაუზერი **სრულად დახურულია** — §13.3-ის სწორედ ის შემთხვევა,
 * რომელსაც Web Notifications ვერ ფარავს. Windows-ზე გაშვება:
 *
 *   php artisan schedule:work        (ან Task Scheduler → `schedule:run` ყოველ წუთს)
 *
 * ⚠️ **scheduler-ის გარეშეც არაფერი იკარგება**: იმავე დისპეტჩერს ბრაუზერის
 * polling-იც იძახებს (`GET /api/note-reminders/due`), უბრალოდ ტელეგრამი და
 * ელფოსტა მაშინ იგზავნება, როცა აპლიკაცია გახსნილია.
 */
class SendNoteRemindersCommand extends Command
{
    protected $signature = 'notes:remind';

    protected $description = 'გაუშვებს ვადამოსულ შეხსენებებს (ბრაუზერი/ტელეგრამი/ელფოსტა)';

    /**
     * **„ბოლოს როდის გაეშვა scheduler" — ერთადერთი ნიშანი** (Tasks FEAT-05).
     *
     * ⚠️ `mediary:doctor`-ს ამის გარკვევა სხვაგვარად არ შეუძლია: Laravel-ს
     * გაშვების ისტორია არ ინახავს, ხოლო „შეხსენება არ მოვიდა" შეიძლება
     * იმიტომაც, რომ ვადამოსული უბრალოდ არ იყო. აქ ჩაწერილი დროშა კი
     * ცალსახად ამბობს, რომ ბრძანება **ნამდვილად გაშვებულა**.
     *
     * ⚠️ ქეშში და არა ცხრილში: ეს დიაგნოსტიკაა და არა მონაცემი; დაკარგვა
     * მხოლოდ „არ ვიცი"-ს ნიშნავს და არა არასწორ პასუხს.
     */
    public const HEARTBEAT = 'scheduler.notes-remind.last-run';

    public function handle(ReminderDispatcher $dispatcher): int
    {
        Cache::put(self::HEARTBEAT, now()->toIso8601String(), now()->addDays(7));

        $fired = $dispatcher->run();

        if ($fired > 0) {
            $this->info("გაისროლა {$fired} შეხსენება.");
        }

        return self::SUCCESS;
    }
}
