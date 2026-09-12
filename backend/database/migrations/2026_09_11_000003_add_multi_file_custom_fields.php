<?php

use App\Support\CustomFields;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks §7.3 — ერთ მორგებულ `ფაილი` ველზე რამდენიმე ფაილი.**
 *
 * ფაზა 4b-ში ერთეული ერთი იყო და სწორედ ამას იცავდა `unique(record_id,
 * field_key)`. მრავლობითობა **სქემას ეხება და არა მხოლოდ ფორმას** (§7.3-ის
 * პირდაპირი შენიშვნა), ე.ი. ან ეს ინდექსი უნდა მოიხსნას, ან რიგებს
 * გამრიცხველიანებელი სვეტი უნდა დაემატოს.
 *
 * ⚠️ **ავირჩიე მეორე: `sort_order` + `unique(record_id, field_key, sort_order)`.**
 * ინდექსის უბრალოდ მოხსნა ყველა დანარჩენ ტიპსაც გაუხსნიდა გზას დუბლირებულ
 * მნიშვნელობას (ერთ ტექსტურ ველზე ორი პასუხი), რასაც `values()` ჩუმად
 * აიღებდა — ე.ი. ბაზა აღარ დაიცავდა იმას, რასაც აქამდე იცავდა. ახლა
 * არა-`file` ველი მუდამ `sort_order = 0`-ზე ზის, ე.ი. მისთვის ინდექსი
 * **ზუსტად ისეთივე მკაცრია**, როგორიც იყო.
 *
 * ⚠️ **ჯერ ახალი ინდექსი და მერე ძველის წაშლა — შებრუნებული რიგი MySQL-ზე
 * ჩავარდება:** `record_id`-ს უცხო გასაღები აქვს და MySQL მის ინდექსად
 * სწორედ `unique(record_id, field_key)`-ის მარცხენა პრეფიქსს იყენებს
 * („Cannot drop index …: needed in a foreign key constraint"). ახალ ინდექსშიც
 * `record_id` პირველია, ე.ი. მისი შექმნისთანავე უცხო გასაღებს საყრდენი
 * უჩნდება და ძველი თავისუფლდება. sqlite-ს ეს არ ეხება, მაგრამ რიგი ერთია.
 *
 * ⚠️ **ყოველი ნაბიჯი ცალკე მოწმდება** (`hasColumn`/`hasIndex`) და არა ერთი
 * საერთო დროშით: პირველივე გაშვება სწორედ შუაში ჩავარდა (სვეტი დაემატა,
 * ინდექსი — არა), და ერთი საერთო შემოწმება ხელახლა გაშვებაზე მთელ ცხრილს
 * **გამოტოვებდა** — ე.ი. ნახევრად გაკეთებული სამუშაო ჩუმად დარჩებოდა.
 *
 * ⚠️ **`sort_order` აქ მართლა რიგია და არა მხოლოდ გამრიცხველიანება** — ფაილები
 * ბარათზე ატვირთვის თანმიმდევრობით ჩანს.
 *
 * ⚠️ **ნომერი `000003`-ია განზრახ:** `anime_field_values`-ს იმავე დღის
 * `000002_create_anime_module` ქმნის, ე.ი. `000002`-ზე ეს მიგრაცია მას
 * ანბანურად **უსწრებდა** (`add…` < `create…`) და ანიმეს ცხრილი ჩუმად ძველი
 * ორსვეტიანი ინდექსით დარჩებოდა.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (array_keys(CustomFields::TABLES) as $table) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            if (! Schema::hasColumn($table, 'sort_order')) {
                Schema::table($table, function (Blueprint $table) {
                    $table->unsignedSmallInteger('sort_order')->default(0)->after('value_size');
                });
            }

            if (! Schema::hasIndex($table, $this->wide($table))) {
                Schema::table($table, function (Blueprint $table) {
                    $table->unique(['record_id', 'field_key', 'sort_order']);
                });
            }

            if (Schema::hasIndex($table, $this->narrow($table))) {
                Schema::table($table, function (Blueprint $table) {
                    $table->dropUnique(['record_id', 'field_key']);
                });
            }
        }
    }

    public function down(): void
    {
        foreach (array_keys(CustomFields::TABLES) as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'sort_order')) {
                continue;
            }

            // ⚠️ უკან დაბრუნებამდე მრავლობითი რიგები უნდა წავიდეს, თორემ
            // ძველი `unique(record_id, field_key)` ვერ აშენდება
            DB::table($table)->where('sort_order', '>', 0)->delete();

            if (! Schema::hasIndex($table, $this->narrow($table))) {
                Schema::table($table, function (Blueprint $table) {
                    $table->unique(['record_id', 'field_key']);
                });
            }

            Schema::table($table, function (Blueprint $table) {
                $table->dropUnique(['record_id', 'field_key', 'sort_order']);
                $table->dropColumn('sort_order');
            });
        }
    }

    /** Laravel-ის ნაგულისხმევი სახელები — `hasIndex()` სახელს ითხოვს */
    private function narrow(string $table): string
    {
        return "{$table}_record_id_field_key_unique";
    }

    private function wide(string $table): string
    {
        return "{$table}_record_id_field_key_sort_order_unique";
    }
};
