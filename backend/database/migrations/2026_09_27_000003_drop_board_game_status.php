<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks §12 — სამაგიდო თამაშის სტატუსი და შეძენის თარიღი ქრება.
 *
 * შენი სიტყვები: „„გავყიდე" ამოიღე — სისულელეა; სტატუსიც საერთოდ ამოიღე,
 * საჭირო არ არის". Q10 — `acquired_at` სტატუსთან ერთად მიდის (თარიღს
 * `TracksCompletion` სტატუსიდან წერდა, ე.ი. სტატუსის გარეშე აზრი აღარ აქვს).
 * ცოცხალ ბაზაში ერთი სამაგიდო თამაში იყო — `owned`, თარიღის გარეშე.
 *
 * ⚠️ **ორივე სვეტის ინდექსები სვეტამდე იშლება** (`acquired_at`-საც ჰქონდა) და სქემიდან იკითხება (§6.4-ის
 * ხაფანგი): sqlite ინდექსიან სვეტს ვერ შლის, ხელით დაწერილი სახელი კი ერთს
 * გამორჩებოდა.
 *
 * ⚠️ **MySQL-ზე `(user_id, status)` შეიძლება `user_id`-ის FK-ის ინდექსი იყოს**
 * — მისი წაშლა „needed in a foreign key constraint"-ით ჩავარდებოდა (მორგებული
 * ველების მიგრაციის ცოცხალი შეცდომა). ამიტომ თუ `user_id`-ით დაწყებული სხვა
 * ინდექსი არ არსებობს, ჯერ ის იქმნება.
 */
return new class extends Migration
{
    private const COLUMNS = ['status', 'acquired_at'];

    public function up(): void
    {
        $columns = array_values(array_filter(self::COLUMNS, fn ($c) => Schema::hasColumn('board_games', $c)));
        if (! $columns) {
            return;
        }

        $touches = fn (array $index) => (bool) array_intersect($columns, $index['columns']);
        $indexes = Schema::getIndexes('board_games');
        $otherUserIndex = array_filter(
            $indexes,
            fn ($i) => ($i['columns'][0] ?? null) === 'user_id' && ! $touches($i),
        );

        if (! $otherUserIndex) {
            Schema::table('board_games', fn (Blueprint $t) => $t->index('user_id'));
        }

        foreach ($indexes as $index) {
            if (! $index['primary'] && $touches($index)) {
                Schema::table('board_games', fn (Blueprint $t) => $t->dropIndex($index['name']));
            }
        }

        foreach ($columns as $column) {
            Schema::table('board_games', fn (Blueprint $t) => $t->dropColumn($column));
        }
    }

    public function down(): void
    {
        Schema::table('board_games', function (Blueprint $t) {
            if (! Schema::hasColumn('board_games', 'status')) {
                $t->string('status', 20)->default('owned');
            }
            if (! Schema::hasColumn('board_games', 'acquired_at')) {
                $t->date('acquired_at')->nullable();
            }
        });
    }
};
