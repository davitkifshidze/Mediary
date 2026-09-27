<?php

use App\Support\TrashDomain;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ურნა ჩანაწერის ნაწილებზე (Tasks §29, ეტაპი 2).**
 *
 * ჩანიშვნები და ციტატები, თამაშის ვიდეოები, ფლეილისტები, შეხსენებები,
 * ყურების ჟურნალის ჩანაწერი და ალბომი — თითოეულს თავისი `trashed_at`
 * (`TrashDomain::itemTables()`, ეტაპი 1-ის იგივე ციკლი და იგივე დაცვა:
 * უკვე არსებული სვეტი გამოტოვდება, ე.ი. სუფთა ბაზაზე ეტაპი 1-ის მიგრაცია
 * თვითონაც ყველას დაამატებს და ეს — არაფერს).
 *
 * ⚠️ **`gallery_albums.trashed_photo_ids`** — ალბომის წაშლა მის ფოტოებს
 * ალბომის გარეშე ტოვებს (დღევანდელი წესი), აღდგენა კი მათ უკან აბრუნებს —
 * ამისთვის id-ები ურნის ჩანაწერს უნდა ახლდეს.
 *
 * ⚠️ **`trash_entries`** — ურნის ელემენტი, რომელსაც საკუთარი რიგი არ აქვს
 * და ფაილიც არ არის: ჩანაწერიდან მოხსნილი მსახიობის ბმული (`castables`-ს
 * `id` არ აქვს — გასაღები სამსვეტიანია) და, მე-7 ეტაპზე, აუდიტის ლოგის
 * გასუფთავება ერთ ელემენტად. `trashed_files` აქ არ გამოდგებოდა: მისი
 * `path` სავალდებულოა და საბოლოო წაშლა ფაილს შლის (`StoredFile`).
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

        if (Schema::hasTable('gallery_albums') && ! Schema::hasColumn('gallery_albums', 'trashed_photo_ids')) {
            Schema::table('gallery_albums', function (Blueprint $table) {
                $table->json('trashed_photo_ids')->nullable();
            });
        }

        if (! Schema::hasTable('trash_entries')) {
            Schema::create('trash_entries', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                // `cast_link` (ეტაპი 7-ზე — `audit_log`)
                $table->string('kind', 40);
                $table->string('record_type', 40)->nullable();
                $table->unsignedBigInteger('record_id')->nullable();
                // ელემენტის იდენტობა ჩანაწერის შიგნით — მსახიობის id
                $table->string('slot', 100)->nullable();
                $table->string('label')->nullable();
                $table->json('payload')->nullable();
                /* ⚠️ `nullable()` — `trashed_files`-ის იგივე მიზეზით: MariaDB 10.4-ზე
                   პირველ `NOT NULL` TIMESTAMP-ს `ON UPDATE CURRENT_TIMESTAMP` ედება. */
                $table->timestamp('trashed_at')->nullable()->index();
                $table->timestamps();

                $table->index(['user_id', 'kind']);
                $table->index(['record_type', 'record_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('trash_entries');

        if (Schema::hasColumn('gallery_albums', 'trashed_photo_ids')) {
            Schema::table('gallery_albums', fn (Blueprint $table) => $table->dropColumn('trashed_photo_ids'));
        }

        // ⚠️ `trashed_at`-ს ეტაპი 1-ის მიგრაციის `down()` შლის — ორივეს ერთი ციკლი აქვს
    }
};
