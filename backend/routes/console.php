<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
| Tasks §13.3 — შეხსენებების მიწოდება.
|
| ყოველ წუთს, რომ „ყოველ 10 წუთში" რეჟიმიც ზუსტი იყოს. `withoutOverlapping()`
| საჭიროა იმიტომ, რომ ერთი გაშვება SMTP-ს/ტელეგრამს ელოდება და შემდეგი წუთის
| გაშვება მას ვერ უნდა გადაედოს ზემოდან.
|
| ⚠️ ეს **მხოლოდ დახურული ბრაუზერის შემთხვევაა**: გახსნილ აპლიკაციაში იმავე
| დისპეტჩერს polling იძახებს, ე.ი. cron-ის გარეშეც ბრაუზერის შეტყობინება მუშაობს.
| გასაშვებად: `php artisan schedule:work` (ან Windows Task Scheduler → `schedule:run`).
*/
Schedule::command('notes:remind')->everyMinute()->withoutOverlapping();
