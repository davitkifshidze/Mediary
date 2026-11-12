<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ფრანჩაიზის ნაწილები და შეხსენებები.**
 *
 * ფილმზე ინახებოდა მხოლოდ `tmdb_collection_id` და `collection_name`; ნაწილების სია
 * არსად — ფილმის გვერდი მას ყოველ გახსნაზე TMDB-ს ეკითხებოდა და გამოუსვლელ
 * (უპოსტერო) ნაწილებს აგდებდა. „რომელი ნაწილი მაკლია" ამიტომ ვერსად ითვლებოდა.
 *
 * `franchise_parts` — TMDB-ის ფაქტები, **გლობალური** ლექსიკონი (`tv_episodes`-ისა და
 * `cast_members`-ის რიგში): ერთი ფრანჩაიზი ყველა ანგარიშზე ერთი და იგივეა.
 * `checked_at` ამბობს, როდის შემოწმდა ფრანჩაიზი ბოლოს.
 *
 * `franchise_reminders` — **ჩემია**: რა მეცნობა უკვე (`notified_at` — თითო დაუმატებელ
 * ნაწილზე ერთი შეტყობინება) და რაზე ვთქვი „აღარ შემახსენო" (`muted_at`).
 * ⚠️ `tmdb_id = 0` მთელ ფრანჩაიზს ნიშნავს: უნიკალური ინდექსი `NULL`-ებს ერთმანეთისგან
 * ვერ არჩევს, ნული კი ნამდვილი მნიშვნელობაა.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('franchise_parts')) {
            Schema::create('franchise_parts', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('tmdb_collection_id')->index();
                $table->string('collection_name')->nullable();
                $table->unsignedBigInteger('tmdb_id');
                $table->string('title');
                $table->date('release_date')->nullable();
                // TMDB-ის CDN-ის ფარდობითი გზა (`/abc.jpg`) — ჩვენს დისკზე ფაილი არ დევს;
                // გამოუსვლელ ნაწილს ხშირად არ აქვს
                $table->string('tmdb_poster')->nullable();
                $table->text('overview')->nullable();
                $table->decimal('rating', 3, 1)->nullable();
                $table->timestamp('checked_at')->nullable();
                $table->timestamps();

                $table->unique(['tmdb_collection_id', 'tmdb_id']);
            });
        }

        if (! Schema::hasTable('franchise_reminders')) {
            Schema::create('franchise_reminders', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->unsignedBigInteger('tmdb_collection_id');
                $table->unsignedBigInteger('tmdb_id')->default(0);
                $table->timestamp('notified_at')->nullable();
                $table->timestamp('muted_at')->nullable();
                $table->timestamps();

                $table->unique(['user_id', 'tmdb_collection_id', 'tmdb_id'], 'franchise_reminders_unique');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('franchise_reminders');
        Schema::dropIfExists('franchise_parts');
    }
};
