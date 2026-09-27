<?php

use App\Support\DictionaryTrash;
use App\Support\TrashDomain;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ურნა კლასიფიკატორის რიგზე (Tasks §29, ეტაპი 3)** — სტატუსი, ჟანრი, ტიპი, კატეგორია.
 *
 * `trashed_at` — ეტაპი 1–2-ის იგივე ციკლი (`TrashDomain::itemTables()`) და
 * იგივე დაცვა. ⚠️ **`trash_meta`** — რომელი ჩანაწერები გადაიტანა წაშლამ:
 * აღდგენა მათ დაბრუნებას **შემოგთავაზებს** (`DictionaryTrash`), და მხოლოდ
 * მათ, ვინც მას შემდეგ არ შეცვლილა.
 *
 * ⚠️ **გასაღების უნიკალური ინდექსი არ იცვლება**: ურნაში მყოფი რიგი თავის
 * `key`-ს ინარჩუნებს, ამიტომ `DictionaryKey`-ის „დაკავებულია?" მას უნდა
 * ხედავდეს — თორემ იმავე სახელის ახალი რიგი იმავე გასაღებს მიიღებდა და
 * ინდექსი 500-ს დააბრუნებდა.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (TrashDomain::itemTables() as $table) {
            if (! Schema::hasTable($table) || Schema::hasColumn($table, 'trashed_at')) {
                continue;
            }

            Schema::table($table, function (Blueprint $blueprint) use ($table) {
                $blueprint->timestamp('trashed_at')->nullable()->index();
                $blueprint->index(['user_id', 'trashed_at'], "{$table}_user_trashed_index");
            });
        }

        foreach (array_keys(DictionaryTrash::MAP) as $kind) {
            $table = (new (TrashDomain::ITEMS[$kind]['model']))->getTable();

            if (Schema::hasTable($table) && ! Schema::hasColumn($table, 'trash_meta')) {
                Schema::table($table, fn (Blueprint $blueprint) => $blueprint->json('trash_meta')->nullable());
            }
        }
    }

    public function down(): void
    {
        foreach (array_keys(DictionaryTrash::MAP) as $kind) {
            $table = (new (TrashDomain::ITEMS[$kind]['model']))->getTable();

            if (Schema::hasColumn($table, 'trash_meta')) {
                Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropColumn('trash_meta'));
            }
        }

        // ⚠️ `trashed_at`-ს ეტაპი 1-ის მიგრაციის `down()` შლის — ყველას ერთი ციკლი აქვს
    }
};
