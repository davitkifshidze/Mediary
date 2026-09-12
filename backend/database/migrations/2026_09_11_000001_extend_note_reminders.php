<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * შეხსენებების სრული ნაკრები (Tasks §5.5).
 *
 * §13.2-ის ოთხ რეჟიმს (`once`/`interval`/`daily`/`weekly`) ორი ემატება —
 * **`monthly`** (თვის კონკრეტული რიცხვი) და **`yearly`** (თვე + რიცხვი) —
 * და ორი დამოუკიდებელი შესაძლებლობა:
 *
 *  · **რამდენიმე კვირის დღე ერთდროულად** (ორშ/ოთხ/პარ ერთ შეხსენებად);
 *  · **ჯერადობა** (`repeat_count`) — რამდენჯერ გაისროლოს სულ.
 *
 * ⚠️ **`weekday` (ერთი დღე) იშლება და `weekdays` (მასივი) ცვლის.** ორივეს
 * დატოვება ერთსა და იმავე ფაქტს ორ ადგილას შეინახავდა და ისინი აუცილებლად
 * დაშორდებოდნენ — ზუსტად ის ხაფანგი, რასაც `Book::syncProgress()` ებრძვის.
 * ერთი არჩეული დღე ძველის იდენტურად მუშაობს.
 *
 * ⚠️ **სვეტის წაშლა მხოლოდ MySQL-ზეა.** sqlite (ტესტები) `DROP COLUMN`-ს
 * ვერ ასრულებს ყველა შემთხვევაში — იქ მკვდარი სვეტი რჩება და მას არაფერი
 * კითხულობს (იგივე გადაწყვეტა, რაც `songs.genre_id`-ს აქვს).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('note_reminders', function (Blueprint $table) {
            // `monthly`/`yearly` — თვის რიცხვი და თვე
            $table->unsignedTinyInteger('day_of_month')->nullable()->after('weekday');
            $table->unsignedTinyInteger('month')->nullable()->after('day_of_month');
            // `weekly` — რამდენიმე დღე ერთდროულად (0 = კვირა, Carbon-ის წესი)
            $table->json('weekdays')->nullable()->after('month');
            // ⚠️ `null` = უსასრულოდ; რიცხვი = სულ რამდენჯერ გაისროლოს
            $table->unsignedInteger('repeat_count')->nullable()->after('is_active');
        });

        // ძველი ერთი დღე → ახალი მასივი (მონაცემი არ იკარგება)
        foreach (DB::table('note_reminders')->whereNotNull('weekday')->get(['id', 'weekday']) as $row) {
            DB::table('note_reminders')
                ->where('id', $row->id)
                ->update(['weekdays' => json_encode([(int) $row->weekday])]);
        }

        if (DB::getDriverName() === 'mysql') {
            Schema::table('note_reminders', function (Blueprint $table) {
                $table->dropColumn('weekday');
            });
        }
    }

    public function down(): void
    {
        Schema::table('note_reminders', function (Blueprint $table) {
            $table->dropColumn(['day_of_month', 'month', 'weekdays', 'repeat_count']);
        });

        if (DB::getDriverName() === 'mysql') {
            Schema::table('note_reminders', function (Blueprint $table) {
                $table->unsignedTinyInteger('weekday')->nullable();
            });
        }
    }
};
