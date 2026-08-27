<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // ახალი სტატუსი „გადაუწყვეტელი“ — და გახდეს ნაგულისხმევი ახლადდამატებულებზე
        DB::statement("ALTER TABLE movies MODIFY COLUMN status ENUM('undecided','to_watch','watching','watched') NOT NULL DEFAULT 'undecided'");
    }

    public function down(): void
    {
        // ჯერ დავაბრუნოთ ნებისმიერი „undecided“ to_watch-ზე, რომ enum-ის შევიწროება არ ჩავარდეს
        DB::table('movies')->where('status', 'undecided')->update(['status' => 'to_watch']);
        DB::statement("ALTER TABLE movies MODIFY COLUMN status ENUM('to_watch','watching','watched') NOT NULL DEFAULT 'to_watch'");
    }
};
