<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('movies', function (Blueprint $table) {
            $table->id();

            // სახელები (ორენოვანი)
            $table->string('title_ka')->nullable();
            $table->string('title_en')->nullable();

            $table->unsignedSmallInteger('year')->nullable();

            // გარე იდენტიფიკატორები
            $table->string('imdb_id', 15)->nullable()->unique();
            $table->string('imdb_url')->nullable();
            $table->unsignedInteger('tmdb_id')->nullable();
            $table->string('ge_url', 500)->nullable();
            $table->unsignedInteger('ge_id')->nullable();

            // აღწერები (ორენოვანი) + წყარო
            $table->text('description_ka')->nullable();
            $table->text('description_en')->nullable();
            $table->enum('description_ka_source', ['ge_movie', 'translated', 'manual'])->nullable();
            $table->enum('description_en_source', ['tmdb', 'translated', 'manual'])->nullable();

            $table->decimal('rating', 3, 1)->nullable();
            $table->unsignedSmallInteger('runtime')->nullable();

            // პოსტერი
            $table->string('poster_path')->nullable();
            $table->enum('poster_source', ['tmdb', 'ge_movie', 'upload'])->nullable();

            // მდგომარეობა
            $table->enum('status', ['to_watch', 'watching', 'watched'])->default('to_watch');
            $table->boolean('is_favorite')->default(false);
            $table->timestamp('watched_at')->nullable();
            $table->integer('sort_order')->default(0);
            $table->enum('sync_status', ['pending', 'synced', 'partial', 'failed'])->default('pending');

            $table->timestamps();

            $table->index('status');
            $table->index('year');
            $table->index('tmdb_id');
            $table->index('is_favorite');
            $table->fullText(['title_ka', 'title_en']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('movies');
    }
};
