<?php

use App\Support\TrashDomain;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ურნა ფაილებზეც (Tasks §29, ეტაპი 1).**
 *
 * შენი სიტყვები: „იქ ყველა წაშლილი ჩავარდეს, ნებისმიერი რამ: ფოტო, ბმული,
 * ფილმი, სერიალი, გალერეიდან თუ საიდანაც იქნება — და 30 დღე აღდგენის
 * შესაძლებლობა იყოს".
 *
 * ორი ნაწილი, რადგან ფაილი ორნაირად ინახება:
 *
 * (1) **რიგიანი ფაილი** — გალერეის ფოტო, ვიდეო-ბმული, მოდულების ფაილები და
 *     ბაზის ასლი. აქ FEAT-11-ის იგივე `trashed_at` ემატება: რიგი ადგილზე
 *     რჩება, `trash` scope მას ყველა სიიდან მალავს, ფაილი და კვოტა კი
 *     ხელუხლებელია. სია `TrashDomain::itemTables()`-იდან მოდის და არა აქ
 *     ჩაწერილი — FEAT-11-ის მიგრაციის იგივე წესი.
 *
 * (2) **`trashed_files`** — ფაილი, რომლის რიგიც წაშლისას ქრება ან საერთოდ
 *     არ არსებობს: ჩატის მიმაგრება (შეტყობინება რჩება, სვეტები ცარიელდება)
 *     და დამატებითი ველის ფაილი (`<module>_field_values`-ის რიგი იშლება).
 *     ⚠️ **თერთმეტ `<module>_field_values`-ს `trashed_at` განზრახ არ
 *     ემატება**: მნიშვნელობებს `DB::table()` კითხულობს ათზე მეტ ადგილას და
 *     global scope იქ არ მოქმედებს — ერთი დავიწყებული `whereNull` წაშლილ
 *     ფაილს ბარათზე დააბრუნებდა. რიგის წაშლა + ფაილის აქ შენახვა კი ყველა
 *     წამკითხველს უცვლელს ტოვებს. §29-ის მე-4 ეტაპი (მთავარი ფოტო, ავატარი)
 *     იმავე ცხრილს იყენებს.
 *
 * ⚠️ `trashed_files.user_id` `cascadeOnDelete`-ია, მაგრამ ეს ფაილს დისკიდან
 * **არ** შლის — ანგარიშის წაშლა ამიტომ `AccountEraser`-ზე გადის, რომელიც
 * `StorageMeter::files()`-ით ამ რიგებსაც პოულობს (BUG-21-ის წესი).
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

        if (! Schema::hasTable('trashed_files')) {
            Schema::create('trashed_files', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                // `chat_file` · `field_file` (ეტაპი 4 — მთავარი ფოტო, ავატარი)
                $table->string('kind', 40);
                // ვის ეკუთვნოდა: მოდულის key (`movie`…) ან `message`
                $table->string('record_type', 40)->nullable();
                $table->unsignedBigInteger('record_id')->nullable();
                // სვეტი ან ველის key — აღდგენა სწორედ აქ აბრუნებს
                $table->string('slot', 100)->nullable();
                $table->string('path', 500);
                $table->string('name')->nullable();
                $table->string('mime', 150)->nullable();
                // ⚠️ **ჩაწერილი ზომა** — საბოლოო წაშლა სწორედ მას ათავისუფლებს (`StoredFile`)
                $table->unsignedBigInteger('size')->default(0);
                $table->json('meta')->nullable();
                /* ⚠️ `nullable()` განზრახ, თუმცა ყოველთვის ივსება: MariaDB 10.4-ზე
                   (`explicit_defaults_for_timestamp = OFF`) ცხრილის პირველ `NOT NULL`
                   TIMESTAMP-ს თავისით ედება `ON UPDATE CURRENT_TIMESTAMP` — ე.ი. ყოველი
                   `UPDATE` ვადას თავიდან დაიწყებდა. */
                $table->timestamp('trashed_at')->nullable()->index();
                $table->timestamps();

                $table->index(['user_id', 'kind']);
                $table->index(['record_type', 'record_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('trashed_files');

        foreach (TrashDomain::itemTables() as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'trashed_at')) {
                continue;
            }

            Schema::table($table, function (Blueprint $blueprint) use ($table) {
                $blueprint->dropIndex("{$table}_user_trashed_index");
                $blueprint->dropIndex("{$table}_trashed_at_index");
                $blueprint->dropColumn('trashed_at');
            });
        }
    }
};
