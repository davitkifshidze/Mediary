<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **IGDB — თამაშების სათადარიგო წყარო** (`DECISIONS.md` §7, პასუხი 2026-09-06).
 *
 * ⚠️ **ეს RAWG-ის ჩანაცვლება არაა**: `rawg_id`/`rawg_slug` ადგილზე რჩება და
 * ძირითად წყაროდაც RAWG რჩება. ორი სვეტი იმისთვის ემატება, რომ IGDB-დან
 * შევსებულმა ჩანაწერმა **დაიმახსოვროს, საიდან მოვიდა** და ხელახალი lookup-იც
 * იმავე წყაროზე წავიდეს.
 *
 * ⚠️ **`unique(user_id, igdb_id)`** — იგივე წესი, რაც `rawg_id`-ზე: ორ ანგარიშს
 * ერთი და იგივე თამაშის დამატება უნდა შეეძლოს (`imdb_id`-ის პრეცედენტი).
 *
 * ⚠️ **დამთხვევებში (§16.2) მონაწილეობს მხოლოდ `rawg_id`.** `PublicDomain::MATCH`
 * თითო დომენზე **ერთ** იდენტობას იღებს, ე.ი. „ან rawg_id, ან igdb_id" იქ ვერ
 * ჩაიწერება. შედეგი: მხოლოდ IGDB-დან შევსებული თამაში დამთხვევებში არ
 * ჩაითვლება — ეს იმავე დოკუმენტირებული წესია, რაც „ცარიელი იდენტობის სვეტი
 * ჩანაწერს მატჩინგიდან ტოვებს".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->unsignedInteger('igdb_id')->nullable()->after('rawg_slug');
            $table->string('igdb_slug')->nullable()->after('igdb_id');

            $table->unique(['user_id', 'igdb_id']);
        });
    }

    public function down(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'igdb_id']);
            $table->dropColumn(['igdb_id', 'igdb_slug']);
        });
    }
};
