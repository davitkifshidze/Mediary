<?php

use App\Models\GalleryImage;
use App\Models\GalleryVideo;
use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

/**
 * Tasks §11 — სიმღერის „მასალა" (ფოტოები · ჩანიშვნები · დოკუმენტები) და მისი
 * გალერეა ქრება (შენი სიტყვები: „სიმღერას მსგავსი ფუნქციონალი საერთოდ არ
 * სჭირდება"; Q9 — გალერეაც). ცოცხალ ბაზაში ოთხივე ცხრილში 0 რიგი იყო.
 *
 * ⚠️ **ფაილი ჯერ დისკიდან იშლება და კვოტა ბრუნდება, ცხრილი — მერე.** `drop
 * table` რიგს წაიღებდა, ფაილს კი დისკზე დატოვებდა და ზომას
 * `storage_used_bytes`-ში სამუდამოდ დაიკავებდა. `SongFile` მოდელი უკვე
 * წაშლილია, ამიტომ `StoredFile`-ის ორი ნაბიჯი (დისკი + `addFor(-size)`)
 * აქ ხელითაა დაწერილი; გალერეის რიგებს კი ცოცხალი მოდელი შლის, ე.ი. მათი
 * `StoredFile` თავად მუშაობს.
 *
 * ⚠️ **`lazyById` და არა `chunk`** — წაშლა offset-ს ანაცვლებს (BUG-23).
 *
 * ⚠️ morph alias `song` **რჩება** (`AppServiceProvider`) — აუდიტის ლოგი მას
 * ძველ ჩანაწერებზეც კითხულობს.
 *
 * ⚠️ `down()` ცხრილებს ცარიელად არ აბრუნებს: მოდელები და მარშრუტები
 * წაშლილია, ე.ი. ცარიელი ცხრილი მხოლოდ ობოლი იქნებოდა.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('song_files')) {
            $meter = app(StorageMeter::class);

            DB::table('song_files')->orderBy('id')->lazyById()->each(function ($row) use ($meter) {
                try {
                    Storage::disk(StorageFolder::diskFor((string) $row->path))->delete($row->path);
                } catch (Throwable) {
                    // ფაილი უკვე აღარაა — მიგრაცია ამაზე არ უნდა გაჩერდეს
                }

                if ($row->user_id && $row->size) {
                    $meter->addFor((int) $row->user_id, -(int) $row->size);
                }
            });
        }

        // გალერეის რიგები **მოდელით** — `StoredFile` ფაილსაც შლის და კვოტასაც აბრუნებს
        GalleryImage::withoutGlobalScopes()->where('imageable_type', 'song')
            ->lazyById()->each(fn (GalleryImage $image) => $image->delete());
        GalleryVideo::withoutGlobalScopes()->where('videoable_type', 'song')
            ->lazyById()->each(fn (GalleryVideo $video) => $video->delete());

        Schema::dropIfExists('song_notes');
        Schema::dropIfExists('song_files');
    }

    public function down(): void
    {
        // განზრახ ცარიელია — იხ. დოკბლოკი
    }
};
