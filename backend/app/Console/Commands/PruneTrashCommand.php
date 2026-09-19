<?php

namespace App\Console\Commands;

use App\Support\TrashDomain;
use Illuminate\Console\Command;

/**
 * **კალათის ვადაგასული ჩანაწერების ნამდვილი წაშლა (FEAT-11).**
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
 * ⚠️ **`--days` არსებობს ტესტისთვის და არა კონფიგურაციისთვის** — ვადა
 * ერთია (`TrashDomain::KEEP_DAYS`) და ის UI-შიც ჩანს; ორი წყარო
 * „30 დღე წერია, 7-ზე იშლება"-ს გამოიწვევდა.
 */
class PruneTrashCommand extends Command
{
    protected $signature = 'trash:prune {--days= : რამდენ დღეზე ძველი იშლება (ნაგულისხმევი — TrashDomain::KEEP_DAYS)}
                            {--dry-run : მხოლოდ დათვლა}';

    protected $description = 'კალათაში ვადაგასული ჩანაწერების საბოლოო წაშლა';

    public function handle(): int
    {
        $days = $this->option('days') !== null ? (int) $this->option('days') : TrashDomain::KEEP_DAYS;
        $dry = (bool) $this->option('dry-run');
        $total = 0;

        foreach (TrashDomain::MODELS as $domain => $model) {
            $query = $model::expiredTrash($days);
            $count = (clone $query)->count();

            if ($count === 0) {
                continue;
            }

            if (! $dry) {
                /* ⚠️ `lazyById` და არა `chunk`: `chunk()` offset-ით დადის და
                   წაშლა რიგებს წაანაცვლებს, ე.ი. ყოველი მეორე გვერდი ჩუმად
                   გამოტოვდებოდა — იგივე ხაფანგი, რაც BUG-23-ის მიგრაციას ჰქონდა. */
                foreach ($query->lazyById() as $record) {
                    $record->delete();
                }
            }

            $this->line("  {$domain}: {$count}");
            $total += $count;
        }

        $this->info($dry ? "ვადაგასულია {$total} ჩანაწერი" : "წაშლილია {$total} ჩანაწერი");

        return self::SUCCESS;
    }
}
