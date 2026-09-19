<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **აღდგენის ბმული ტოკენით იძებნება და არა ელფოსტით (FEAT-16).**
 *
 * `password_reset_tokens` Laravel-ის ნაგულისხმევი ცხრილია და `email`-ზეა
 * დაპირველადებული — ეს ზუსტად ის სემანტიკაა, რაც გვჭირდება („ერთ ანგარიშზე
 * ერთი მოქმედი ბმული"). წაკითხვა კი **მხოლოდ ტოკენით** ხდება: ბმული
 * `/reset/{token}`-ია და ელფოსტას მისამართში განზრახ არ ატარებს.
 *
 * ⚠️ **ინდექსის გარეშე ერთადერთი გზა მთელი ცხრილის სკანი იქნებოდა.**
 *
 * ⚠️ **`unique` და არა უბრალო ინდექსი**: ორ ანგარიშს ერთი და იგივე ტოკენი
 * ვერ ექნება — შემთხვევითობა ამას ისედაც არ უშვებს, მაგრამ ბაზამ ეს
 * დაშვება უნდა იცოდეს, თორემ `where(token)->first()` ერთ პასუხს დაუბრუნებდა
 * იქ, სადაც ორია.
 *
 * ⚠️ სვეტში **ნედლი ტოკენი არასდროს წერია** — მხოლოდ `sha256` (იხ.
 * `App\Support\ResetLink`).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasIndex('password_reset_tokens', 'password_reset_tokens_token_unique')) {
            return;
        }

        Schema::table('password_reset_tokens', function (Blueprint $table) {
            $table->unique('token');
        });
    }

    public function down(): void
    {
        Schema::table('password_reset_tokens', function (Blueprint $table) {
            $table->dropUnique('password_reset_tokens_token_unique');
        });
    }
};
