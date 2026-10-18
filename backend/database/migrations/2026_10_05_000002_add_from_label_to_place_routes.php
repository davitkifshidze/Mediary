<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **შენახული მარშრუტის „საიდან".**
 *
 * აქამდე საწყისი ყოველთვის გეოლოკაცია იყო და სახელი არ სჭირდებოდა; ახლა ის
 * შეიძლება იყოს „სახლი", მისამართი, ჩემი სხვა ადგილი ან რუკაზე მონიშნული წერტილი —
 * სიაში „საიდან: სახლი" იკითხება, „41.6237, 41.5942" კი — არა. ⚠️ არასავალდებულოა:
 * ძველ მარშრუტებს არ აქვს და კლიენტი მათზე კოორდინატებს წერს.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('place_routes', function (Blueprint $table) {
            $table->string('from_label', 160)->nullable()->after('from_lng');
        });
    }

    public function down(): void
    {
        Schema::table('place_routes', function (Blueprint $table) {
            $table->dropColumn('from_label');
        });
    }
};
