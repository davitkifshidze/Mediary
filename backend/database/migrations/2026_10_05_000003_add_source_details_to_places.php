<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks §57.1 — ადგილის სრული ინფო წყაროდან.**
 *
 * შენი სიტყვები: „მინდა, სადაც კი რამე ჩაგდება მაქვს — ბმული, სახელი, ადგილი —
 * სრული ინფო, რაც შეიძლება, წამოვიღო". Google Places / Google Maps (SerpApi,
 * Serper) ტელეფონს, ვებგვერდს, სამუშაო საათებს და რეიტინგს აბრუნებენ — მათ
 * სვეტი არ ჰქონდათ და არჩევისას იკარგებოდა.
 *
 * ⚠️ **`source_rating` შენი ქულა არ არის** (`rating`, 1–10) — ეს წყაროს საშუალოა
 * (Google 1–5, მეათედებით) და `source_rating_count` — რამდენ შეფასებაზეა. ორი
 * სხვადასხვა ფაქტია და ერთ სვეტში არ ერევა.
 * ⚠️ სამუშაო საათები JSON-სიაა („ორშაბათი: 09:00–22:00", …) — Google ასე
 * აბრუნებს ენით და ამის თავიდან აწყობა კვირის დღეებად ზედმეტია.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('places', function (Blueprint $table) {
            $table->string('phone', 60)->nullable()->after('country');
            $table->string('website', 500)->nullable()->after('phone');
            $table->json('opening_hours')->nullable()->after('website');
            $table->decimal('source_rating', 2, 1)->nullable()->after('rating');
            $table->unsignedInteger('source_rating_count')->nullable()->after('source_rating');
        });
    }

    public function down(): void
    {
        Schema::table('places', function (Blueprint $table) {
            $table->dropColumn(['phone', 'website', 'opening_hours', 'source_rating', 'source_rating_count']);
        });
    }
};
