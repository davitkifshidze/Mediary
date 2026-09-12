<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks §17.2 — კვოტის გადანაწილება მოდულებზე.**
 *
 * ლიმიტი `module_user`-ზე ჯდება და არა ცალკე `storage_allocations`-ზე:
 * ეს ზუსტად per-user × per-module ფაქტია, pivot კი უკვე არსებობს
 * (`settings`, `is_public`, `is_hidden` იქვე ცხოვრობს).
 *
 * ⚠️ **`null` ≠ 0.** `null` = „ცალკე ლიმიტი არ აქვს" და მოდული საერთო
 * აუზიდან ხარჯავს; `0` = „ატვირთვა საერთოდ აკრძალულია". ორი სხვადასხვა
 * მდგომარეობაა და `unsignedBigInteger`-ს ისინი ვერ გაარჩევდა, თუ სვეტი
 * `nullable` არ იქნებოდა.
 *
 * ⚠️ **ავატარი (`account`) ლიმიტს ვერ მიიღებს** — ის მოდული არ არის და
 * pivot-ის რიგი არ აქვს. ის ყოველთვის საერთო აუზიდან იხარჯება.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('module_user', function (Blueprint $table) {
            $table->unsignedBigInteger('storage_limit_bytes')->nullable()->after('settings');
        });
    }

    public function down(): void
    {
        Schema::table('module_user', function (Blueprint $table) {
            $table->dropColumn('storage_limit_bytes');
        });
    }
};
