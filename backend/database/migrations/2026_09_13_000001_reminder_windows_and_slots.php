<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * შეხსენების სრული ნაკრები — ეტაპი 7 (2026-09-13).
 *
 * §5.5-ის ექვს რეჟიმს სამი დამოუკიდებელი შესაძლებლობა ემატება, ზუსტად ის,
 * რაც შენს ჩამონათვალში აკლდა:
 *
 *  · **დღეში რამდენიმე დრო** — `time_of_day` (ერთი) → `times_of_day` (სია);
 *  · **თვეში რამდენიმე რიცხვი** — `day_of_month` (ერთი) → `days_of_month` (სია);
 *  · **მოქმედების ფანჯარა** — `starts_at`/`ends_at`: „ამ დიაპაზონში",
 *    „ამ პერიოდით". ორივე **აბსოლუტური მომენტია UTC-ში**, `remind_at`-ის
 *    იდენტურად, ე.ი. `next_at`-ს (ისიც UTC-ია) პირდაპირ ედრება და სარტყლის
 *    მეორე მათემატიკა არსად ჩნდება.
 *
 * ⚠️ **ძველი ერთეული სვეტები იშლება და არა რჩება გვერდით** — ზუსტად ის
 * გადაწყვეტა, რაც `weekday → weekdays`-ს ჰქონდა (§5.5). ერთი ფაქტის ორი
 * წყარო აუცილებლად შორდება ერთმანეთს: ფორმა ორ დროს აჩვენებდა, გამომთვლელი
 * კი ერთს კითხულობდა. მონაცემი ჯერ სიად გადადის, სვეტი მერე ქრება.
 *
 * ⚠️ **წაშლა მხოლოდ MySQL-ზეა.** sqlite (ტესტები) `DROP COLUMN`-ს ვერ
 * ასრულებს ყველა შემთხვევაში; იქ მკვდარი სვეტი რჩება და მას არაფერი
 * კითხულობს (იგივე წესი `songs.genre_id`-სა და `note_reminders.weekday`-ს აქვს).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('note_reminders', function (Blueprint $table) {
            // დღეში რამდენიმე გასროლა („8:00 და 20:00")
            $table->json('times_of_day')->nullable()->after('time_of_day');
            // თვეში რამდენიმე რიცხვი („1, 15 და 25")
            $table->json('days_of_month')->nullable()->after('day_of_month');
            // ⚠️ ფანჯარა — აბსოლუტური მომენტები, `remind_at`-ის მსგავსად
            $table->dateTime('starts_at')->nullable()->after('timezone');
            $table->dateTime('ends_at')->nullable()->after('starts_at');
        });

        // ერთეული მნიშვნელობები → სიები (არაფერი იკარგება)
        $rows = DB::table('note_reminders')
            ->select(['id', 'time_of_day', 'day_of_month'])
            ->get();

        foreach ($rows as $row) {
            $update = [];

            if ($row->time_of_day) {
                // ბაზაში `HH:MM:SS` ზის, ინტერფეისს კი წამები არ სჭირდება
                $update['times_of_day'] = json_encode([substr((string) $row->time_of_day, 0, 5)]);
            }

            if ($row->day_of_month) {
                $update['days_of_month'] = json_encode([(int) $row->day_of_month]);
            }

            if ($update) {
                DB::table('note_reminders')->where('id', $row->id)->update($update);
            }
        }

        if (DB::getDriverName() === 'mysql') {
            Schema::table('note_reminders', function (Blueprint $table) {
                $table->dropColumn(['time_of_day', 'day_of_month']);
            });
        }
    }

    public function down(): void
    {
        Schema::table('note_reminders', function (Blueprint $table) {
            $table->dropColumn(['times_of_day', 'days_of_month', 'starts_at', 'ends_at']);
        });

        if (DB::getDriverName() === 'mysql') {
            Schema::table('note_reminders', function (Blueprint $table) {
                $table->time('time_of_day')->nullable();
                $table->unsignedTinyInteger('day_of_month')->nullable();
            });
        }
    }
};
