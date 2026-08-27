<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ჟანრი ↔ ნებისმიერი დომენი (movie/series/anime)
        Schema::create('genreables', function (Blueprint $table) {
            $table->foreignId('genre_id')->constrained()->cascadeOnDelete();
            $table->morphs('genreable'); // genreable_id + genreable_type (+index)
            $table->primary(['genre_id', 'genreable_id', 'genreable_type'], 'genreables_primary');
        });

        // მსახიობი ↔ ნებისმიერი დომენი, pivot მონაცემებით
        Schema::create('castables', function (Blueprint $table) {
            $table->foreignId('cast_member_id')->constrained()->cascadeOnDelete();
            $table->morphs('castable'); // castable_id + castable_type (+index)
            $table->string('character')->nullable();
            $table->unsignedSmallInteger('billing_order')->default(0);
            $table->primary(['cast_member_id', 'castable_id', 'castable_type'], 'castables_primary');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('castables');
        Schema::dropIfExists('genreables');
    }
};
