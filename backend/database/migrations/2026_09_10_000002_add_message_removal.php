<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ჩატის წერილის წაშლა (Tasks §4.6)** — „მხოლოდ შენთან თუ ორივესთან?".
 *
 * ⚠️ **რიგი ბაზაში რჩება** (§4.6-ის პირდაპირი მოთხოვნა): წაშლა მხოლოდ
 * ნიშანია, რომ საჭიროებისას ამოღება შეიძლებოდეს. ინახება **ვინ ვის
 * მისწერა, რა მისწერა, როდის, როდის წაშალა და რა მეთოდით** — პირველი სამი
 * უკვე `messages`-შია, დანარჩენი ორი ეს სვეტებია.
 *
 * ⚠️ **სვეტი `deleted_at` **განზრახ არ ჰქვია**.** ეს სახელი Laravel-ის
 * `SoftDeletes`-ის ხელშეკრულებაა: თუ ვინმე ხვალ ტრეიტს დაამატებს, ყველა
 * query ჩუმად გაიფილტრება — მათ შორის „მხოლოდ ჩემთან წაშლილი", რომელიც
 * მეორე მხარეს **უნდა** უჩანდეს. `removed_*` ორაზროვნებას ხსნის.
 *
 * `removed_scope`: `self` = მხოლოდ წამშლელს არ უჩანს · `both` = ორივეს.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->timestamp('removed_at')->nullable()->after('attachment_size');
            $table->foreignId('removed_by')->nullable()->after('removed_at')
                ->constrained('users')->nullOnDelete();
            $table->string('removed_scope', 8)->nullable()->after('removed_by');

            // ძაფის კითხვა ყოველთვის საუბრის ჭრილშია
            $table->index(['conversation_id', 'removed_at']);
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropIndex(['conversation_id', 'removed_at']);
            $table->dropConstrainedForeignId('removed_by');
            $table->dropColumn(['removed_at', 'removed_scope']);
        });
    }
};
