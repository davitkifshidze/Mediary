<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks §16.2 — დამთხვევების ინდექსები.**
 *
 * დამთხვევა ორივე მხარეს ერთსა და იმავე query-ს სვამს: „ამ user-ის **საჯარო**
 * ჩანაწერები ამ დომენში". ე.ი. საჭირო ინდექსი **`(user_id, visibility)`**-ია და
 * არა მარტო `visibility` — მფლობელი ყოველთვის ცნობილია და ის ჭრის ყველაზე მეტს.
 *
 * ⚠️ არსებული `(visibility, status)` (მედია) და `(visibility)` (დანარჩენები)
 * **არ იშლება**: პირველი 16.5-ისაა და სტატუსით ფილტრს ემსახურება, აქ კი
 * პრეფიქსი `user_id` სჭირდება. ორივე პატარაა და თანაარსებობა იაფია.
 *
 * `videos`-ს `visibility`-ზე ინდექსი **საერთოდ არ ჰქონდა** (I5-ში სვეტი
 * ინდექსის გარეშე დაემატა) — აქ სწორდება.
 *
 * ასევე ინდექსდება **დამთხვევის სვეტები** (`PublicDomain::MATCH`): მათზე
 * `whereNotNull` ყოველ გამოთვლაზე გადის.
 */
return new class extends Migration
{
    /** ცხრილი → დამთხვევის სვეტები, რომლებსაც ინდექსი აკლია */
    private const MATCH_COLUMNS = [
        'books' => ['openlibrary_id'],
        'videos' => ['platform', 'external_id'],
        'songs' => ['platform', 'external_id'],
    ];

    private const TABLES = [
        'movies', 'series', 'games', 'books', 'board_games', 'videos', 'songs', 'playlists',
    ];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->index(['user_id', 'visibility']);
            });
        }

        foreach (self::MATCH_COLUMNS as $table => $columns) {
            Schema::table($table, function (Blueprint $t) use ($columns) {
                // ერთი კომპოზიტური ინდექსი — video/song-ის გასაღები წყვილია
                $t->index($columns);
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropIndex(['user_id', 'visibility']);
            });
        }

        foreach (self::MATCH_COLUMNS as $table => $columns) {
            Schema::table($table, function (Blueprint $t) use ($columns) {
                $t->dropIndex($columns);
            });
        }
    }
};
