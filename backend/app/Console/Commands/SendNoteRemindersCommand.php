<?php

namespace App\Console\Commands;

use App\Services\Notes\ReminderDispatcher;
use Illuminate\Console\Command;

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

    public function handle(ReminderDispatcher $dispatcher): int
    {
        $fired = $dispatcher->run();

        if ($fired > 0) {
            $this->info("გაისროლა {$fired} შეხსენება.");
        }

        return self::SUCCESS;
    }
}
