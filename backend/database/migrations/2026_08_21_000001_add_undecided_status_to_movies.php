<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ახალი სტატუსი „გადაუწყვეტელი“ — და გახდეს ნაგულისხმევი ახლადდამატებულებზე.
        // ENUM-ის შეცვლა MySQL-სპეციფიკურია; sqlite-ზე (ტესტები) enum ისედაც string-ია,
        // ამიტომ იქ მხოლოდ default-ს ვცვლით.
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE movies MODIFY COLUMN status ENUM('undecided','to_watch','watching','watched') NOT NULL DEFAULT 'undecided'");

            return;
        }

        Schema::table('movies', function (Blueprint $table) {
            $table->string('status')->default('undecided')->change();
        });
    }

    public function down(): void
    {
        // ჯერ დავაბრუნოთ ნებისმიერი „undecided“ to_watch-ზე, რომ enum-ის შევიწროება არ ჩავარდეს
        DB::table('movies')->where('status', 'undecided')->update(['status' => 'to_watch']);

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE movies MODIFY COLUMN status ENUM('to_watch','watching','watched') NOT NULL DEFAULT 'to_watch'");

            return;
        }

        Schema::table('movies', function (Blueprint $table) {
            $table->string('status')->default('to_watch')->change();
        });
    }
};
