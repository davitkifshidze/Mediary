<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks §7.1 — ვიდეოს ლოკალურად ჩამოწერა (`yt-dlp`).**
 *
 * ⚠️ ფაილი **`videos` ცხრილის სვეტებია და არა `video_files`-ის რიგი.** ორი
 * მიზეზი: (1) ერთ ვიდეოს ერთი ლოკალური ასლი აქვს — ცხრილი „რამდენი აქვს"-ს
 * პასუხობს, სვეტი კი „აქვს თუ არა"-ს, რაც სწორედ ეს კითხვაა; (2) `video_files`
 * მიმაგრებული ფოტო/დოკუმენტია და გიგაბაიტიანი ვიდეო იქ „დოკუმენტად"
 * ჩაითვლებოდა — სექციის ბადეშიც გამოჩნდებოდა.
 *
 * ⚠️ `download_size` ცალკე სვეტია და **ის თავისუფლდება წაშლისას** (და არა
 * დისკიდან წაკითხული ზომა) — იგივე წესი, რაც `StoredFile`-ს და ჩატის
 * მიმაგრებას აქვს, თორემ მრიცხველი ჩუმად სცდება.
 *
 * ⚠️ `download_status` სამ მდგომარეობას არჩევს, რომლებიც **განსხვავებული
 * ფაქტებია**: `running` (მიმდინარეობს), `failed` + `download_error` (ვცადეთ
 * და ვერ მოხერხდა) და ცარიელი გზა (არასდროს გვიცდია). ერთი boolean სამივეს
 * ერთმანეთში აურევდა და UI ვერ იტყოდა, დაელოდოს თუ თავიდან სცადოს.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            // პრივატულ დისკზეა (`videos/downloads`) — იხ. `StorageFolder::PRIVATE_FOLDERS`
            $table->string('download_path')->nullable()->after('thumbnail_url');
            $table->string('download_name')->nullable()->after('download_path');
            $table->unsignedBigInteger('download_size')->default(0)->after('download_name');
            // რა მივიღეთ სინამდვილეში („1080p · mp4") — „საუკეთესო ხელმისაწვდომი"
            // წყაროზეა დამოკიდებული და მომხმარებელმა უნდა დაინახოს, რა მოვიდა
            $table->string('download_format', 100)->nullable()->after('download_size');
            $table->string('download_status', 20)->nullable()->after('download_format');
            $table->text('download_error')->nullable()->after('download_status');
            $table->timestamp('downloaded_at')->nullable()->after('download_error');

            // „ჩამოწერილები" ცალკე სექციაა (§7.1) — ფილტრი ამ ინდექსზე დგას
            $table->index(['user_id', 'download_status']);
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'download_status']);
            $table->dropColumn([
                'download_path',
                'download_name',
                'download_size',
                'download_format',
                'download_status',
                'download_error',
                'downloaded_at',
            ]);
        });
    }
};
