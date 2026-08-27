<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('movie_cast', function (Blueprint $table) {
            $table->foreignId('movie_id')->constrained()->cascadeOnDelete();
            $table->foreignId('cast_member_id')->constrained()->cascadeOnDelete();
            $table->string('character')->nullable();
            $table->unsignedSmallInteger('billing_order')->default(0);
            $table->primary(['movie_id', 'cast_member_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('movie_cast');
    }
};
