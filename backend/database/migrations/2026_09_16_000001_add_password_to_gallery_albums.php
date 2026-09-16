<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ჩაკეტილი ალბომი (შენი მითითება, 2026-09-16).**
 *
 * შენი სიტყვები: „შეგეძლოს ალბომი ჩაკეტო, პაროლი დაადო; თუ ჩაკეტილია და
 * პაროლი ადევს, იყოს გაბუნდოვნებული, არცერთი ფოტო არ ჩანდეს ისე, და ვერც
 * ინსპექტიდან ვერ შეძლო ნახვა როგორმე".
 *
 * ⚠️ **ერთი სვეტი და არა ორი.** „ჩაკეტილია" ცალკე დროშად რომ გვეწერა
 * (`is_locked` + `password_hash`), ერთი ფაქტი ორ ადგილას იცხოვრებდა და
 * ერთ დღეს გაშორდებოდა — „ჩაკეტილი, პაროლის გარეშე" ან „პაროლიანი,
 * ღია" ორივე უაზრო მდგომარეობაა. ჩაკეტილია ზუსტად მაშინ, როცა
 * `password_hash` არსებობს.
 *
 * ⚠️ **hash და არა პაროლი.** `Hash::make()` — იგივე, რაც `users.password`-ს
 * აქვს; შენახული პაროლი ბაზის დამპშიც (§22) წაკითხვადი იქნებოდა.
 *
 * ⚠️ **აღდგენა არ არსებობს და ეს განზრახია.** ლოკის აზრი ის არის, რომ
 * ბრაუზერთან მისულმა კაცმა ვერ ნახოს — „დაგავიწყდა? მოვხსნათ" ღილაკი
 * ზუსტად ის კარი იქნებოდა, რომელსაც ეს სვეტი კეტავს.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gallery_albums', function (Blueprint $table) {
            $table->string('password_hash')->nullable()->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('gallery_albums', function (Blueprint $table) {
            $table->dropColumn('password_hash');
        });
    }
};
