<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ხილვადობის სვეტი არსებულ დომენებზე.
 *
 * მთელი 16 (საჯარო პროფილები, დამთხვევები, ჩატი) მოგვიანებით გაეშვება; ახლა
 * მხოლოდ **სქემა** ვამზადებთ, რომ მერე მიგრაციების ტალღა არ დაგვჭირდეს.
 * `videos.visibility` უკვე არსებობდა — აქ ფილმები და სერიალები ეწევა.
 *
 * ⚠️ ნაგულისხმევი **`private`-ია**: არავინ ხდება საჯარო ჩუმად. ინტერფეისში
 * გადამრთველი 16.1-თან ერთად დაემატება.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['movies', 'series'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->string('visibility', 20)->default('private')->after('is_favorite');
                // cross-user join-ისთვის — ხილვადობა+სტატუსი ერთად იფილტრება
                $t->index(['visibility', 'status']);
            });
        }
    }

    public function down(): void
    {
        foreach (['movies', 'series'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropIndex(['visibility', 'status']);
                $t->dropColumn('visibility');
            });
        }
    }
};
