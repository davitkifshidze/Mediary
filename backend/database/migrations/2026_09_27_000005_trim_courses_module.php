<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks §14 — კურსიდან ლექტორი, შეფასება, გაკვეთილები და ხანგრძლივობა ქრება.
 *
 * შენი სიტყვები: „კურსებიდან ამოიღე ლექტორი, ჩემი შეფასება, გაკვეთილი,
 * ხანგრძლივობა." ცოცხალში კურსი 0-ია — არაფერი იკარგება.
 *
 * ⚠️ გაკვეთილებთან ერთად პროგრესიც ქრება (`PATCH /courses/{id}/progress`,
 * სტატუსის ავტომატური გადასვლა) — სტატუსი ამიერიდან მხოლოდ ხელით იცვლება,
 * `finished_at`/`started_at`-ს კი `Course::syncStatusDates()` ადგენს.
 *
 * ⚠️ `down()` სვეტებს ცარიელად აბრუნებს.
 */
return new class extends Migration
{
    private const COLUMNS = ['instructor', 'rating', 'lessons_done', 'lessons_total', 'minutes'];

    public function up(): void
    {
        $columns = array_values(array_filter(self::COLUMNS, fn ($c) => Schema::hasColumn('courses', $c)));

        // ⚠️ ინდექსი ჯერ ცალკე იშლება — sqlite ინდექსიან სვეტს ვერ წაშლის
        foreach (Schema::getIndexes('courses') as $index) {
            if (! $index['primary'] && array_intersect($columns, $index['columns'])) {
                Schema::table('courses', fn (Blueprint $t) => $t->dropIndex($index['name']));
            }
        }
        foreach ($columns as $column) {
            Schema::table('courses', fn (Blueprint $t) => $t->dropColumn($column));
        }
    }

    public function down(): void
    {
        Schema::table('courses', function (Blueprint $t) {
            if (! Schema::hasColumn('courses', 'instructor')) {
                $t->string('instructor')->nullable();
            }
            if (! Schema::hasColumn('courses', 'lessons_total')) {
                $t->unsignedSmallInteger('lessons_total')->nullable();
            }
            if (! Schema::hasColumn('courses', 'lessons_done')) {
                $t->unsignedSmallInteger('lessons_done')->default(0);
            }
            if (! Schema::hasColumn('courses', 'minutes')) {
                $t->unsignedInteger('minutes')->nullable();
            }
            if (! Schema::hasColumn('courses', 'rating')) {
                $t->decimal('rating', 3, 1)->nullable();
            }
        });
    }
};
