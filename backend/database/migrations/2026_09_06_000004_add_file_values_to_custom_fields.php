<?php

use App\Support\CustomFields;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks §6, ფაზა 4b — `ფაილი` ტიპის ველი** (🔗 §17).
 *
 * ფაზა 3-მა მნიშვნელობა **ტიპებად დაშლილ სვეტებში** ჩასვა (`value_text` /
 * `value_number` / `value_date` / `value_bool`) — აქაც იგივე წესი გრძელდება:
 * ფაილი **ერთი „value" სტრიქონი არაა**, მას გზაც აქვს, სახელიც, mime-იც და
 * ზომაც. სწორედ **ზომა** ხდის ცალკე სვეტს სავალდებულოს: კვოტა წაშლისას
 * **ჩაწერილ** ბაიტებს ათავისუფლებს და არა დისკიდან წაკითხულს (იგივე წესი,
 * რაც `StoredFile`-სა და ჩატის მიმაგრებას აქვს — დისკიდან კითხვა წაშლილ
 * ფაილზე 0-ს დააბრუნებდა და მრიცხველი ჩუმად აცდებოდა).
 *
 * ⚠️ **ცალკე `<module>_field_files` ცხრილი განზრახ არ იქმნება.** ერთ ჩანაწერს
 * ერთ ველზე **ერთი** მნიშვნელობა აქვს (`unique(record_id, field_key)`), ე.ი.
 * ფაილიც ერთია — ცალკე ცხრილი იმავე რიგს ორ ადგილას დაწერდა და „რომელია
 * ნამდვილი" კითხვას გააჩენდა.
 *
 * ⚠️ **cascade ბაზაზე რჩება, მაგრამ ის აღარ კმარა.** ფაზა 3-ის დროს
 * მნიშვნელობას ფაილი არ ჰკიდია და SQL-ის კასკადი საკმარისი იყო; ახლა
 * ჩანაწერის წაშლა ფაილსაც უნდა შლიდეს და კვოტასაც ათავისუფლებდეს, კასკადი
 * კი მოდელის ივენთს **არ** ისვრის. ამიტომ დაემატა `HasCustomFields` trait —
 * ის `deleting`-ზე ჯერ ფაილებს იტანს, კასკადი კი მერე რიგებს იბრუნებს.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (array_keys(CustomFields::TABLES) as $table) {
            // ⚠️ იხ. `create_custom_field_values` — მოგვიანებით დამატებული
            // მოდულის ცხრილი აქ ჯერ არ არსებობს და მას თავისი მიგრაცია ქმნის
            // (უკვე ამ ოთხი სვეტითურთ).
            if (! Schema::hasTable($table)) {
                continue;
            }

            Schema::table($table, function (Blueprint $table) {
                $table->string('value_path')->nullable();
                $table->string('value_name')->nullable();
                $table->string('value_mime', 120)->nullable();
                // ⚠️ **ჩაწერილი ზომა** — წაშლისას სწორედ ის თავისუფლდება
                $table->unsignedBigInteger('value_size')->nullable();
            });
        }
    }

    public function down(): void
    {
        foreach (array_keys(CustomFields::TABLES) as $table) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            Schema::table($table, function (Blueprint $table) {
                $table->dropColumn(['value_path', 'value_name', 'value_mime', 'value_size']);
            });
        }
    }
};
