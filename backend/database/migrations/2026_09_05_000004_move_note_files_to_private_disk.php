<?php

use App\Support\StorageFolder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * **Tasks §17.5 — პირადი დოკუმენტები პრივატულ დისკზე.**
 *
 * ჩანაწერების მოდული (`note`) პირად დოკუმენტებს ინახავს, ფაილები კი public
 * დისკზე იდო და `/storage/*` ავტორიზაციის გარეშე იხსნება — ე.ი. მისამართის
 * ცოდნა საკმარისი იყო. ეს §16.3-ის (ჩატი) **წინაპირობაა** და არა
 * მოგვიანებითი გაუმჯობესება.
 *
 * ⚠️ **`path` სვეტი არ იცვლება** — იცვლება მხოლოდ დისკი. რომელ დისკზეა
 * გზა, ამას `StorageFolder::diskFor()` წყვეტს (`notes/` → `private`), ე.ი.
 * მიგრაციას ბაზაში წერა საერთოდ არ სჭირდება.
 *
 * ⚠️ **ჯერ ვაკოპირებთ, მერე ვშლით** — იგივე წესი, რაც
 * `2026_09_04_000001_move_uploads_into_module_folders`-ს: შეწყვეტილი გაშვება
 * ტოვებს ზედმეტ ასლს და არა გატეხილ ბმულს. ხელახლა გაშვება უსაფრთხოა.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->move('public', 'private');
    }

    /** უკან — იმავე წესით (ფაილი public-ზე ბრუნდება) */
    public function down(): void
    {
        $this->move('private', 'public');
    }

    private function move(string $from, string $to): void
    {
        $source = Storage::disk($from);
        $target = Storage::disk($to);

        $copied = [];

        foreach (DB::table('note_entry_files')->whereNotNull('path')->pluck('path') as $path) {
            $path = (string) $path;

            // ⚠️ მხოლოდ ის, რაც მართლა პრივატულ ფესვშია — სხვა მოდულის
            // ფაილი (თუ ოდესმე აქ აღმოჩნდა) ხელუხლებელი რჩება
            if (! StorageFolder::isPrivate($path) || ! $source->fileExists($path)) {
                continue;
            }

            if (! $target->fileExists($path)) {
                $stream = $source->readStream($path);
                if (! $stream) {
                    continue;
                }
                $target->writeStream($path, $stream);
                if (is_resource($stream)) {
                    fclose($stream);
                }
            }

            $copied[] = $path;
        }

        // წაშლა **მეორე გავლაზე**: ერთი ფიზიკური ფაილი ორ რიგზეც შეიძლება იყოს
        // მიბმული და პირველივე წაშლა მეორეს გატეხავდა
        foreach ($copied as $path) {
            if ($target->fileExists($path)) {
                $source->delete($path);
            }
        }
    }
};
