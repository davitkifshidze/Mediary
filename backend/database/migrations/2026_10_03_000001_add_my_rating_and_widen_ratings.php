<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **„ჩემი ქულა" ვარსკვლავებით და მეათედებით — ყველგან** (Tasks §9, Q1).
 *
 * 1. ფილმს, სერიალსა და ანიმეს **ცალკე სვეტი** `my_rating decimal(3,1)`
 *    ემატება. `rating` TMDB-ის საშუალოდ რჩება — არსებული 449 ქულა
 *    ხელუხლებელია და სინქრონიზაცია მას ისევ ავსებს; „ჩემი ქულა" მასთან
 *    აღარ ერევა.
 * 2. წიგნის, თამაშის, სამაგიდოს, სიმღერისა და ადგილის `rating`
 *    `tinyint` → `decimal(3,1)`: ვარსკვლავის ნახევარი და ხელით ჩაწერილი
 *    4.6 ისე ინახება, როგორც აკრიფე.
 *
 * ⚠️ **ტიპი მხოლოდ MySQL-ზე იცვლება** (პროექტის წესი sqlite-ის ტესტებისთვის):
 * sqlite-ზე integer-აფინური სვეტი 4.6-ს REAL-ად ინახავს, ე.ი. ტესტები
 * ცვლილების გარეშეც იმავე მნიშვნელობას კითხულობენ (`RatingTest`).
 *
 * ⚠️ **`down()` მეათედებს კარგავს** — `tinyint`-ზე დაბრუნებისას 4.6 → 5
 * MySQL-ის დამრგვალებით. უკან დაბრუნება მხოლოდ ასლიდანაა სწორი (Tasks 0.1).
 */
return new class extends Migration
{
    private const MEDIA = ['movies', 'series', 'animes'];

    private const WIDEN = ['books', 'games', 'board_games', 'songs', 'places'];

    public function up(): void
    {
        foreach (self::MEDIA as $table) {
            if (! Schema::hasColumn($table, 'my_rating')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->decimal('my_rating', 3, 1)->nullable()->after('rating');
                });
            }
        }

        if (DB::getDriverName() === 'mysql') {
            foreach (self::WIDEN as $table) {
                Schema::table($table, function (Blueprint $t) {
                    $t->decimal('rating', 3, 1)->nullable()->change();
                });
            }
        }
    }

    public function down(): void
    {
        foreach (self::MEDIA as $table) {
            if (Schema::hasColumn($table, 'my_rating')) {
                Schema::table($table, fn (Blueprint $t) => $t->dropColumn('my_rating'));
            }
        }

        if (DB::getDriverName() === 'mysql') {
            foreach (self::WIDEN as $table) {
                Schema::table($table, function (Blueprint $t) {
                    $t->unsignedTinyInteger('rating')->nullable()->change();
                });
            }
        }
    }
};
