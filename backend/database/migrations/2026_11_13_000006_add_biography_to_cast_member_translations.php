<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **მსახიობის ქართული ბიოგრაფია და „ვინ დაწერა" ქართულ ტექსტზე.**
 *
 * `cast_member_translations` აქამდე მხოლოდ სახელს ინახავდა: ბიოგრაფია მხოლოდ
 * ინგლისურად იყო (`cast_members.biography`), ქართულ სახელს კი მხოლოდ TMDB ავსებდა —
 * იქ, სადაც ქართული სახელი არ არის, მსახიობი ლათინურად რჩებოდა.
 *
 * `biography` — ქართული ბიოგრაფია (თარგმანი ან TMDB-ის ტექსტი, თუ ოდესმე ექნება).
 * `name_source` / `biography_source` — რამ დაწერა ტექსტი: `tmdb` · `translation`
 * (მანქანამ — **გადასამოწმებელია**) · `manual` (ადამიანმა დაწერა ან დაადასტურა).
 * `null` — ძველი რიგი: წყარო უცნობია და გადასამოწმებლად არ ითვლება.
 *
 * ⚠️ `name` ნებადართულად ცარიელი ხდება: ქართული ბიოგრაფია შეიძლება არსებობდეს მაშინაც,
 * როცა ქართული სახელი ჯერ არ არის (ორი ნაწილი ცალ-ცალკე ეშვება).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cast_member_translations', function (Blueprint $table) {
            $table->string('name')->nullable()->change();
            $table->text('biography')->nullable()->after('name');
            $table->string('name_source', 20)->nullable()->after('biography');
            $table->string('biography_source', 20)->nullable()->after('name_source');
        });
    }

    public function down(): void
    {
        Schema::table('cast_member_translations', function (Blueprint $table) {
            $table->dropColumn(['biography', 'name_source', 'biography_source']);
        });
    }
};
