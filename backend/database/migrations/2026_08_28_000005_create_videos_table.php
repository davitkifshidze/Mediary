<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * I5 — ვიდეოს მოდული: ნებისმიერი წყაროდან (YouTube, Vimeo, პირდაპირი ფაილი, სხვა).
 *
 * ორენოვანი translation-ცხრილი აქ **არ არის**: ვიდეო user-ის პირადი ჩანაწერია
 * (ერთი სათაური, როგორც თავად ჩაწერს), TMDB-ის მსგავსი გამამდიდრებელი წყარო არ ჰყავს.
 * ჟანრებთან მიბმის ნაცვლად — მარტივი `tags` (json), რომ გლობალური ჟანრების
 * ლექსიკონი ვიდეოს კატეგორიებით არ დაბინძურდეს.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('videos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->string('title');
            $table->text('description')->nullable();

            // წყარო
            $table->string('url', 1000);                 // ორიგინალი ბმული
            $table->string('platform', 40)->default('other'); // youtube|vimeo|dailymotion|file|other
            $table->string('external_id', 100)->nullable();   // პლატფორმის ვიდეოს id
            $table->string('embed_url', 1000)->nullable();    // sanitized iframe src (allowlist)

            // thumbnail: ან დისკზე ატვირთული, ან პლატფორმის URL
            $table->string('thumbnail_path')->nullable();
            $table->string('thumbnail_url', 1000)->nullable();

            $table->unsignedInteger('duration')->nullable();  // წამები
            $table->json('tags')->nullable();

            $table->boolean('is_favorite')->default(false);
            $table->unsignedInteger('watch_count')->default(0);
            $table->timestamp('watched_at')->nullable();
            $table->integer('sort_order')->default(0);

            $table->timestamps();

            $table->index(['user_id', 'is_favorite']);
            $table->index('platform');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('videos');
    }
};
