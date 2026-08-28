<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * სერიალების დომენი — movies-ის ანალოგიური, თავიდანვე ნორმალიზებული
 * (ორენოვანი ტექსტი series_translations-ში; ჟანრი/მსახიობი polymorphic
 * genreables/castables-ში type='series'-ით). TV-ს არ აქვს TMDB კოლექცია,
 * ამიტომ ფრანჩაიზის ველები აქ არ არის; სამაგიეროდ seasons/episodes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('series', function (Blueprint $table) {
            $table->id();

            $table->unsignedSmallInteger('year')->nullable(); // პირველი ეთერის წელი

            // გარე იდენტიფიკატორები
            $table->string('imdb_id', 15)->nullable()->unique();
            $table->string('imdb_url')->nullable();
            $table->unsignedInteger('tmdb_id')->nullable();
            $table->string('ge_url', 500)->nullable();
            $table->unsignedInteger('ge_id')->nullable();

            $table->decimal('rating', 3, 1)->nullable();
            $table->unsignedSmallInteger('runtime')->nullable();  // ეპიზოდის საშ. ხანგრძლივობა
            $table->unsignedSmallInteger('seasons')->nullable();
            $table->unsignedSmallInteger('episodes')->nullable();

            // პოსტერი
            $table->string('poster_path')->nullable();
            $table->enum('poster_source', ['tmdb', 'ge_movie', 'upload'])->nullable();

            // მდგომარეობა
            $table->enum('status', ['undecided', 'to_watch', 'watching', 'watched'])->default('undecided');
            $table->boolean('is_favorite')->default(false);
            $table->timestamp('watched_at')->nullable();
            $table->integer('sort_order')->default(0);
            $table->enum('sync_status', ['pending', 'synced', 'partial', 'failed'])->default('pending');

            $table->timestamps();

            $table->index('status');
            $table->index('year');
            $table->index('tmdb_id');
            $table->index('is_favorite');
        });

        Schema::create('series_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('series_id')->constrained('series')->cascadeOnDelete();
            $table->string('locale', 5);
            $table->string('title')->nullable();
            $table->text('description')->nullable();
            $table->string('source')->nullable(); // ge_movie|tmdb|translated|manual
            $table->timestamps();

            $table->unique(['series_id', 'locale']);
            // fullText მხოლოდ MySQL-ზე — ტესტები sqlite :memory:-ზე გადის
            if (Schema::getConnection()->getDriverName() === 'mysql') {
                $table->fullText('title');
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('series_translations');
        Schema::dropIfExists('series');
    }
};
