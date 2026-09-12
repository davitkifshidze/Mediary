<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks 17.4 — **ლიმიტის გაზრდის მოთხოვნა**.
 *
 * ახალი ნაკადი არ იქმნება: მოთხოვნა იმავე `approval_requests`-ში ჯდება
 * ახალი ტიპით `storage_increase`, ე.ი. `/requests`-ის სია, badge-ის
 * მრიცხველი და `AdminRequestController::approve()` ისედაც მუშაობს.
 *
 * ⚠️ `type` **enum-იდან string-ზე გადადის**. მიზეზი პრაქტიკულია: enum-ზე
 * ყოველი ახალი ტიპი ცალკე მიგრაციაა და sqlite-ზე (ტესტები) enum `check`
 * შეზღუდვად იწერება — ე.ი. ძველ შეზღუდვას ახალი მნიშვნელობა არ გაუვლიდა.
 * ტიპების ნაკრები ისედაც კოდშია (`ApprovalRequest::TYPE_*`) და
 * ვალიდაცია კონტროლერშია, ბაზას მისი გამეორება არ სჭირდება.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('approval_requests', function (Blueprint $table) {
            $table->string('type', 30)->change();
        });
    }

    public function down(): void
    {
        Schema::table('approval_requests', function (Blueprint $table) {
            $table->enum('type', ['module_access', 'genre_delete'])->change();
        });
    }
};
