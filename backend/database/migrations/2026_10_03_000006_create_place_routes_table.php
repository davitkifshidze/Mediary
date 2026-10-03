<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ადგილის შენახული მარშრუტები** (Tasks §30.4).
 *
 * მარშრუტს OSRM-ის საჯარო სერვერი ითვლის (`RouteClient`) და ის **ყოველთვის
 * მომხმარებლის მიმდინარე მდებარეობიდან** იწყება (`from_lat`/`from_lng`,
 * ბრაუზერის გეოლოკაცია) — სხვა საწყისი წერტილი არ არსებობს (შენი სიტყვები:
 * „არ ურევდე სხვა წერტილს"). შენახვისას გეომეტრია **polyline-ად** (precision
 * 5) ინახება: კომპაქტურია და კლიენტი თვითონ შლის (`lib/polyline.ts`).
 *
 * ⚠️ რამდენიმე მარშრუტი თითო ადგილზე — სახელით („სახლიდან", „სამსახურიდან").
 * ⚠️ `trashed_at` — ურნა იმავე წესით, რაც ადგილის ფაილს (`TrashDomain::ITEMS`,
 * `place_route`); მშობლის საბოლოო წაშლა მასაც შლის (`Place::booted()`).
 * ⚠️ რუკის ბიბლიოთეკა (Leaflet) ამ მიგრაციასთან ერთად შემოვიდა — 2026-09-21-ის
 * „მოგვიანებით" (`create_places_module`) სწორედ ეს ტასქია.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('place_routes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('place_id')->constrained()->cascadeOnDelete();

            $table->string('name', 120);
            // `driving` · `foot` · `bike` — OSRM-ის პროფილები (`RouteClient::PROFILES`)
            $table->string('profile', 12)->default('driving');
            $table->unsignedInteger('distance_m')->default(0);
            $table->unsignedInteger('duration_s')->default(0);
            $table->decimal('from_lat', 10, 7);
            $table->decimal('from_lng', 10, 7);
            // polyline5 — 1000 კმ-იანი მარშრუტიც ~50 KB-ია, `mediumText` ზღვარს არ ეხება
            $table->mediumText('geometry');
            $table->timestamp('chosen_at')->nullable();

            $table->timestamp('trashed_at')->nullable()->index();
            $table->timestamps();

            $table->index(['place_id', 'trashed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('place_routes');
    }
};
