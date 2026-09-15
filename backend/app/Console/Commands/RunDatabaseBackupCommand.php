<?php

namespace App\Console\Commands;

use App\Models\DatabaseBackup;
use App\Services\Backup\BackupRunner;
use Illuminate\Console\Command;

/**
 * **`php artisan backups:run {backup} [--restore]` — Tasks §22.**
 *
 * ⚠️ ბრძანება **ორივე გზაზეა**, `videos:download`-ის ზუსტი პრეცედენტი: მას
 * ადმინის ღილაკი უშვებს ფონურად (`BackgroundProcess`) და ხელითაც შეიძლება
 * გაეშვას. ერთი შესასრულებელი კოდი ორივესთვის.
 *
 * ⚠️ **რატომ ფონურად.** `php artisan serve` ერთნაკადიანია, დამპი კი წუთებს
 * შეიძლება გრძელდებოდეს — სინქრონული გაშვება მთელ აპს გააჩერებდა (იგივე
 * მიზეზი, რის გამოც ვიდეოს ჩამოწერა, სინქრონი და გალერეა რიგებია).
 *
 * ⚠️ CLI-ზე `Auth::id()` ცარიელია — `DatabaseBackup`-ს `owner` სქოუპი
 * განზრახ არ აქვს, ე.ი. id-ით პირდაპირ იძებნება.
 */
class RunDatabaseBackupCommand extends Command
{
    protected $signature = 'backups:run {backup : database_backups.id} {--restore : დამპის ბაზაში ჩატვირთვა}';

    protected $description = 'ბაზის დამპის აღება ან აღდგენა (Tasks §22)';

    public function handle(BackupRunner $runner): int
    {
        $backup = DatabaseBackup::find((int) $this->argument('backup'));

        if (! $backup) {
            $this->error('ასეთი დამპი არ არსებობს.');

            return self::FAILURE;
        }

        if ($this->option('restore')) {
            $this->info("აღდგენა: {$backup->name}");
            $runner->restore($backup);
        } else {
            $this->info("დამპი: {$backup->name}");
            $runner->dump($backup);
        }

        /* ⚠️ აღდგენის შემდეგ მოდელის ხელახლა წაკითხვა **ბაზიდან** ხდება,
           რომელიც ამ წამს შეიცვალა — სტატუსს `BackupRunner`-ის ჩაწერილი
           რიგი პასუხობს და არა მეხსიერებაში დარჩენილი ობიექტი. */
        $fresh = DatabaseBackup::find($backup->id);

        if ($fresh?->status !== DatabaseBackup::STATUS_READY) {
            $this->error($fresh?->error ?? 'ოპერაცია ჩავარდა.');

            return self::FAILURE;
        }

        $this->info('მზადაა.');

        return self::SUCCESS;
    }
}
