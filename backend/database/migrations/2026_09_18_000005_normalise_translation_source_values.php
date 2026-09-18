<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **`<domain>_translations.source` არასდროს არის `'translated'`** (Tasks BUG-17).
 *
 * ⚠️ **ორი სახელი ერთ ფაქტზე — და ერთი მათგანი არსად არ იკითხებოდა.**
 * `MovieEnricher`/`TvEnricher` მანქანურ თარგმანს `'translated'`-ს უწერდნენ,
 * დანარჩენი აპი კი მხოლოდ `tmdb|translation|manual`-ს იცნობს: `MoviePage`
 * `detail.source.translated`-ს ვერ პოულობდა და **„ტექსტის წყარო უცნობია"**-ს
 * ხატავდა, `TranslationScanner::reviewable()` (`=== 'tmdb'`) კი ასეთ რიგს
 * გადამოწმებაზე არასდროს უშვებდა.
 *
 * ⚠️ **გადაწერა `'translation'`-ზეა და არა `'tmdb'`-ზე.** ის ტექსტი მართლაც
 * მანქანურმა თარგმანმა დაწერა — `'tmdb'` ბარათს ატყუებინებდა და
 * გადამოწმებისთვისაც გამოსადეგად ჩათვლიდა. ახალი ჩანაწერები TMDB-ის
 * ქართული პასუხიდან მოდიან, ე.ი. მათ `'tmdb'` სწორად ეწერებათ.
 *
 * ⚠️ **`ge_movie`-ს არ ვეხებით** — ის სხვა, ჯერ კიდევ ცოცხალი მნიშვნელობაა
 * (ძველი ge.movie-ის იმპორტი), და მისი „გასწორება" ისტორიას წაშლიდა.
 */
return new class extends Migration
{
    /** ბილინგვური დომენების თარგმანის ცხრილები */
    private const TABLES = ['movie_translations', 'series_translations', 'anime_translations'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'source')) {
                DB::table($table)->where('source', 'translated')->update(['source' => 'translation']);
            }
        }
    }

    /**
     * ⚠️ უკან გზა განზრახ არ არსებობს: გადაწერის შემდეგ „ნამდვილი"
     * `translation` და გასწორებული `translated` ერთმანეთისგან აღარ გაირჩევა,
     * ე.ი. დაბრუნება სხვისი რიგებსაც გააფუჭებდა.
     */
    public function down(): void {}
};
