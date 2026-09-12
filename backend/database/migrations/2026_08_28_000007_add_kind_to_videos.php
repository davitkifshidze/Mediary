<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * K7 — ვიდეოს ტიპი საიდბარის სექციებისთვის:
 *   media — გასართობი (მუსიკა, კლიპი, ფილმი)
 *   info  — ინფორმაციული (გაკვეთილი, ლექცია, მიმოხილვა)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->enum('kind', ['media', 'info'])->default('media')->after('description');
            $table->index(['user_id', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'kind']);
            $table->dropColumn('kind');
        });
    }
};
