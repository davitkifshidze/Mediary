<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * თარგმანის გარე გამოძახებების აღრიცხვა (შენი მითითება, 2026-09-14:
 * „ლიმიტები — თუ გუგლზე, მაგის ჩვენებაც, რამდენი გამოიყენე და რა დარჩა").
 *
 * ⚠️ **`serp_searches`-ის ზუსტი პრეცედენტია**: ერთი კლიენტი — ერთი მრიცხველი.
 * თუ Gemini-ს სხვა გზითაც გამოვიძახებთ, მრიცხველი ჩუმად აცდება, ამიტომ
 * ერთადერთი ჩამწერი `Services\Translation\Translator`-ია.
 *
 * ⚠️ **`provider` სვეტი განზრახაა, თუმცა დღეს ერთი მნიშვნელობა აქვს.**
 * `serp_searches.engine`-ის იგივე ლოგიკა: მეორე წყაროს დამატება ერთი
 * მნიშვნელობაა და არა მეორე ცხრილი. **ენუმი არაა** — sqlite მას `check`
 * შეზღუდვად ხატავს და ახალ მნიშვნელობას უარყოფს (`approval_requests.type`-ის
 * ნასწავლი გაკვეთილი).
 *
 * ⚠️ **`ok`/`error` იწერება ჩავარდნილ გამოძახებაზეც.** `serp_searches` მას
 * არ წერდა, რადგან SerpApi შეცდომას არ გვახარჯვინებს; Gemini-ს კვოტას კი
 * უარყოფილი მოთხოვნაც ხარჯავს (429 სწორედ იმიტომ მოდის, რომ ლიმიტს მიაღწიე),
 * ე.ი. „ვცადე და ვერ გავიდა" აღრიცხვის ნაწილია და არა ხმაური.
 *
 * ⚠️ **თარიღის ფანჯარა სვეტად არ იწერება** — Gemini-ის უფასო დონის დღიური
 * ლიმიტი **წყნარი ოკეანის შუაღამეზე** ნულდება, ე.ი. ფანჯარა UTC-ის დღეს არ
 * ემთხვევა და მისი ჩაქვავება მრიცხველს მუდმივად აცდენდა (`serp_searches`-ის
 * გადაუწერელი `month` სვეტის იგივე მიზეზი). გამოთვლა `created_at`-იდან ხდება.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('translation_usages', function (Blueprint $table) {
            $table->id();
            // ⚠️ nullable: გამოძახება artisan-იდანაც შეიძლება წამოვიდეს, სადაც
            // `Auth::id()` არ არსებობს — ხარჯი მაშინაც უნდა აღირიცხოს
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('provider', 40)->default('gemini');
            $table->string('model', 80)->nullable();
            /** სამიზნე ენა — `ka` ან `en` */
            $table->string('target_lang', 5)->nullable();
            /** რის თარგმანი იყო: `movie synopsis`, `film genre name`… */
            $table->string('context', 60)->nullable();
            /** გაგზავნილი ტექსტის სიგრძე — „რამდენი დავხარჯე" მოცულობით */
            $table->unsignedInteger('chars')->default(0);
            $table->boolean('ok')->default(true);
            $table->string('error', 255)->nullable();
            $table->timestamps();

            $table->index('created_at');
            $table->index(['provider', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('translation_usages');
    }
};
