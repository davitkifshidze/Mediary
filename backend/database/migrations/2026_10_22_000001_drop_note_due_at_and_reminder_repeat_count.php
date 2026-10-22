<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ჩანაწერის „როდისთვის მჭირდება" და შეხსენების „ჯერადობა" იშლება.**
 *
 *  · `note_entries.due_at` შეხსენებებთან კავშირი არ ჰქონია (მათ თავისი
 *    `remind_at`/`starts_at`/`ends_at` აქვთ) — ის მხოლოდ დალაგებას, „ვადაგადაცილებულის"
 *    ფილტრსა და ბეჯს კვებავდა. ჩანაწერზე ახლა „დამატებულია" ჩანს (`created_at`).
 *    ⚠️ არსებული მნიშვნელობები სვეტთან ერთად იკარგება; ძველი ექსპორტის `due_at`-ს
 *    იმპორტი ისედაც გამოტოვებს (`MediaryWriter` მხოლოდ არსებულ სვეტებს წერს).
 *  · `note_reminders.repeat_count` ხელით იწერებოდა, თუმცა „რამდენჯერ" განრიგიდან
 *    და ფანჯრიდან გამოდის — ახლა ითვლება (`NoteReminder::plannedCount()`);
 *    ფანჯრის ბოლო რიცხვს თვითონ წყვეტს. ⚠️ ამოწურული შეხსენება უკვე
 *    არააქტიურია და `next_at`-ის გარეშეა — სვეტის წაშლა მას არ აცოცხლებს.
 *
 * ⚠️ `(user_id, due_at)` ინდექსი **სვეტამდე** იშლება — MySQL ინდექსიან სვეტს
 * ცალკე ვერ ჩამოაგდებს; `user_id`-ის გარე გასაღებს სხვა ინდექსები ფარავს.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('note_entries', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'due_at']);
        });
        Schema::table('note_entries', function (Blueprint $table) {
            $table->dropColumn('due_at');
        });

        Schema::table('note_reminders', function (Blueprint $table) {
            $table->dropColumn('repeat_count');
        });
    }

    public function down(): void
    {
        Schema::table('note_entries', function (Blueprint $table) {
            $table->dateTime('due_at')->nullable();
            $table->index(['user_id', 'due_at']);
        });

        Schema::table('note_reminders', function (Blueprint $table) {
            $table->unsignedInteger('repeat_count')->nullable()->after('is_active');
        });
    }
};
