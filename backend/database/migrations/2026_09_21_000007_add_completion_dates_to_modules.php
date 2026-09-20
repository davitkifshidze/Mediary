<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **„როდის დავასრულე" თარიღი დანარჩენ ოთხ მოდულს (FEAT-21-ის ნარჩენი).**
 *
 * FEAT-21-მა წლიური მიზანი ააშენა, მაგრამ მისივე დროშისებრი მაგალითი —
 * „წელს 24 წიგნი" — **არ მუშაობდა**: წიგნს, თამაშს, სამაგიდო თამაშსა და
 * ჩანაწერს დასრულების თარიღი სვეტად არ ჰქონდათ, ე.ი. `LibraryStats`-ის
 * `done_at` მათზე `null` იყო და `goalModules()` მათ სიიდან ჭრიდა.
 *
 * ⚠️ **`updated_at`-ით ჩანაცვლება გამორიცხული იყო და ისევ არის** — ერთ
 * სვეტში ორი ფაქტი ზუსტად ის ხაფანგია, რომელსაც `Book::syncProgress()`
 * ებრძვის და რომელსაც FEAT-08-მა შეგნებულად აარიდა თავი. ამიტომაც
 * ცალკე სვეტი და ცალკე მიგრაცია.
 *
 * ⚠️ **ბორდგეიმის სვეტს `acquired_at` ჰქვია და არა `finished_at`, და ეს
 * განზრახულია.** მისი „გაკეთებული" სტატუსი `owned`-ია (`PublicDomain::MATCH`),
 * ე.ი. ფაქტი, რომელსაც თარიღი ეწერება, **შეძენაა და არა დასრულება**.
 * `finished_at` აქ ლამაზი ერთგვაროვნება იქნებოდა და მტყუანი სახელი —
 * სვეტი იმას უნდა ერქვას, რასაც ინახავს (`watched_at`-ის იგივე წესი).
 *
 * ⚠️ **ძველი რიგები განზრახ `null`-ით რჩება.** „როდის წავიკითხე" უკვე
 * წაკითხულ წიგნზე **არსად არ წერია** — `created_at` რიგის შექმნის დროა და
 * არა წაკითხვისა. გამოგონილი თარიღი სტატისტიკას სამუდამოდ გააფუჭებდა,
 * ამიტომ მიზნები დღევანდელი დღიდან ითვლება.
 *
 * ⚠️ **თარიღია და არა დროშტამპი** — კურსისა და ადგილის (ორი უახლესი
 * მოდულის) უკვე დადგენილი ფორმა: „დავასრულე" კალენდარული დღეა.
 */
return new class extends Migration
{
    /** ცხრილი → სვეტი; სახელი ფაქტს მისდევს და არა პირიქით */
    private const COLUMNS = [
        'books' => 'finished_at',
        'games' => 'finished_at',
        'board_games' => 'acquired_at',
        'note_entries' => 'finished_at',
    ];

    public function up(): void
    {
        foreach (self::COLUMNS as $table => $column) {
            if (! Schema::hasTable($table) || Schema::hasColumn($table, $column)) {
                continue;
            }

            Schema::table($table, function (Blueprint $t) use ($column) {
                /* ⚠️ ინდექსით: თვეების ჭრილიც და მიზნის პროგრესიც სწორედ ამ
                   სვეტზე ფილტრავენ (`whereYear` + `group by`), ე.ი. სკანი
                   ბიბლიოთეკის ზრდასთან ერთად გაძვირდებოდა.

                   ⚠️ **`after()` განზრახ არ წერია**: სამ ცხრილს `status`
                   სვეტი აქვს, `note_entries`-ს კი `status_id` (§6.4-ის
                   ლექსიკონი) — ე.ი. ერთი საერთო „დააყენე status-ის შემდეგ"
                   MySQL-ზე სწორედ ჩანაწერის ცხრილზე ჩავარდებოდა. */
                $t->date($column)->nullable()->index();
            });
        }
    }

    public function down(): void
    {
        foreach (self::COLUMNS as $table => $column) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, $column)) {
                continue;
            }

            Schema::table($table, fn (Blueprint $t) => $t->dropColumn($column));
        }
    }
};
