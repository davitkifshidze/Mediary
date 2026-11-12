<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **გამოსვლის თარიღი და TMDB-ის მდგომარეობა** — ფილმი, სერიალი, ანიმე.
 *
 * აქამდე ინახებოდა მხოლოდ წელი: „ეს ფილმი ჯერ არ გამოსულა" ვერსაიდან იკითხებოდა და
 * გამოუსვლელი სათაური სიაში ჩვეულებრივად იდგა. `release_date` ფილმზე პრემიერაა,
 * სერიალსა და ანიმეზე — პირველი ეთერი; `tmdb_status` — TMDB-ის სიტყვა
 * („Released", „Post Production", „Planned", „Returning Series"…), რომლითაც უთარიღო,
 * ჯერ მხოლოდ გამოცხადებული სათაურიც იცნობა.
 *
 * ⚠️ სვეტები TMDB-ის ფაქტია: ივსება დამატებისას და ყოველ სინქრონიზაციაზე, ფორმაში არ ჩანს.
 * არსებულ ჩანაწერებს ერთხელ ავსებს `php artisan media:release-dates`.
 */
return new class extends Migration
{
    private const TABLES = ['movies', 'series', 'animes'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $t) use ($table) {
                if (! Schema::hasColumn($table, 'release_date')) {
                    $t->date('release_date')->nullable()->index();
                }
                if (! Schema::hasColumn($table, 'tmdb_status')) {
                    $t->string('tmdb_status', 40)->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $t) use ($table) {
                if (Schema::hasColumn($table, 'release_date')) {
                    $t->dropIndex(['release_date']);
                    $t->dropColumn('release_date');
                }
                if (Schema::hasColumn($table, 'tmdb_status')) {
                    $t->dropColumn('tmdb_status');
                }
            });
        }
    }
};
