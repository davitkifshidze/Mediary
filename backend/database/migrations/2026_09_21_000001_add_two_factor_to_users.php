<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **არჩევითი TOTP (FEAT-16).**
 *
 * ⚠️ **სვეტების სახელები უკვე არსებობდა `AuditRegistry::HIDDEN`-ში** — იქ
 * ისინი წინასწარ ეწერა, თვითონ სვეტები კი არა. ეს ის შემთხვევაა, როცა
 * დაცვა დაწერილია და დასაცავი ჯერ არ არსებობს; ახლა ორივეა.
 *
 * ⚠️ **ორივე დაშიფრულია (`encrypted` cast) და არა დაჰეშილი.** საიდუმლო
 * ჰეშით უბრალოდ არ იმუშავებდა (კოდის შესამოწმებლად თვითონ საიდუმლო
 * სჭირდება), აღდგენის კოდები კი ხელახლა საჩვენებელი უნდა იყოს — და
 * თვითონ საიდუმლოს ცოდნა ისედაც ყველა კოდის ექვივალენტია, ე.ი. მათი
 * დაჰეშვა ერთსა და იმავე რიგში არაფერს მატებდა.
 * ⚠️ დაშიფვრა `APP_KEY`-ზე დგას: ბაზის სხვა მანქანაზე გადატანა გასაღების
 * გადატანასაც ნიშნავს (იგივე წესი, რაც `user_credentials`-ს აქვს).
 *
 * ⚠️ **`two_factor_confirmed_at` ცალკე ფაქტია და არა „საიდუმლო არსებობს".**
 * ჩართვა ორნაბიჯიანია: ჯერ საიდუმლო იბადება და QR ჩნდება, მერე მომხმარებელი
 * კოდით ადასტურებს. დადასტურებამდე შესვლა მეორე ფაქტორს **არ** ითხოვს —
 * თორემ ავთენტიფიკატორში ვერ ჩაწერილი საიდუმლო ანგარიშს სამუდამოდ კეტავს.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('two_factor_secret')->nullable()->after('remember_token');
            $table->text('two_factor_recovery_codes')->nullable()->after('two_factor_secret');
            $table->timestamp('two_factor_confirmed_at')->nullable()->after('two_factor_recovery_codes');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['two_factor_secret', 'two_factor_recovery_codes', 'two_factor_confirmed_at']);
        });
    }
};
