<?php

use App\Support\CustomFields;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks §6, ფაზა 3 — მორგებული ველების მნიშვნელობები** (`DECISIONS.md` §2).
 *
 * user-ის პასუხი: **(ა) ცალკე ცხრილი `<module>_field_values`**, და არა JSON
 * სვეტი ჩანაწერზე — რომ ფილტრაცია/დახარისხება SQL-ში დარჩეს. ეს 2026-09-03-ის
 * წესსაც ემთხვევა („სექციას თავისი ცხრილი").
 *
 * ⚠️ **ველის *განსაზღვრება* აქ არ ინახება** — ის `module_user.settings`-შია
 * (`custom_fields`), ისევე როგორც ჩაშენებული ველების გადახრები. აქ მხოლოდ
 * **მნიშვნელობებია**: განსაზღვრება მოდულისაა, მნიშვნელობა კი ჩანაწერის.
 *
 * ⚠️ **ტიპი ცალკე სვეტებადაა დაშლილი** (`value_text` / `value_number` /
 * `value_date` / `value_bool`) და არა ერთ „value" სტრიქონად. ერთ ტექსტურ
 * სვეტში რიცხვი ანბანურად დალაგდებოდა („10" < „9"), თარიღი კი შედარებადი
 * აღარ იქნებოდა — ე.ი. სწორედ ის დაიკარგებოდა, რისთვისაც ცხრილი აირჩა.
 *
 * ⚠️ **`gallery` და `playlist` სიაში არ არიან**: პირველს საკუთარი ჩანაწერი
 * არ აქვს (ფოტოები სხვის ჩანაწერზე ჰკიდია), მეორე კი მოდული არაა.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (CustomFields::TABLES as $table => $parent) {
            /* ⚠️ **მშობელი ცხრილი შეიძლება ჯერ არ არსებობდეს.** `CustomFields::TABLES`
               ზრდადი რუკაა და მასში მოგვიანებით დამატებული მოდული (`bookmark` —
               2026-09-07, `anime` — 2026-09-11) **ამ მიგრაციაზე გვიანაა**: სუფთა
               ბაზაზე აქ `foreignId(...)->constrained('bookmarks')` არარსებულ
               ცხრილზე მიუთითებდა. სqlite ამას ჩუმად იტანს, MySQL კი — არა.
               ასეთ ცხრილს **მისივე მოდულის მიგრაცია ქმნის** (`hasTable`-ის
               დაცვით), ე.ი. აქ უბრალოდ გამოვტოვებთ. */
            if (! Schema::hasTable($parent)) {
                continue;
            }

            Schema::create($table, function (Blueprint $table) use ($parent) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                // ⚠️ cascade ბაზაზეა: მნიშვნელობას ფაილი არ ჰკიდია, ე.ი.
                // მოდელის ივენთი აქ არაფრისთვის სჭირდება (განსხვავებით
                // `<module>_files`-ისგან, სადაც დისკი და კვოტა ირევა)
                $table->foreignId('record_id')->constrained($parent)->cascadeOnDelete();
                $table->string('field_key', 60);

                $table->text('value_text')->nullable();
                $table->decimal('value_number', 20, 4)->nullable();
                $table->date('value_date')->nullable();
                $table->boolean('value_bool')->nullable();

                $table->timestamps();

                // ერთ ჩანაწერს ერთ ველზე ერთი მნიშვნელობა აქვს
                $table->unique(['record_id', 'field_key']);
                $table->index(['user_id', 'field_key']);
            });
        }
    }

    public function down(): void
    {
        foreach (array_keys(CustomFields::TABLES) as $table) {
            Schema::dropIfExists($table);
        }
    }
};
