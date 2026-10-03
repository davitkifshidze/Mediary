<?php

use App\Models\VideoType;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ვიდეოს ტიპს ფერი ეძლევა** (Tasks §19.2).
 *
 * ბარათზე სამი ბეჯი დგას — ტიპი · სტატუსი · პლატფორმა — და სამივეს თავისი
 * ფერი უნდა ჰქონდეს (შენი მოთხოვნა: „YouTube-ს წითელი, სტატუსს და ტიპს თავისი
 * შესაბამისი“). სტატუსს ფერი §16-დან აქვს, პლატფორმას კოდში (`lib/platforms.ts`),
 * ტიპი კი per-user ლექსიკონია და ფერი მონაცემში უნდა იწერებოდეს — იგივე
 * ფორმატით, რაც `statuses.color`-ს აქვს (`c1…c12` პალიტრა ან `#rrggbb`).
 *
 * ნაგულისხმევ ტიპებს (`VideoType::DEFAULTS`) ფერი ერთჯერადად ეწერება:
 * ინფორმაციული — ლურჯი (`c7`), გასართობი — იისფერი (`c8`); ხელით შექმნილი
 * ტიპი უფეროდ რჩება, სანამ არ აირჩევ.
 *
 * ⚠️ query builder-ით — მანქანის ჩანაწერია და აუდიტში არ უნდა მოხვდეს.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('video_types', function (Blueprint $table) {
            $table->string('color', 20)->nullable()->after('icon');
        });

        foreach (VideoType::DEFAULTS as $default) {
            if (empty($default['color'])) {
                continue;
            }

            DB::table('video_types')
                ->where('key', $default['key'])
                ->whereNull('color')
                ->update(['color' => $default['color']]);
        }
    }

    public function down(): void
    {
        Schema::table('video_types', function (Blueprint $table) {
            $table->dropColumn('color');
        });
    }
};
