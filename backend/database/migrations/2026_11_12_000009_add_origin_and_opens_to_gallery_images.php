<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ფოტოზე: რომელი სათაურის კადრია და რამდენჯერ გაიხსნა.**
 *
 *  · `origin_type` / `origin_tmdb_id` / `origin_title` — მსახიობის კადრი TMDB-ის მონიშნული
 *    სურათია (`tagged_images`) და აქამდე მხოლოდ სახელში ეწერა, რომელი ფილმიდანაა. ახლა
 *    სათაური ცალკე ინახება — მსახიობის ფოტოები მის მიხედვით ჯგუფდება. ⚠️ ეს TMDB-ის
 *    სათაურია და არა ჩემი ჩანაწერის id: ჩანაწერი შეიძლება ბიბლიოთეკაში არც იყოს.
 *    ძველ ფოტოებზე სვეტები ცარიელია — ისინი „სხვა" ჯგუფში ხვდება.
 *  · `opens` — ფოტოს გახსნების მთვლელი, მხოლოდ დალაგებისთვის („ხშირად გახსნილი").
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gallery_images', function (Blueprint $table) {
            if (! Schema::hasColumn('gallery_images', 'origin_type')) {
                $table->string('origin_type', 10)->nullable();
                $table->unsignedBigInteger('origin_tmdb_id')->nullable();
                $table->string('origin_title', 255)->nullable();
            }

            if (! Schema::hasColumn('gallery_images', 'opens')) {
                $table->unsignedInteger('opens')->default(0);
            }
        });
    }

    public function down(): void
    {
        Schema::table('gallery_images', function (Blueprint $table) {
            foreach (['origin_type', 'origin_tmdb_id', 'origin_title', 'opens'] as $column) {
                if (Schema::hasColumn('gallery_images', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
