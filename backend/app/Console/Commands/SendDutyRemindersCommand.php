<?php

namespace App\Console\Commands;

use App\Services\Duty\DutyReminder;
use Illuminate\Console\Command;

/**
 * **მორიგეობის შეხსენება წინა დღეს** — scheduler ყოველ წუთს.
 *
 * ⚠️ scheduler-ის გარეშეც არაფერი იკარგება: იმავე სერვისს ღია აპის polling-ი
 * იძახებს (`GET /api/duty/reminders/due`); ტელეგრამი მაშინ მიდის, როცა აპი გახსნილია.
 */
class SendDutyRemindersCommand extends Command
{
    protected $signature = 'duty:remind';

    protected $description = 'შეახსენებს ხვალინდელ მორიგეობებს (ტელეგრამი; ბრაუზერი — polling-ით)';

    public function handle(DutyReminder $reminder): int
    {
        $count = $reminder->run()->count();

        if ($count > 0) {
            $this->info("შეხსენდა {$count} მორიგეობა.");
        }

        return self::SUCCESS;
    }
}
