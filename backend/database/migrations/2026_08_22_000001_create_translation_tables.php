<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('movie_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('movie_id')->constrained()->cascadeOnDelete();
            $table->string('locale', 5);
            $table->string('title')->nullable();
            $table->text('description')->nullable();
            $table->string('source')->nullable(); // ge_movie|tmdb|translation|manual (BUG-17 — `translated` აღარ არის)
            $table->timestamps();

            $table->unique(['movie_id', 'locale']);
            // fullText მხოლოდ MySQL-ზე — ტესტები sqlite :memory:-ზე გადის
            if (Schema::getConnection()->getDriverName() === 'mysql') {
                $table->fullText('title');
            }
        });

        Schema::create('genre_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('genre_id')->constrained()->cascadeOnDelete();
            $table->string('locale', 5);
            $table->string('name', 100);
            $table->timestamps();

            $table->unique(['genre_id', 'locale']);
        });

        Schema::create('cast_member_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cast_member_id')->constrained()->cascadeOnDelete();
            $table->string('locale', 5);
            $table->string('name');
            $table->timestamps();

            $table->unique(['cast_member_id', 'locale']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cast_member_translations');
        Schema::dropIfExists('genre_translations');
        Schema::dropIfExists('movie_translations');
    }
};
