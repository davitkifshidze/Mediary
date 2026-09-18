<?php

namespace App\Console\Commands;

use App\Services\Backup\BackupInspector;
use Illuminate\Console\Command;

/**
 * **`php artisan backups:prune-inspect` — მიტოვებული ვიუერები (Tasks GAP-16).**
 *
 * §11.3-ის ვიუერი დამპს დროებით ბაზაში (`<db>_inspect_<id>`) ტვირთავს.
 * დახურვის ღილაკის გარეშე დატოვებული ტაბი მას სამუდამოდ ტოვებდა: მონაცემის
 * სრული მეორე ასლი დისკზე, კვოტის გარეთ, პაროლის ჰეშებით.
 *
 * ⚠️ **ეს მეორე კარიბჭეა და არა ერთადერთი**: იგივე გასუფთავებას `open()`
 * თვითონაც აკეთებს, რადგან ამ პროექტში `schedule:work` ხშირად საერთოდ არ
 * ეშვება (`mediary:doctor` სწორედ ამას აფრთხილებს). სერვერზე, სადაც
 * scheduler მუშაობს, ეს ბრძანება ვიუერს ტაბის ხელახლა გახსნის გარეშეც
 * ხურავს.
 */
class PruneBackupInspectCommand extends Command
{
    protected $signature = 'backups:prune-inspect {--hours= : რამდენ საათზე ძველი ჩაითვალოს მიტოვებულად}';

    protected $description = 'ხურავს ასლის ვიუერის მიტოვებულ დროებით ბაზებს (Tasks GAP-16)';

    public function handle(BackupInspector $inspector): int
    {
        if (! $inspector->available()) {
            $this->line('ვიუერი ამ დრაივერზე არ მუშაობს — არაფერია გასასუფთავებელი.');

            return self::SUCCESS;
        }

        $hours = $this->option('hours');
        $closed = $inspector->pruneStale($hours === null ? null : max(0, (int) $hours));

        if ($closed === []) {
            $this->info('მიტოვებული ვიუერი არ არის.');

            return self::SUCCESS;
        }

        foreach ($closed as $name) {
            $this->line("დაიხურა: {$name}");
        }

        $this->info(count($closed).' ვიუერი დაიხურა.');

        return self::SUCCESS;
    }
}
