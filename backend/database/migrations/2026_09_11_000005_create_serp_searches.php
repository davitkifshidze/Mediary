<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks §7.6.1 — SerpApi-ის ძებნების აღრიცხვა.
 *
 * ⚠️ **ცხრილი განზრახაა და არა ქეშის მრიცხველი.** 250 ძებნა თვეში იმდენად
 * ცოტაა, რომ „რამდენი დარჩა" კითხვაზე პასუხი ქეშის გასუფთავებას ვერ გადაყვება;
 * თანაც რიგი პასუხობს კითხვას **„ვინ და რაზე დახარჯა"**, რასაც ერთი რიცხვი
 * ვერასდროს იტყვის.
 *
 * ⚠️ **`month` სვეტი განზრახ არ არსებობს.** ის `created_at`-იდან გამოითვლება,
 * ე.ი. ორ ადგილას ერთი ფაქტი არ ჩაიწერება (`games.year`-ის ზუსტი პრეცედენტი).
 * ეს არსებითია: SerpApi-ის ანგარიში **კალენდარულ თვეზე არ განახლდება** (ჩვენს
 * შემთხვევაში 7 რიცხვში), ე.ი. ფანჯარა მოძრავია და მისი სვეტად ჩაქვავება
 * მრიცხველს მუდმივად აცდენდა.
 *
 * ⚠️ **ეს მოდული არ არის** — SerpApi წყაროა (TMDB/RAWG/BGG-ის რიგში), ამიტომ
 * არც `modules` რიგი ემატება, არც `visibility` სვეტი, არც საჯარო დომენი.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('serp_searches', function (Blueprint $table) {
            $table->id();
            // ⚠️ nullable: გამოძახება artisan-იდანაც შეიძლება წამოვიდეს, სადაც
            // `Auth::id()` არ არსებობს — ხარჯი მაშინაც უნდა აღირიცხოს
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('engine', 40);
            $table->string('query', 255)->nullable();
            // ერთი და იმავე შეკითხვის ამოცნობა (ქეშის გასაღების ტყუპი)
            $table->string('fingerprint', 64)->nullable();
            $table->unsignedSmallInteger('results')->default(0);
            $table->timestamps();

            $table->index('created_at');
            $table->index(['engine', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('serp_searches');
    }
};
