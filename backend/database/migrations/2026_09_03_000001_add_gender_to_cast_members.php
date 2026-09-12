<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks 10 — მსახიობის სქესი, გალერეის „ქალი/კაცი მსახიობები" არჩევანისთვის.
 *
 * TMDB-ის კოდირებას ვიმეორებთ (credits-ის `gender`): `1` = ქალი, `2` = კაცი,
 * `0` = მიუთითებელი, `3` = არაბინარული. ჩვენ enum-ს არ ვაკეთებთ — TMDB-მ
 * ხვალ ახალი მნიშვნელობა შეიძლება დაამატოს და მიგრაცია არ გვინდა.
 *
 * ⚠️ არსებულ ჩანაწერებზე `null` რჩება; `GalleryFetcher` თვითონ ავსებს
 * (credits-ის ერთი რექვესთი) ისე, რომ სრული resync არ დასჭირდეს.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cast_members', function (Blueprint $table) {
            $table->unsignedTinyInteger('gender')->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('cast_members', function (Blueprint $table) {
            $table->dropColumn('gender');
        });
    }
};
