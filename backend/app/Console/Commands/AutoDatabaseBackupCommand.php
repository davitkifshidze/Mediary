<?php

namespace App\Console\Commands;

use App\Models\DatabaseBackup;
use App\Models\User;
use App\Services\Backup\BackupRunner;
use App\Services\Backup\DatabaseDumper;
use Illuminate\Console\Command;

/**
 * **დაგეგმილი ბაზის ასლი (FEAT-12).**
 *
 * ⚠️ **ფონურ პროცესს არ იშვებს და ეს განზრახია.** `POST /admin/backups`
 * `BackgroundProcess`-ით გადის, რადგან `artisan serve` ერთძაფიანია და
 * წუთიანი დამპი მთელ სერვერს გააჩერებდა. აქ კი უკვე კონსოლში ვართ —
 * ე.ი. პროცესის გაშვება მხოლოდ ერთი ზედმეტი ჩავარდნის წერტილი იქნებოდა
 * (`ProcessEnv`-ის გაკვეთილი), ისე რომ არავის არაფერს აჩქარებს.
 *
 * ⚠️ **მფლობელი პირველი სუპერ-ადმინია.** ასლს ვიღაცის კვოტა უნდა
 * გადაიხადოს (§22-ის წესი — „ის საცავზე აისახება"), ხოლო `/backups`
 * ისედაც `super_admin`-ია, ე.ი. სხვა მფლობელი ფაილს იმ ადამიანისთვის
 * უხილავს გახდიდა, ვისაც მასზე პასუხისმგებლობა აქვს.
 *
 * ⚠️ **ჩავარდნა ხმამაღალია (exit 1) და არა ჩუმი `return`.** სწორედ ჩუმი
 * ჩავარდნაა ამ ფუნქციის ისტორია: გარე ტასკი ექვსიდან ოთხ დღეს არ
 * ეშვებოდა და ამას ვერავინ ამჩნევდა.
 */
class AutoDatabaseBackupCommand extends Command
{
    protected $signature = 'backups:auto {--keep= : რამდენი ბოლო დაგეგმილი ასლი დარჩეს}
                            {--force : გაეშვას მაშინაც, როცა `BACKUP_AUTO=false`}';

    protected $description = 'დაგეგმილი ბაზის ასლი და ძველების გასუფთავება (FEAT-12)';

    public function handle(BackupRunner $runner, DatabaseDumper $dumper): int
    {
        if (! config('mediary.backup.auto') && ! $this->option('force')) {
            $this->line('გამორთულია (`BACKUP_AUTO=false`) — გამოტოვებულია.');

            return self::SUCCESS;
        }

        if (! $dumper->available()) {
            $this->error('mysqldump ვერ მოიძებნა — იხ. `MYSQLDUMP_BINARY`.');

            return self::FAILURE;
        }

        $owner = $this->owner();

        if (! $owner) {
            $this->error('სუპერ-ადმინი არ არსებობს — ასლს მფლობელი სჭირდება.');

            return self::FAILURE;
        }

        $backup = DatabaseBackup::create([
            'user_id' => $owner->id,
            // ⚠️ შეკუმშული: 4 მბ SQL ~600 კბ-ია, ე.ი. კვოტასაც ზოგავს
            'name' => 'mediary-auto-'.now()->format('Y-m-d-Hi').'.sql.gz',
            'status' => DatabaseBackup::STATUS_RUNNING,
            'driver' => $dumper->driver(),
            'source' => DatabaseBackup::SOURCE_SCHEDULE,
            'started_at' => now(),
        ]);

        $runner->dump($backup);
        $backup->refresh();

        if ($backup->status !== DatabaseBackup::STATUS_READY) {
            $this->error("ასლი ჩავარდა: {$backup->error}");

            return self::FAILURE;
        }

        $this->info("ასლი მზადაა: {$backup->name} ({$backup->size} ბაიტი)");
        $this->prune($owner);

        return self::SUCCESS;
    }

    /**
     * ⚠️ **მხოლოდ `schedule` წყაროს რიგები იჭრება.** ხელით აღებული ასლი
     * და ატვირთული ფაილი ადამიანის გადაწყვეტილებაა; ავტომატური წმენდა
     * მათზე ზუსტად ის იქნებოდა, რისგანაც კალათა (FEAT-11) იცავს.
     *
     * ⚠️ **წაშლა მოდელით ხდება** — `StoredFile`-ის `deleted` hook შლის
     * ფაილს დისკიდან და კვოტასაც ათავისუფლებს; query-ზე `delete()`
     * ფაილს დისკზე დატოვებდა ობლად.
     */
    private function prune(User $owner): void
    {
        $keep = $this->option('keep') !== null
            ? (int) $this->option('keep')
            : (int) config('mediary.backup.keep');

        if ($keep <= 0) {
            return;
        }

        $old = DatabaseBackup::withoutGlobalScope('owner')
            ->where('user_id', $owner->id)
            ->where('source', DatabaseBackup::SOURCE_SCHEDULE)
            ->orderByDesc('id')
            ->skip($keep)
            ->take(PHP_INT_MAX)
            ->get();

        foreach ($old as $backup) {
            $backup->delete();
        }

        if ($old->isNotEmpty()) {
            $this->line('წაიშალა '.$old->count().' ძველი დაგეგმილი ასლი.');
        }
    }

    /**
     * ⚠️ **`is_super_admin` სვეტი არ არსებობს** — ის `UserResource`-ის
     * ველია, მოდელს კი `isSuperAdmin()` აქვს (იხ. §21.9-ის გაკვეთილი:
     * ატრიბუტად დაწერილი ის `null`-ია და შემოწმება ჩუმად ცრუვდება).
     */
    private function owner(): ?User
    {
        return User::with('role')->orderBy('id')->get()->first(fn (User $u) => $u->isSuperAdmin());
    }
}
