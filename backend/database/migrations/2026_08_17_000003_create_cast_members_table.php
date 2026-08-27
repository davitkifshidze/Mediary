<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cast_members', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('tmdb_person_id')->nullable()->unique();
            $table->string('name');              // ორიგინალი (ლათინური)
            $table->string('name_ka')->nullable(); // ქართული (transliteration)
            $table->string('photo_path')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cast_members');
    }
};
