<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **შესვლების ჟურნალი — ყველა ჩანაწერზე** (Tasks §10, Q2).
 *
 * შენი სიტყვები: „ფილმებში მინდა შესვლების მთვლელი; ეს მთვლელი მჭირდება
 * აბსოლუტურად ყველგან და ყველაფერზე, და ამის ლოგებიც — ვინ, სად შევიდა,
 * რამდენჯერ". თითო რიგი თითო **შესვლაა** (დეტალის გახსნა), და არა ყურება
 * (`media_watches`), დაკვრა (`songs.play_count`) ან ბმულის გახსნა
 * (`bookmarks.visit_count`) — ისინი რჩება და სხვა ფაქტს ზომავს.
 *
 * - `owner_id` — ვისი ჩანაწერია (სხვისი ნახვა შენს ჩანაწერზე **შენ** უნდა
 *   დაინახო, ე.ი. წაკითხვა მფლობელით იფილტრება და არა მნახველით);
 * - `user_id` — ვინ შევიდა; `null` ანონიმია (საჯარო პროფილი, გაზიარების
 *   ბმული); ანგარიშის წაშლაზე `null` ხდება, სახელი კი `viewer_name`-ში რჩება;
 * - `visitable_*` — morph (`Relation::enforceMorphMap()`-ის ალიასით);
 * - `source` — `library` (შენი ბიბლიოთეკა) · `public` (საჯარო პროფილი) · `share`.
 *
 * ⚠️ **ურნა არ სჭირდება** (`RegistryConsistencyTest::NOT_TRASHED`): ჟურნალი
 * ჩანაწერს ეკუთვნის და მასთან ერთად ქრება (`HasVisits::deleting`).
 * ⚠️ **აუდიტში არ იწერება** (`AuditRegistry::NOT_LOGGED`): ყოველი გახსნა
 * ლოგში „შეიქმნა"-დ ჩაიწერებოდა და §4-ის გვერდს დამარხავდა.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('record_visits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('viewer_name', 120)->nullable();
            $table->string('visitable_type', 40);
            $table->unsignedBigInteger('visitable_id');
            $table->string('source', 10)->default('library');
            // ⚠️ `dateTime` და არა `timestamp`: MariaDB პირველ TIMESTAMP სვეტს `ON UPDATE current_timestamp()`-ს უწერს
            $table->dateTime('visited_at');

            $table->index(['visitable_type', 'visitable_id', 'visited_at'], 'record_visits_target_idx');
            // საათში ერთხელ თითო მნახველზე — დედუპლიკაციის კითხვა
            $table->index(['visitable_type', 'visitable_id', 'user_id', 'visited_at'], 'record_visits_dedupe_idx');
            $table->index(['owner_id', 'visited_at'], 'record_visits_owner_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('record_visits');
    }
};
