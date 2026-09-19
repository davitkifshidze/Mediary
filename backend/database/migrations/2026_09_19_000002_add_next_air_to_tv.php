<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **FEAT-10 — „მალე": შემდეგი ეპიზოდის ეთერი.**
 *
 * ⚠️ **ეს TMDB-ის `next_episode_to_air`-ია და ჩვეულებრივ სინქრონში ჯდება**,
 * რადგან `tvDetails()`-ის პასუხშივე მოდის — ე.ი. დამატებითი გამოძახება
 * საერთოდ არ სჭირდება.
 *
 * ⚠️ **`tv_episodes.air_date` განზრახ **არ** გამოიყენება მეორე წყაროდ**
 * (FEAT-09): ის მხოლოდ მაშინ არსებობს, როცა მომხმარებელმა ეპიზოდები
 * ცხადად ჩამოიტვირთა. ორ წყაროზე დაყრდნობა იმას ნიშნავდა, რომ კალენდარი
 * სრულიად სხვა ქმედების მიხედვით ჩნდებოდა და ქრებოდა — ზუსტად ის ხაფანგი,
 * რომელსაც `Book::syncProgress()` ებრძვის.
 *
 * ⚠️ **სეზონი/ეპიზოდი ცალკე რიცხვებია და არა „S05E03" სტრიქონი** — ეს
 * უკანასკნელი ნაწარმოები ასლია და ენაზეც დამოკიდებული; წარწერას
 * ინტერფეისი აგებს.
 */
return new class extends Migration
{
    private const TABLES = ['series', 'animes'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->date('next_air_at')->nullable()->after('episodes');
                $t->unsignedSmallInteger('next_season')->nullable()->after('next_air_at');
                $t->unsignedSmallInteger('next_episode')->nullable()->after('next_season');
                // „მომდევნო 30 დღე" ამ სვეტზე იჭრება — ინდექსი სწორედ იმ query-ისთვისაა
                $t->index('next_air_at');
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropIndex([$t->getTable().'_next_air_at_index']);
                $t->dropColumn(['next_air_at', 'next_season', 'next_episode']);
            });
        }
    }
};
