<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **სიმღერას ხანგრძლივობა აღარ აქვს.**
 *
 * შენი სიტყვები: „სიმღერებში არ მინდა ხანგრძლივობა". დამკვრელი ხანგრძლივობას
 * თვითონ მედიიდან კითხულობს, სიაში და ფორმაში კი ველი ზედმეტი იყო. ძველი
 * ექსპორტის `duration` იმპორტისას თავისით გამოტოვდება (`MediarySchema::columns()`
 * მხოლოდ ნამდვილ სვეტებს წერს).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('songs', function (Blueprint $table) {
            $table->dropColumn('duration');
        });
    }

    public function down(): void
    {
        Schema::table('songs', function (Blueprint $table) {
            $table->unsignedInteger('duration')->nullable()->after('year');
        });
    }
};
