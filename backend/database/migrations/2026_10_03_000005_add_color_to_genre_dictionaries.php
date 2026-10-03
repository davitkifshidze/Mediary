<?php

use App\Models\GameGenre;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ჟანრებს ფერი ეძლევა** (Tasks §24.3) — თამაშის, წიგნის, სიმღერისა და სამაგიდოს
 * ლექსიკონებს ერთი კოდით: `color` სვეტი (`c1…c12` ან `#rrggbb`, `DictionaryColor`).
 *
 * თამაშის ნაგულისხმევ ჟანრებს აქამდე ხატულაც არ ჰქონდათ (`icon` `NULL` → ყველა
 * ერთი `LayoutGrid`-ით ჩანდა); `GameGenre::DEFAULTS` ახლა ხატულასაც და ფერსაც
 * ატარებს და ეს მიგრაცია მათ **ერთჯერადად** აწერს იმ რიგებს, რომლებსაც ჯერ არ
 * აქვთ — მომხმარებლის ხელით არჩეული ხატულა/ფერი ხელუხლებელია.
 *
 * ⚠️ query builder-ით — მანქანის ჩანაწერია და აუდიტში არ უნდა მოხვდეს.
 */
return new class extends Migration
{
    private const TABLES = ['game_genres', 'book_genres', 'song_genres', 'board_game_genres'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->string('color', 20)->nullable()->after('icon');
            });
        }

        foreach (GameGenre::DEFAULTS as $default) {
            if (! empty($default['icon'])) {
                DB::table('game_genres')->where('key', $default['key'])->whereNull('icon')->update(['icon' => $default['icon']]);
            }
            if (! empty($default['color'])) {
                DB::table('game_genres')->where('key', $default['key'])->whereNull('color')->update(['color' => $default['color']]);
            }
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropColumn('color');
            });
        }
    }
};
