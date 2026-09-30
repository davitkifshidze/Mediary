<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **პირადი მოდულის ჩანაწერის საკუთარი ფაილები და ჩანიშვნები (Tasks §37.5).**
 *
 * საბაზისო მოდულის წესი (2026-09-03): ყოველ სექციას თავისი `<module>_files` და
 * `<module>_notes` აქვს — საერთო `attachments` ცხრილი აღარ არსებობს. პირადი
 * მოდული ერთი „ზოგადი" მოდულია, ამიტომ ცხრილიც ერთია ყველასთვის და მოდულს
 * `module` სვეტი ჭრის (`custom_records`-ის ფორმა).
 *
 * ⚠️ **`module` სვეტი დენორმალიზაციაა და განზრახაა** — ურნა (`module_column`),
 * საცავის მოდულის ლიმიტი (§17.2) და აუდიტის მოდული რიგიდან კითხულობს, და
 * ჩანაწერთან შეერთება ყოველ მათგანს ცალკე მოთხოვნას დაუმატებდა.
 *
 * ⚠️ **ვებიდან მოტანილი ფოტო აქ არ ჯდება** — ის `gallery_images`-შია (37.4):
 * ჩემი ატვირთვა სექციის ცხრილში, მოტანილი — გალერეაში (ვიდეოს, სამაგიდო
 * თამაშისა და ადგილის იგივე განაწილება).
 *
 * ⚠️ **ყველა `timestamp` `nullable()`-ია** — MariaDB 10.4-ის
 * `ON UPDATE CURRENT_TIMESTAMP` ხაფანგი (`trashed_files.trashed_at`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('custom_record_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('module', 32);
            $table->foreign('module')->references('key')->on('modules')->cascadeOnDelete();
            $table->foreignId('custom_record_id')->constrained('custom_records')->cascadeOnDelete();

            // `image` = ჩემი ფოტო (ვიტრინა) · `doc` = თანმხლები დოკუმენტი
            $table->string('kind', 10);
            $table->string('path');
            $table->string('original_name')->nullable();
            $table->string('mime', 191)->nullable();
            $table->unsignedBigInteger('size')->default(0);

            $table->timestamp('trashed_at')->nullable()->index();
            $table->timestamps();

            $table->index(['custom_record_id', 'kind']);
            $table->index(['user_id', 'module']);
        });

        Schema::create('custom_record_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('module', 32);
            $table->foreign('module')->references('key')->on('modules')->cascadeOnDelete();
            $table->foreignId('custom_record_id')->constrained('custom_records')->cascadeOnDelete();

            $table->text('body');

            $table->timestamp('trashed_at')->nullable()->index();
            $table->timestamps();

            $table->index('custom_record_id');
            $table->index(['user_id', 'module']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('custom_record_notes');
        Schema::dropIfExists('custom_record_files');
    }
};
