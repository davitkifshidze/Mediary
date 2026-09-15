<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **თითო მომხმარებლის საკუთარი გასაღებები და ლიმიტები** (Tasks §21).
 *
 * ⚠️ **ორი JSON სვეტი და არა ცხრილი `provider`-ის ველზე.** ველების ნაკრები
 * provider-ს ეკუთვნის და კოდშია (`CredentialProviders`): TMDB-ს ერთი
 * გასაღები აქვს, IGDB-ს ორი, Gemini-ს გასაღები + მოდელი. ცალკე სვეტები
 * მერვე წყაროზე მიგრაციას მოითხოვდა, ცალკე `credential_fields` ცხრილი კი
 * ერთი ჩანაწერის წასაკითხად ხუთ რიგს — და ეს ყველაფერი ისეთ მონაცემზე,
 * რომელსაც **არასდროს ვფილტრავთ და არასდროს ვალაგებთ**.
 *
 * ⚠️ **`credentials` დაშიფრულია (`encrypted:array`, APP_KEY).** ბაზის დამპი
 * (§22) მთელი ბაზის ასლია და ხელიდან ხელში გადადის — ღიად დაწერილი
 * გასაღები იქ სამუდამოდ დარჩებოდა. `limits` **არ იშიფრება**: ის საიდუმლო
 * არაა და შიფრი მას მხოლოდ წასაკითხად უვარგისს გახდიდა.
 *
 * ⚠️ **`limits` ცალკეა და არა `credentials`-ის შიგნით**, თუმცა ორივე JSON-ია:
 * ლიმიტი საიდუმლო არაა (UI-ზე ციფრად ჩანს), გასაღები კი — არის. ერთ
 * დაშიფრულ ბლობში ჩაყრა ნიშნავდა, რომ ყოველი „რა ლიმიტი მაქვს" კითხვა
 * გასაღების გაშიფვრას მოითხოვდა.
 *
 * ⚠️ **`is_active` არ არის „წაშლა"**: გამორთული ჩანაწერი გასაღებს ინახავს,
 * მაგრამ საერთოზე გადადის — ე.ი. „ვცადოთ ჯერ საერთოთი" ერთი გადამრთველია
 * და არა გასაღების ხელახლა აკრეფა.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_credentials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            /** `CredentialProviders::PROVIDERS`-ის key. ⚠️ ენუმი არაა —
             *  sqlite მას `check`-ად ხატავს და მერვე წყაროს უარყოფდა. */
            $table->string('provider', 40);
            /** დაშიფრული `{"key": "…", "model": "…"}` */
            $table->text('credentials')->nullable();
            /** ღია `{"daily": 1500, "rpm": 15}` */
            $table->json('limits')->nullable();
            $table->boolean('is_active')->default(true);
            /** ბოლო წარმატებული „შემოწმება" — „ჩავწერე" და „მუშაობს" სხვადასხვაა */
            $table->timestamp('verified_at')->nullable();
            /** ბოლო შემოწმების მიზეზი, თუ ჩავარდა (მოკლედ, პასუხის გარეშე) */
            $table->string('last_error', 255)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'provider']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_credentials');
    }
};
