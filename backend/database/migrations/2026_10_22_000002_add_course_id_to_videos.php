<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ვიდეოს კურსი — „საქაღალდე" ვიდეოებში.**
 *
 * კურსი თავისი ფლეილისტის ვიდეოებს ვიდეოების მოდულში აგროვებს: საქაღალდის
 * სახელი, ფოტო და რიცხვი კურსისაა, ცალკე ლექსიკონი არ არსებობს. ტიპი
 * (`type_id`) თავისი მნიშვნელობით რჩება — ეს მეორე, დამოუკიდებელი ღერძია.
 *
 * ⚠️ `nullOnDelete` მხოლოდ **საბოლოო** წაშლაზე მუშაობს: კურსი ურნაში —
 * საქაღალდე იმალება (`trash` scope), ვიდეოები და მათი ლოკალური ასლები
 * (ძვირი ჩამოსატვირთია) რჩება; აღდგენაზე საქაღალდე ბრუნდება.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->foreignId('course_id')->nullable()->after('type_id')
                ->constrained('courses')->nullOnDelete();

            $table->index(['user_id', 'course_id']);
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'course_id']);
            $table->dropConstrainedForeignId('course_id');
        });
    }
};
