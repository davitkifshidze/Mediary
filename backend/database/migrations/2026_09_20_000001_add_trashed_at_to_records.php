<?php

use App\Support\TrashDomain;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **კალათა ჩანაწერებზე (FEAT-11).**
 *
 * ⚠️ **სვეტი `trashed_at` ჰქვია და არა `deleted_at`.** ეს უკანასკნელი
 * Laravel-ის `SoftDeletes`-ის **კონტრაქტია**: თუ ოდესმე ვინმე ამ მოდელს
 * ტრეიტს დაამატებს, ყველა query ჩუმად გაიფილტრება — მათ შორის იქ, სადაც
 * კალათაში მყოფი ჩანაწერი ნამდვილად უნდა ჩანდეს (თვითონ კალათის გვერდი,
 * `/purge`, ანგარიშის წაშლა). იგივე წესი ჩატმა უკვე გაატარა
 * `messages.removed_at`-ით.
 *
 * ⚠️ **ინდექსი `(user_id, trashed_at)`-ზეა და არა მარტო `trashed_at`-ზე.**
 * ყოველი სია ისედაც `user_id`-ით იჭრება (`BelongsToUser`), ე.ი. სწორედ
 * ეს წყვილი იკითხება ყოველ მოთხოვნაზე; მარტო `trashed_at` თითქმის
 * მთლიანად `NULL`-ია და ინდექსად უსარგებლოა.
 *
 * ⚠️ **სია `TrashDomain`-იდან მოდის და არა აქ ჩაწერილი.** ორი სია ერთი
 * ფაქტისა პირველივე ახალ მოდულზე დაშორდებოდა — ზუსტად ის ხაფანგი,
 * რომელიც `MediaDomain`-მა თოთხმეტ ადგილას გამეორებულ `['movie','series']`-ს
 * მოუღო ბოლო.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (TrashDomain::tables() as $table) {
            if (! Schema::hasTable($table) || Schema::hasColumn($table, 'trashed_at')) {
                continue;
            }

            Schema::table($table, function (Blueprint $blueprint) use ($table) {
                $blueprint->timestamp('trashed_at')->nullable()->index();
                $blueprint->index(['user_id', 'trashed_at'], "{$table}_user_trashed_index");
            });
        }
    }

    public function down(): void
    {
        foreach (TrashDomain::tables() as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'trashed_at')) {
                continue;
            }

            Schema::table($table, function (Blueprint $blueprint) use ($table) {
                $blueprint->dropIndex("{$table}_user_trashed_index");
                $blueprint->dropColumn('trashed_at');
            });
        }
    }
};
