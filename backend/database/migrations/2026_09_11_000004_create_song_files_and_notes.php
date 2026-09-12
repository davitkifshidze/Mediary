<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks §7.4 — სიმღერაზე მიმაგრებული ფაილები და ჩანიშვნები.**
 *
 * ორი ცხრილი, **2026-09-03-ის სექციური წესით** (უნივერსალური `attachments`
 * აღარ არსებობს): `song_files` და `song_notes` — ზუსტად `video_files` /
 * `video_notes`-ის ფორმაზე, როგორც თასქშია დაწერილი.
 *
 * ⚠️ **`kind` = `image|doc` და არა `audio`.** სიმღერის თვითონ ჩანაწერი
 * `songs.url`-ია (YouTube/Spotify, `VideoUrl`-ის allowlist-ით), ე.ი. აქ
 * ტექსტი, ნოტები, ბუკლეტი და ფოტოები ჯდება. **აუდიოფაილის ატვირთვა
 * განზრახ არ დამატებულა**: §7.4 „როგორც `video_files`" წერია, აუდიო კი
 * ერთეულ ჩანაწერზე ათეულობით მეგაბაიტს დაამატებდა კვოტაში. ერთი სტრიქონია,
 * თუ დაგჭირდა.
 *
 * ⚠️ **cascade ბაზაზეა, მაგრამ `Song::booted()` მაინც სათითაოდ შლის** —
 * SQL-ის კასკადი მოდელის ივენთს არ ისვრის, ე.ი. ფაილი დისკზე და კვოტის
 * მრიცხველი უცვლელი დარჩებოდა (`Video`-ს ზუსტი პრეცედენტი).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('song_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('song_id')->constrained()->cascadeOnDelete();
            $table->enum('kind', ['image', 'doc'])->default('image');
            $table->string('path');
            $table->string('original_name')->nullable();
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['user_id', 'kind']);
            $table->index(['song_id', 'sort_order']);
        });

        Schema::create('song_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('song_id')->constrained()->cascadeOnDelete();
            $table->text('body');
            $table->timestamps();

            $table->index(['user_id']);
            $table->index(['song_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('song_notes');
        Schema::dropIfExists('song_files');
    }
};
