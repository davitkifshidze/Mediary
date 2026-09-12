<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

/**
 * **საქაღალდეები მოდულების მიხედვით** (user-ის გადაწყვეტილება 2026-09-04).
 *
 * 2026-09-03-ზე ცხრილები სექციებად დაიშალა, საქაღალდეები კი განზრახ არ
 * შევეხეთ. user-მა სწორად შენიშნა, რომ ნახევრად გაკეთებული სტანდარტი
 * სტანდარტი არაა: `posters/` ორი მოდულის (ფილმი + სერიალი) საერთო იყო,
 * `videos/` — თამბნეილისაც და მიმაგრებული ფოტოსიც, `documents/` კი
 * ისე ჟღერდა, თითქოს ყველა მოდულის დოკუმენტი იქ უნდა წასულიყო.
 *
 * ახლა ერთი მოდული = ერთი ფესვი (`App\Support\StorageFolder`):
 *
 *   avatars/     → account/avatars/
 *   posters/     → movies/posters/  |  series/posters/   (ცხრილის მიხედვით)
 *   videos/      → videos/thumbnails/  |  videos/files/images/
 *   documents/   → videos/files/docs/
 *   songs/       → songs/thumbnails/
 *   gallery/     → gallery/images/
 *   actors/      → cast/photos/
 *
 * ⚠️ **რატომ არის ეს უსაფრთხო:**
 *  1. ბაზის სვეტი და დისკი ერთ ციკლში იცვლება — გზა ჯერ ბაზაში იწერება,
 *     მერე ფაილი გადადის, ე.ი. შეწყვეტაზე ცალკეული ფაილია დასაბრუნებელი
 *     და არა მთელი ცხრილი.
 *  2. გადატანა **copy + delete**-ია და არა `move`: ერთსა და იმავე ფაილს
 *     შეიძლება ორი ჩანაწერი უყურებდეს (`posters/<slug>.jpg` ერთნაირი
 *     სახელის ფილმსა და სერიალზე), ე.ი. ჯერ ორივე ასლი კეთდება და
 *     ორიგინალი მხოლოდ ბოლოს იშლება.
 *  3. თუ ფაილი დისკზე აღარაა, მიგრაცია **არ ჩავარდება** — სვეტი მაინც
 *     ახალ გზაზე მიუთითებს (ისედაც გატეხილი ბმული იყო).
 *  4. რაც ძველ საქაღალდეში დარჩა, ბაზაში არავის ეკუთვნის — ე.ი. **ობოლია**
 *     და 17.5-ის სკანერი აჩვენებს (`StorageFolder::LEGACY_ROOTS`).
 */
return new class extends Migration
{
    /** ცხრილი → [სვეტი, ძველი საქაღალდე, ახალი საქაღალდე, დამატებითი პირობა] */
    private function map(): array
    {
        return [
            ['users', 'avatar_path', 'avatars', 'account/avatars', null],
            ['movies', 'poster_path', 'posters', 'movies/posters', null],
            ['series', 'poster_path', 'posters', 'series/posters', null],
            ['videos', 'thumbnail_path', 'videos', 'videos/thumbnails', null],
            ['songs', 'thumbnail_path', 'songs', 'songs/thumbnails', null],
            ['video_files', 'path', 'videos', 'videos/files/images', ['kind', 'image']],
            ['video_files', 'path', 'documents', 'videos/files/docs', ['kind', 'doc']],
            ['gallery_images', 'path', 'gallery', 'gallery/images', null],
            ['cast_members', 'photo_path', 'actors', 'cast/photos', null],
        ];
    }

    public function up(): void
    {
        $this->run(fn (array $row) => [$row[2], $row[3]]);
    }

    /** უკან — იგივე რუკა, შებრუნებული მიმართულებით */
    public function down(): void
    {
        $this->run(fn (array $row) => [$row[3], $row[2]]);
    }

    /**
     * ⚠️ **ორი გავლა და არა ერთი.** ჯერ ყველა ასლი კეთდება და მხოლოდ მერე
     * იშლება ორიგინალები: `posters/<slug>.jpg` ერთი ფიზიკური ფაილია ერთნაირი
     * სახელის ფილმისა და სერიალისთვის — ერთ გავლაში ფილმის შემდეგ წაშლილი
     * ორიგინალი სერიალს ცარიელ გზას დაუტოვებდა.
     *
     * @param  callable(array): array{0: string, 1: string}  $direction  from/to რიგიდან
     */
    private function run(callable $direction): void
    {
        $map = $this->map();

        foreach ($map as $row) {
            [$from, $to] = $direction($row);
            $this->rewrite($row[0], $row[1], $from, $to, $row[4]);
        }

        foreach ($map as $row) {
            [$from, $to] = $direction($row);
            $this->dropMoved($row[0], $row[1], $from.'/', $to, $row[4]);
        }
    }

    /**
     * ერთი სვეტის გადატანა: `<from>/x` → `<to>/x` ბაზაშიც და დისკზეც.
     *
     * @param  array{0: string, 1: string}|null  $where  დამატებითი ფილტრი (`video_files.kind`)
     */
    private function rewrite(string $table, string $column, string $from, string $to, ?array $where): void
    {
        if (! Schema::hasTable($table) || ! Schema::hasColumn($table, $column)) {
            return;
        }

        $prefix = $from.'/';
        $disk = Storage::disk('public');

        // `videos/` → `videos/thumbnails/` ერთი და იმავე ფესვის შიგნითაა, ე.ი.
        // LIKE უკვე გადატანილ რიგსაც იჭერს — ასეთ შემთხვევაში მას გამოვრიცხავთ,
        // თორემ გამეორებულ გაშვებაზე პრეფიქსი მეორედ დაეწებება
        $nested = str_starts_with($to.'/', $prefix);

        DB::table($table)
            ->when($where, fn ($q) => $q->where($where[0], $where[1]))
            ->whereNotNull($column)
            ->where($column, 'like', $prefix.'%')
            ->when($nested, fn ($q) => $q->where($column, 'not like', $to.'/%'))
            ->orderBy('id')
            ->chunkById(500, function ($rows) use ($table, $column, $prefix, $to, $disk) {
                foreach ($rows as $row) {
                    $old = (string) $row->{$column};
                    $new = $to.'/'.substr($old, strlen($prefix));

                    // ⚠️ ჯერ ასლი, მერე ბაზა. შეწყვეტაზე სვეტი ჯერ კიდევ ძველ
                    // (არსებულ) გზას უყურებს და ზედმეტი ასლი უბრალოდ ობოლია —
                    // ხელახალი გაშვება ასწორებს. პირიქით რომ ყოფილიყო,
                    // შეწყვეტა გატეხილ ბმულს დატოვებდა.
                    try {
                        if ($disk->fileExists($old) && ! $disk->fileExists($new)) {
                            $disk->copy($old, $new);
                        }
                    } catch (Throwable) {
                        // გატეხილი/ჩაკეტილი ფაილი მთელ მიგრაციას არ აჩერებს —
                        // სვეტი მაინც ახალ გზაზე გადავა და ფაილი ხელით გადაიტანება
                    }

                    DB::table($table)->where('id', $row->id)->update([$column => $new]);
                }
            });
    }

    /** ძველი ასლის წაშლა, თუ ახალი ადგილზეა */
    private function dropMoved(string $table, string $column, string $prefix, string $to, ?array $where): void
    {
        if (! Schema::hasTable($table) || ! Schema::hasColumn($table, $column)) {
            return;
        }

        $disk = Storage::disk('public');

        DB::table($table)
            ->when($where, fn ($q) => $q->where($where[0], $where[1]))
            ->whereNotNull($column)
            ->where($column, 'like', $to.'/%')
            ->orderBy('id')
            ->chunkById(500, function ($rows) use ($column, $prefix, $to, $disk) {
                foreach ($rows as $row) {
                    $new = (string) $row->{$column};
                    $old = $prefix.substr($new, strlen($to) + 1);

                    try {
                        if ($disk->fileExists($new) && $disk->fileExists($old)) {
                            $disk->delete($old);
                        }
                    } catch (Throwable) {
                        // იგივე: წაშლის ჩავარდნა ობოლ ფაილს ტოვებს და არა შეცდომას
                    }
                }
            });
    }
};
