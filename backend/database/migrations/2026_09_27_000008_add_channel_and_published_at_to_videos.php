<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ვიდეოს არხი და გამოქვეყნების თარიღი (Tasks §19.6, გადაწყვეტილება Q52 — „ა").**
 *
 * ვებძებნის შედეგს ორივე ფაქტი მოჰყვება („Warner Bros." · 2024-02-15),
 * ბმულის ჩასმისას oEmbed-იც არხს აბრუნებს (`author_name`), მაგრამ ვიდეოს
 * ჩანაწერს მათთვის ადგილი არ ჰქონდა — ორივე ჩუმად იკარგებოდა.
 *
 * ⚠️ **`published_at` თარიღია და არა მომენტი** (`date`, არა `timestamp`):
 * YouTube-ის „გამოქვეყნდა" კალენდარული დღეა, ხოლო დროიანი სვეტი
 * `APP_TIMEZONE`-ის +4-ს შეიძენდა (§8-ის მიგრაცია ზუსტად ასეთ სვეტებს
 * ცვლის) და ღამის ვიდეოს წინა დღედ აჩვენებდა.
 *
 * ⚠️ **ორივე nullable-ია** — ძველ ჩანაწერს არც ერთი არ აქვს, და
 * „არ ვიცით" „ცარიელი სტრიქონისგან" განსხვავებული ფაქტი არ არის.
 * ⚠️ ინდექსი არ ემატება: არხზე ძებნა `LIKE %…%`-ია (ინდექსს ისედაც ვერ
 * იყენებს), ფილტრი კი მასზე არ არსებობს.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->string('channel', 255)->nullable()->after('description');
            $table->date('published_at')->nullable()->after('channel');
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropColumn(['channel', 'published_at']);
        });
    }
};
