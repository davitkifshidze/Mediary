<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **„როდის დაიწყო ჩამოწერა" (აუდიტი 2026-09-14, §B1).**
 *
 * `download_status = 'running'` სამუდამო მახე იყო: ფონური პროცესი თუ მოკვდა
 * (სერვერის ტერმინალის დახურვა, მანქანის გადატვირთვა, PHP-ის ფატალური),
 * სტატუსი `running`-ად რჩებოდა სამუდამოდ — ხოლო `start()` ასეთზე 409-ს
 * აბრუნებდა და `deleteDownload()` ბილიკის არქონის გამო მაშინვე ბრუნდებოდა.
 * ე.ი. ამ ვიდეოს ჩამოწერა ხელით SQL-ის გარეშე **ვეღარასდროს გაეშვებოდა**.
 *
 * ⚠️ **`updated_at`-ით გაზომვა არ გამოდგებოდა.** ის ჩანაწერის ნებისმიერ
 * ცვლილებაზე განახლდება (სათაურის რედაქტირება, ტეგი, სტატუსი), ე.ი. ერთი
 * ფაქტის ნაცვლად სულ სხვას იტყოდა — ზუსტად ის ხაფანგი, რომელსაც ეს პროექტი
 * `watched_at`-ზე და `hltb_*`-ზე უკვე ერიდება. ცალკე სვეტი ერთ ფაქტს ინახავს.
 *
 * ⚠️ **ძველი რიგებისთვის `null` „ვადაგასულს" ნიშნავს** (`Video::downloadStale()`):
 * მიგრაციამდე გაჭედილი ჩანაწერი სწორედ ისაა, ვისაც განბლოკვა სჭირდება.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('videos', 'download_started_at')) {
            return;
        }

        Schema::table('videos', function (Blueprint $table) {
            $table->timestamp('download_started_at')->nullable()->after('download_error');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('videos', 'download_started_at')) {
            return;
        }

        Schema::table('videos', function (Blueprint $table) {
            $table->dropColumn('download_started_at');
        });
    }
};
