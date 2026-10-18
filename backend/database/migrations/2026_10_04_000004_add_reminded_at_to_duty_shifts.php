<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **მორიგეობის შეხსენება წინა დღეს.**
 *
 * `reminded_at` — როდის გაეგზავნა შეხსენება („ხვალ მორიგეობა გაქვს“). ⚠️ ის
 * **დაჭერის ნიშანიცაა** (`DutyReminder`): ორი გამომძახებელი (cron და ღია ტაბის
 * polling) ერთ მორიგეობას ორჯერ ვერ შეახსენებს — პირობითი UPDATE მხოლოდ
 * `NULL`-ზე იჭერს. თარიღის შეცვლა მას ანულებს (ახალ დღეს ახალი შეხსენება).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('duty_shifts', function (Blueprint $table) {
            $table->timestamp('reminded_at')->nullable()->after('is_favorite');
        });
    }

    public function down(): void
    {
        Schema::table('duty_shifts', function (Blueprint $table) {
            $table->dropColumn('reminded_at');
        });
    }
};
