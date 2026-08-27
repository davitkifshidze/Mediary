<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('movies', function (Blueprint $table) {
            $table->unsignedInteger('tmdb_collection_id')->nullable()->after('tmdb_id');
            $table->string('collection_name')->nullable()->after('tmdb_collection_id');
            $table->index('tmdb_collection_id');
        });
    }

    public function down(): void
    {
        Schema::table('movies', function (Blueprint $table) {
            $table->dropIndex(['tmdb_collection_id']);
            $table->dropColumn(['tmdb_collection_id', 'collection_name']);
        });
    }
};
