<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ბუკმარკის დამატებითი ბმულები და ფოტოები** (Tasks §36.3, §36.4).
 *
 * შენი სიტყვები: „თუ შოპინგია ან რამე ისეთი, კონკრეტული ლინკის დამატებაც იყოს
 * დამატებით" · „შეიძლებოდეს ბუკმარკზე დაამატო გალერეა".
 *
 * ⚠️ **`links` JSON სვეტია** (`[{label, url, kind, price, favicon_url}]`, ≤ 20) —
 * წიგნისა და თამაშის `links`-ის იგივე ფორმა: ბმული მხოლოდ ინახება და არასდროს
 * იხსნება სერვერიდან, ე.ი. ცალკე ცხრილი და `SafeHttp` არ სჭირდება.
 *
 * ⚠️ **`bookmark_files` — მხოლოდ ჩემი ატვირთული ფოტო** („შოპინგის" სკრინშოტი,
 * `kind = image`). ვებიდან მოტანილი ფოტო აქ არ ჯდება — ის `gallery_images`-შია
 * (`Bookmark` `HasGallery`-ს იყენებს): ადგილისა და კურსის იგივე განაწილება.
 * `kind` სვეტი სხვა სექციების ფორმის გამოა და ხვალინდელი დოკუმენტისთვის.
 *
 * ⚠️ **ყველა `timestamp` `nullable()`-ია** — MariaDB 10.4-ის
 * `ON UPDATE CURRENT_TIMESTAMP` ხაფანგი (`trashed_files.trashed_at`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookmarks', function (Blueprint $table) {
            $table->json('links')->nullable();
        });

        Schema::create('bookmark_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('bookmark_id')->constrained()->cascadeOnDelete();

            $table->string('kind', 10)->default('image');
            $table->string('path');
            $table->string('original_name')->nullable();
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('size')->default(0);

            // ურნა — `TrashDomain::ITEMS['bookmark_file']`
            $table->timestamp('trashed_at')->nullable()->index();
            $table->timestamps();

            $table->index(['bookmark_id', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bookmark_files');

        Schema::table('bookmarks', function (Blueprint $table) {
            $table->dropColumn('links');
        });
    }
};
