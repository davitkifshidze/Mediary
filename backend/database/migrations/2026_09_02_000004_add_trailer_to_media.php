<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks 9 — ტრეილერის ბმული ფილმზე და სერიალზე.
 *
 * ინახება **სრული URL** (და არა YouTube-ის key), რომ `App\Support\VideoUrl`-მა
 * იგივე allowlist-ით ააგოს embed, რითიც ვიდეოს მოდული მუშაობს — ე.ი. ტრეილერზეც
 * ერთი და იგივე დამკვრელი მუშაობს და HTML არსად არ ინახება.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['movies', 'series'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->string('trailer_url', 500)->nullable()->after('imdb_url');
            });
        }
    }

    public function down(): void
    {
        foreach (['movies', 'series'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropColumn('trailer_url');
            });
        }
    }
};
