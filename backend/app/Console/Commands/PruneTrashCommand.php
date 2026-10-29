<?php

namespace App\Console\Commands;

use App\Models\DatabaseBackup;
use App\Services\Trash\TrashBin;
use Illuminate\Console\Command;

/**
 * **კალათის ვადაგასული ჩანაწერების ნამდვილი წაშლა.**
 *
 * ⚠️ **Laravel-ის `model:prune` განზრახ არ გამოიყენება.** `Prunable`
 * ტრეიტი `SoftDeletes`-ს ელოდება (`forceDelete()`) და მისი `prunable()`
 * **გლობალურ სკოუპებს არ თიშავს** — ე.ი. ჩვენი `trash` scope სწორედ იმ
 * რიგებს დამალავდა, რომელთა წაშლაც მას ევალება: ბრძანება ყოველ ღამე
 * წარმატებით გაეშვებოდა და **ყოველთვის ნულს დაითვლიდა**. ეს ზუსტად ის
 * ჩუმი ჩავარდნაა, რომელიც ამ პროექტში ასლების დაგეგმილ ტასკს ჰქონდა.
 *
 * ⚠️ **წაშლა მოდელით ხდება და არა `delete()`-ით query-ზე** — `PurgeService`-ის
 * იგივე წესი: სწორედ `deleting`/`deleted` მოვლენები ათავისუფლებს ფაილს
 * დისკიდან, კვოტის მრიცხველს, გალერეას და pivot-ებს.
 *
 * ⚠️ **ვადა თითო ანგარიშისაა** (`UserSettings::trashDays()`,
 * `/settings`-ზე 1–`TrashDomain::maxDays()` დღე) და ბრძანება თითოეულს
 * თავისით წმენდს. **`--days` ყველას ერთ ვადას აძალებს** — ტესტისა და
 * ხელით გაშვებისთვის; განრიგი მას არასდროს გადასცემს, თორემ „30 დღე
 * წერია, 7-ზე იშლება" დაბრუნდებოდა.
 *
 * ⚠️ **ყველა სახე — ჩანაწერი, ფაილი, `trashed_files`** — წესები
 * `TrashBin::prune()`-შია, რომ ბრძანება და ურნის გვერდი „რა არის ურნაში"-ზე
 * ერთსა და იმავეს ამბობდნენ.
 */
class PruneTrashCommand extends Command
{
    protected $signature = 'trash:prune {--days= : ყველასთვის ერთი ვადა (ნაგულისხმევად — თითო ანგარიშის საკუთარი)}
                            {--dry-run : მხოლოდ დათვლა}
                            {--force : გაშვება ბოლო 24 საათის წარმატებული ასლის გარეშეც}';

    protected $description = 'ურნაში ვადაგასული ჩანაწერების საბოლოო წაშლა';

    public function handle(): int
    {
        $days = $this->option('days') !== null ? (int) $this->option('days') : null;
        $dry = (bool) $this->option('dry-run');
        $total = 0;

        /* ⚠️ **საბოლოო წაშლა ასლს მიჰყვება და არა საათს.** 03:00 → 03:30 რიგი
           ჩავარდნილ ან დაგვიანებულ ასლს ვერ ხედავდა — წაშლა მაშინაც ხდებოდა,
           როცა უკან დასაბრუნებელი გზა არ არსებობდა. ავტომატური ასლის გამორთვისას
           (`BACKUP_AUTO=false`) პირობა არ მოქმედებს — ასლი მაშინ შენი პასუხისმგებლობაა. */
        if (! $dry && ! $this->option('force') && config('mediary.backup.auto') && ! $this->recentBackup()) {
            $this->warn('ბოლო 24 საათში წარმატებული ასლი არ არის — ურნა არ სუფთავდება (`--force` — მაინც)');

            return self::FAILURE;
        }

        /* ⚠️ `lazyById` და არა `chunk` (`TrashBin::prune()`-ში): `chunk()`
           offset-ით დადის და წაშლა რიგებს წაანაცვლებს, ე.ი. ყოველი მეორე
           გვერდი ჩუმად გამოტოვდებოდა. */
        foreach (TrashBin::prune($days, $dry) as $kind => $count) {
            $this->line("  {$kind}: {$count}");
            $total += $count;
        }

        $this->info($dry ? "ვადაგასულია {$total} ჩანაწერი" : "წაშლილია {$total} ჩანაწერი");

        return self::SUCCESS;
    }

    private function recentBackup(): bool
    {
        return DatabaseBackup::where('status', DatabaseBackup::STATUS_READY)
            ->where('finished_at', '>=', now()->subDay())
            ->exists();
    }
}
