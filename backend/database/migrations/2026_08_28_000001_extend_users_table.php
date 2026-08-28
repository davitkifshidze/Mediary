<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * I7 / ეტაპი 1 — პროფილი + როლი + per-user პარამეტრები.
 * `name` რჩება (Laravel-ის default-ს ეყრდნობა), first/last მას ავსებს.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('first_name')->nullable()->after('name');
            $table->string('last_name')->nullable()->after('first_name');
            $table->string('username')->nullable()->unique()->after('last_name');
            $table->string('avatar_path')->nullable()->after('username');
            $table->enum('role', ['super_admin', 'user'])->default('user')->after('avatar_path');
            $table->boolean('is_active')->default(true)->after('role');
            // E1-ის localStorage-ის (mediary.settings.v1) backend-ის ანალოგი
            $table->json('settings')->nullable()->after('is_active');

            $table->index('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['role']);
            $table->dropUnique(['username']);
            $table->dropColumn(['first_name', 'last_name', 'username', 'avatar_path', 'role', 'is_active', 'settings']);
        });
    }
};
