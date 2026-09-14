<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * მსახიობის ხელით დამატება ჩანაწერზე — ეტაპი 1 (2026-09-13).
 *
 * ⚠️ **ეს ერთი სვეტი მთელი ფუნქციონალის მზიდია.** `MovieEnricher`,
 * `TvEnricher` და `ItemSyncer` მსახიობებს `$record->cast()->sync($sync)`-ით
 * წერენ, ე.ი. **ყველაფერი, რაც TMDB-ის სიაში არ არის, ითიშება**. ხელით
 * დამატებული მსახიობი პირველივე `/sync`-ზე ჩუმად გაქრებოდა და მიზეზი
 * არსად გამოჩნდებოდა — არც შეცდომა, არც ლოგი.
 *
 * `is_manual = true` ნიშნავს „ეს ბმული ადამიანმა გააკეთა და წყაროს
 * განახლება მას ვერ შლის". სამივე ადგილი ახლა ერთ ფუნქციას გაივლის
 * (`App\Support\CastSync::fromSource()`), თორემ სამი ასლიდან ერთი
 * აუცილებლად დარჩებოდა ძველზე.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('castables', function (Blueprint $table) {
            $table->boolean('is_manual')->default(false)->after('billing_order');
        });
    }

    public function down(): void
    {
        Schema::table('castables', function (Blueprint $table) {
            $table->dropColumn('is_manual');
        });
    }
};
