<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **მორიგეობის სტატუსი — დაგეგმილი · გაუქმებული · ნაწილობრივი.**
 *
 * „ჩავხურე დღე და წამოვედი" — დღე არ უნდა გაქრეს (ურნა მას შლიდა), უნდა
 * დარჩეს წითლად და თანხა 0 იყოს; „ვიმუშავე 10 საათი" — საათები და თანხა ხელით.
 * ⚠️ ეს ჩვეულებრივი `enum`-სვეტია (წიგნის/თამაშის წესით) და არა პერსონალური
 * სტატუსების ლექსიკონი — მნიშვნელობები ლოგიკაა (თანხა, ჯამი, შეხსენება).
 * არსებული მორიგეობები დაგეგმილია (ნაგულისხმევი).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('duty_shifts', function (Blueprint $table) {
            $table->string('status', 12)->default('scheduled')->after('type_id');
        });
    }

    public function down(): void
    {
        Schema::table('duty_shifts', function (Blueprint $table) {
            $table->dropColumn('status');
        });
    }
};
