<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ადგილის „ჩემი შეფასება" — მთელი რიცხვი 1-დან 10-მდე** (Tasks §25.2).
 *
 * `places.rating` `decimal(3,1)` იყო (0–10, ათწილადით), დანარჩენ ოთხ
 * მოდულს (წიგნი, თამაში, სამაგიდო, სიმღერა) კი `unsignedTinyInteger`
 * 1–10 აქვს. ფორმაში ერთი ამრჩევი დგება (`RatingSelect`), ე.ი. ადგილიც
 * იმავე ენაზე უნდა ლაპარაკობდეს.
 *
 * ⚠️ **ჯერ მნიშვნელობები, მერე ტიპი.** ტიპის შეცვლამდე წილადი რომ არ
 * დამრგვალდეს, MySQL მას ჩუმად მოჭრიდა (7.9 → 7), ანუ შეფასებას
 * შეცვლიდა ისე, რომ არავინ იცოდა. დამრგვალება PHP-შია (`round()` ნახევარს
 * ზემოთ ამრგვალებს): SQL-ის `ROUND()` ორ დრაივერზე სხვადასხვა ტიპს
 * აბრუნებს (`LibraryStats::byRating()`-ის იგივე მიზეზი).
 *
 * ⚠️ **1-ზე ნაკლები 1 ხდება და არა `null`**: ძველ შკალაზე 0 „ყველაზე ცუდი"
 * იყო და არა „შეუფასებელი" — შეფასების წაშლა მომხმარებლის განაჩენს
 * წაშლიდა, უახლოესი დაშვებული მნიშვნელობა კი მას ინარჩუნებს.
 *
 * ⚠️ **ტიპი მხოლოდ MySQL-ზე იცვლება** (პროექტის წესი sqlite-ის
 * ტესტებისთვის): sqlite-ზე სვეტი decimal რჩება, მნიშვნელობები კი
 * დამრგვალებულია და მოდელის `integer` cast-ი ორივეზე რიცხვს აბრუნებს.
 */
return new class extends Migration
{
    public function up(): void
    {
        $rows = DB::table('places')->whereNotNull('rating')->select(['id', 'rating'])->lazyById();

        foreach ($rows as $row) {
            $value = max(1, min(10, (int) round((float) $row->rating)));

            if ((float) $row->rating !== (float) $value) {
                DB::table('places')->where('id', $row->id)->update(['rating' => $value]);
            }
        }

        if (DB::getDriverName() === 'mysql') {
            Schema::table('places', function (Blueprint $table) {
                $table->unsignedTinyInteger('rating')->nullable()->change();
            });
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            Schema::table('places', function (Blueprint $table) {
                $table->decimal('rating', 3, 1)->nullable()->change();
            });
        }
    }
};
