<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * ეტაპი 8 — **მექანიკების სრული მოხსნა** (`board_games.mechanics`).
 *
 * მექანიკა §14-ში BGG-დან მოსული JSON-სია იყო („Hand Management",
 * „Worker Placement"…). user-ის გადაწყვეტილებით ის მთლიანად იხსნება:
 * ⚠️ „ამიღე" = **წაშალე** და არა დამალე, ე.ი. სვეტიც მიდის და არა მხოლოდ UI.
 *
 * ⚠️ **ეს მონაცემის წაშლაა და არა რეფაქტორინგი** — BGG-დან მოტანილი და
 * ხელით დამატებული მექანიკები ქრება. სწორედ ამიტომაა ცალკე მიგრაცია.
 *
 * ⚠️ **MySQL-ზე იშლება, sqlite-ზე მკვდარი რჩება** (`songs.genre_id`-ის
 * პრეცედენტი): ტესტების ბაზაზე სვეტს აღარაფერი კითხულობს — არც მოდელის
 * `casts`, არც რესურსი, არც ვალიდაცია — ე.ი. მისი არსებობა უვნებელია,
 * ცხრილის გადაწერა კი მთელი სქემის მეორედ ჩაწერას მოითხოვდა.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'mysql') {
            return;
        }

        if (Schema::hasColumn('board_games', 'mechanics')) {
            Schema::table('board_games', function (Blueprint $table) {
                $table->dropColumn('mechanics');
            });
        }
    }

    /**
     * ⚠️ უკან დაბრუნება **სვეტს აღადგენს, შიგთავსს კი ვერა** — წაშლილი
     * მექანიკები აღარსად არის. ეს განზრახ ითქვა ხმამაღლა.
     */
    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'mysql' || Schema::hasColumn('board_games', 'mechanics')) {
            return;
        }

        Schema::table('board_games', function (Blueprint $table) {
            $table->json('mechanics')->nullable()->after('genre_id');
        });
    }
};
