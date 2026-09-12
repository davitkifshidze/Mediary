<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * თამაშის საათები → წუთები (Tasks §2.5).
 *
 * `hltb_*` ერთადერთი ხანგრძლივობა იყო, რომელიც `DurationInput`-ზე ვერ
 * გადავიდა: სვეტი `decimal(5,1)` **საათებია**, ე.ი. „2 სთ 20 წთ" → 2.3 სთ →
 * უკან „2 სთ 18 წთ" — ჩუმი დამრგვალება. სვეტი ახლა **წუთებია**, როგორც
 * `movies.runtime` და `board_games.playtime_*`.
 *
 * ⚠️ **მონაცემი PHP-ში გადადის და არა `UPDATE … * 60`-ით.** ძველი სვეტი
 * `decimal(5,1)`-ია (ჭერი 9999.9): 200 საათი წუთებში 12000-ია და იმავე
 * სვეტში ჩაწერისას **ჩუმად მოიჭრებოდა**. ამიტომ რიგი ჯერ იკითხება, მერე
 * სვეტი იცვლება და მხოლოდ მერე იწერება უკან.
 *
 * ⚠️ **`->change()` მხოლოდ MySQL-ზე გადის** — sqlite-ის (ტესტების) სვეტი
 * დინამიური ტიპისაა და მთელ რიცხვს ისედაც იღებს (იგივე წესი, რაც
 * `songs.genre_id`-ის წაშლას აქვს).
 */
return new class extends Migration
{
    private const COLUMNS = ['hltb_main', 'hltb_main_extra', 'hltb_complete'];

    public function up(): void
    {
        $rows = DB::table('games')->select(array_merge(['id'], self::COLUMNS))->get();

        if (DB::getDriverName() === 'mysql') {
            Schema::table('games', function (Blueprint $table) {
                foreach (self::COLUMNS as $column) {
                    // წუთები: 2000 სთ = 120 000 წთ, ე.ი. unsigned int საკმარისია
                    $table->unsignedInteger($column)->nullable()->change();
                }
            });
        }

        $this->rewrite($rows, fn (float $value) => (int) round($value * 60));
    }

    public function down(): void
    {
        $rows = DB::table('games')->select(array_merge(['id'], self::COLUMNS))->get();

        if (DB::getDriverName() === 'mysql') {
            Schema::table('games', function (Blueprint $table) {
                foreach (self::COLUMNS as $column) {
                    $table->decimal($column, 5, 1)->nullable()->change();
                }
            });
        }

        $this->rewrite($rows, fn (float $value) => round($value / 60, 1));
    }

    /** @param  Collection<int, object>  $rows */
    private function rewrite($rows, callable $convert): void
    {
        foreach ($rows as $row) {
            $values = [];

            foreach (self::COLUMNS as $column) {
                if ($row->$column !== null) {
                    $values[$column] = $convert((float) $row->$column);
                }
            }

            if ($values !== []) {
                DB::table('games')->where('id', $row->id)->update($values);
            }
        }
    }
};
