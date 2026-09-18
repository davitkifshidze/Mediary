<?php

namespace App\Services\Backup;

use App\Models\DatabaseBackup;
use App\Services\Storage\StorageMeter;
use App\Support\Redact;
use App\Support\StorageFolder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * **დამპის აღება და აღდგენა — ერთადერთი ადგილი, სადაც ეს ხდება** (Tasks §22).
 *
 * კონტროლერიც და artisan-ის ბრძანებაც აქ შემოდიან, ე.ი. „ავიღე" და
 * „აღვადგინე" ერთნაირად სრულდება მიუხედავად იმისა, ვინ დაიწყო.
 */
class BackupRunner
{
    public function __construct(
        private DatabaseDumper $dumper,
        private StorageMeter $meter,
    ) {}

    /**
     * დამპის აღება არსებულ (`running`) ჩანაწერზე.
     *
     * ⚠️ **ჯერ დროებით ფაილში, მერე დისკზე.** `StorageMeter::storeLocalFile()`
     * ნაკადით კითხულობს და კვოტას ცხადად ითხოვს — ე.ი. დამპი ზუსტად ისევე
     * ითვლება, როგორც ჩამოწერილი ვიდეო, და ზედმეტი ბაიტი კვოტაში ჩუმად ვერ
     * მოხვდება. ⚠️ დროებით ფაილს **ყოველთვის** ვშლით (`finally`), თორემ
     * ჩავარდნილი გაშვება სისტემურ `temp`-ში გიგაბაიტებს დატოვებდა.
     */
    public function dump(DatabaseBackup $backup): void
    {
        $temp = tempnam(sys_get_temp_dir(), 'mediary-dump-');

        /* ⚠️ **შეკუმშვა სახელიდან იკითხება და არა ცალკე სვეტიდან.** ორი
           წყარო ერთი ფაქტისთვის იმ დღეს აცდებოდა, როცა რომელიმე მათგანი
           ხელით შეიცვლებოდა — ხოლო `.gz`-ის სახელწოდება ისედაც სავალდებულოა,
           რომ ჩამოტვირთული ფაილი ბრაუზერმა სწორად შეინახოს. */
        $compress = str_ends_with((string) $backup->name, '.gz');

        try {
            $result = $this->dumper->dump($temp, $compress);

            /* ⚠️ **`clearstatcache` აუცილებელია.** ფაილი `tempnam()`-მა ნულოვანი
               შექმნა და შიგთავსი მერე ჩაიწერა — PHP-ის stat-ქეში კი ძველ,
               ნულოვან ზომას აბრუნებს. ეს ჩუმად ნიშნავდა, რომ დამპი კვოტაში
               0 ბაიტად ჩაიწერებოდა და ლიმიტი აზრს დაკარგავდა. */
            clearstatcache(true, $temp);
            $size = (int) filesize($temp);

            $path = $this->meter->storeLocalFile(
                $backup->user,
                $temp,
                StorageFolder::BACKUPS,
                $backup->name ?: 'backup.sql',
            );

            $backup->forceFill([
                'path' => $path,
                'size' => $size,
                'tables' => $result['tables'],
                // §11.1 — „რა არის შიგნით" აღდგენას აღარ მოითხოვს
                'table_map' => $result['table_map'] ?? null,
                'driver' => $this->dumper->driver(),
                'status' => DatabaseBackup::STATUS_READY,
                'error' => null,
                'finished_at' => now(),
            ])->save();
        } catch (Throwable $e) {
            $backup->forceFill([
                'status' => DatabaseBackup::STATUS_FAILED,
                'error' => mb_substr(Redact::secrets($e->getMessage()), 0, 480),
                'finished_at' => now(),
            ])->save();
        } finally {
            if (is_file($temp)) {
                @unlink($temp);
            }
        }
    }

    /**
     * **უსაფრთხოების ასლი დესტრუქციულ ნაბიჯამდე (§22 → §11.6).**
     *
     * ⚠️ **ჩავარდნაზე `null` და არა გამონაკლისი**: გამომძახებელმა ეს
     * *გადაწყვეტილებად* უნდა წაიკითხოს — შეუქცევადი ოპერაცია იმ ასლის
     * გარეშე, რომელიც მას შექცევადს ხდის, საერთოდ არ უნდა დაიწყოს.
     *
     * ⚠️ **საჯარო გახდა §11.4-ისთვის**: ერთი ცხრილის აღდგენა იმავე დაცვას
     * საჭიროებს, რასაც სრული — და მისი მეორედ დაწერა ერთ დღეს გაშორდებოდა.
     */
    public function safetyDump(DatabaseBackup $for, string $note): ?DatabaseBackup
    {
        $safety = DatabaseBackup::create([
            'user_id' => $for->user_id,
            'name' => 'mediary-before-restore-'.now()->format('Y-m-d-Hi').'.sql',
            'status' => DatabaseBackup::STATUS_RUNNING,
            'driver' => $this->dumper->driver(),
            'source' => DatabaseBackup::SOURCE_DUMP,
            'note' => $note,
            'started_at' => now(),
        ]);

        $this->dump($safety);

        return $safety->fresh()?->status === DatabaseBackup::STATUS_READY ? $safety->fresh() : null;
    }

    /**
     * აღდგენა.
     *
     * ⚠️ **აღდგენა ბაზას ცვლის, მათ შორის `database_backups`-საც.** ეს
     * ერთი შეხედვით უწყინარი დეტალი მთელ ფუნქციას აზრს აცლიდა: ჩატვირთული
     * დამპი თავისსავე (ძველ) `database_backups`-ს მოიტანს, ე.ი. სწორედ ის
     * რიგი, რომელიც „მიმდინარეობს"-ს წერდა, აღდგენის მომენტში გაქრებოდა —
     * და პასუხი „აღდგა თუ ჩავარდა" აღარსად იქნებოდა. ამიტომ ორივე რიგი
     * (უსაფრთხოებისაც და აღსადგენისაც) აღდგენის **შემდეგ** უკან იწერება.
     *
     * ⚠️ **ფაილები დისკზე ბაზას არ მიჰყვება.** აღდგენილი ბაზა შეიძლება
     * ისეთ ატვირთვებს ასახელებდეს, რომლებიც ამ კომპიუტერზე არ დევს (და
     * პირიქით). ამიტომ `users.storage_used_bytes` აღდგენის შემდეგ
     * `mediary:storage-recalc`-ს საჭიროებს — ეს პასუხშიც წერია.
     */
    public function restore(DatabaseBackup $backup): void
    {
        $disk = Storage::disk(StorageFolder::diskFor((string) $backup->path));

        if (! $backup->path || ! $disk->exists($backup->path)) {
            $backup->forceFill([
                'status' => DatabaseBackup::STATUS_FAILED,
                'error' => 'backup_file_missing',
                'finished_at' => now(),
            ])->save();

            return;
        }

        /* ⚠️ **უსაფრთხოების დამპი აღდგენამდე.** ერთი შეცდომით არჩეული
           ფაილი მთელ ბიბლიოთეკას შლის; ავტომატური ასლი ერთადერთი გზაა
           უკან. თუ ისიც ჩავარდა, აღდგენა **საერთოდ არ იწყება** — თორემ
           დესტრუქციული ოპერაცია უკანდაუბრუნებლად გაიშვებოდა. */
        $safety = $this->safetyDump($backup, 'auto: before restore #'.$backup->id);

        if (! $safety) {
            $backup->forceFill([
                'status' => DatabaseBackup::STATUS_FAILED,
                'error' => 'safety_backup_failed',
                'finished_at' => now(),
            ])->save();

            return;
        }

        $absolute = $disk->path($backup->path);
        $safetyRow = $safety->fresh()->getAttributes();
        $target = $backup->getAttributes();

        try {
            $this->dumper->restore($absolute);
            $status = DatabaseBackup::STATUS_READY;
            $error = null;
        } catch (Throwable $e) {
            $status = DatabaseBackup::STATUS_FAILED;
            $error = mb_substr(Redact::secrets($e->getMessage()), 0, 480);
        }

        /* აღდგენის შემდეგ ცხრილი უკვე **დამპისაა** — ორივე რიგს ხელახლა
           ვწერთ, თორემ ეს-ესაა აღებული უსაფრთხოების ასლი ბაზაში აღარ
           იარსებებდა (ფაილი დისკზე იქნებოდა, მისამართი კი — არსად). */
        $this->reinsert($safetyRow);
        $this->reinsert([
            ...$target,
            'status' => $status,
            'error' => $error,
            'note' => 'restored '.now()->toDateTimeString(),
            'finished_at' => now(),
        ]);
    }

    /**
     * რიგის უკან ჩაწერა აღდგენილ ბაზაში.
     *
     * ⚠️ **Eloquent-ით არა.** მოდელის `save()` `AuditObserver`-ს გააღვიძებდა
     * და აღდგენის შემდეგ ლოგში ორი ყალბი „შეიქმნა" გაჩნდებოდა; გარდა ამისა
     * `id` ცხადად უნდა შენარჩუნდეს, თორემ ფაილი დისკზე იმ ნომრით დარჩებოდა,
     * რომელიც ცხრილში აღარ არსებობს.
     *
     * @param  array<string, mixed>  $row
     */
    private function reinsert(array $row): void
    {
        try {
            DB::table('database_backups')->updateOrInsert(['id' => $row['id']], $row);
        } catch (Throwable) {
            // აღდგენილ ბაზაში ცხრილი შეიძლება საერთოდ არ იყოს (ძველი დამპი) —
            // ეს აღდგენის ჩავარდნა არაა და პროცესს არ უნდა შეაჩეროს
        }
    }
}
