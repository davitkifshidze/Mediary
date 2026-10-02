<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks §40.2 — **გაზიარების ბმული.**
 *
 * მფლობელი ბმულს ქმნის, სხვა ადამიანი მისით მის ფილმებს, სერიალებსა და
 * ანიმეს ხედავს (ფარგლებით — `domains`).
 *
 * ⚠️ **ტოკენი ორჯერ ინახება და ეს განზრახაა.** `token_hash` (`sha256`,
 * unique) ძებნისთვისაა — ბმული **ყოველთვის** ჰეშით მოიძებნება; `token`
 * (დაშიფრული) კი მხოლოდ იმისთვის, რომ მფლობელმა ბმული სიიდან ხელახლა
 * დააკოპიროს. `ResetLink` მხოლოდ ჰეშს ინახავს, რადგან ის ერთხელ ჩანს.
 * ⚠️ `APP_KEY`-ის ცვლილება ამიტომ ბმულს **არ** ამტვრევს — მხოლოდ მის
 * ხელახლა ჩვენებას (`ShareLink::plainToken()` → `null`).
 *
 * ⚠️ **`visibility` სვეტი არ აქვს**: ეს შიგთავსი არაა — თვითონაა
 * ხილვადობის მექანიზმი.
 *
 * ⚠️ **ყველა დროის სვეტი nullable-ია** — MariaDB 10.4-ზე ცხრილის პირველი
 * `NOT NULL` TIMESTAMP ჩუმად `ON UPDATE CURRENT_TIMESTAMP`-ს იღებს
 * (`trashed_files.trashed_at`-ის გაკვეთილი), ე.ი. ყოველი `UPDATE` ვადას
 * გადაწევდა.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('share_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // მფლობელის წარწერა („მეგობრისთვის") — მიმღებს არ უჩანს
            $table->string('name', 80)->nullable();
            $table->char('token_hash', 64)->unique();
            $table->text('token');
            // თითო დომენის ფარგლები — `ShareScope::normalize()`-ის ფორმით
            $table->json('domains');
            $table->boolean('show_status')->default(true);
            $table->boolean('show_rating')->default(true);
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->unsignedInteger('views')->default(0);
            $table->unsignedInteger('imports')->default(0);
            $table->timestamp('last_opened_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('share_links');
    }
};
