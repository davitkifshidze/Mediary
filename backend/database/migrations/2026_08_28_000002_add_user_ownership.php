<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * I7 / ეტაპი 2 — მფლობელობა (ვარიანტი A: per-user რიგები).
 *
 * `imdb_id`-ის გლობალური unique იშლება: ორმა მომხმარებელმა ერთი და იგივე ფილმი
 * რომ დაამატოს, უნიკალურობა user-ის ფარგლებში უნდა იყოს.
 *
 * არსებული ჩანაწერები პირველ super_admin-ს მიება (Tasks I1).
 */
return new class extends Migration
{
    public function up(): void
    {
        $ownerId = $this->ownerId();

        foreach (['movies', 'series'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->foreignId('user_id')->nullable()->after('id')->constrained()->cascadeOnDelete();
            });

            DB::table($table)->whereNull('user_id')->update(['user_id' => $ownerId]);

            Schema::table($table, function (Blueprint $t) {
                $t->unsignedBigInteger('user_id')->nullable(false)->change();
                $t->dropUnique(['imdb_id']);
                $t->unique(['user_id', 'imdb_id']);
                $t->index(['user_id', 'status']);
                $t->index(['user_id', 'year']);
            });
        }
    }

    public function down(): void
    {
        foreach (['movies', 'series'] as $table) {
            Schema::table($table, function (Blueprint $t) use ($table) {
                $t->dropIndex([$table === 'movies' ? 'movies_user_id_year_index' : 'series_user_id_year_index']);
                $t->dropIndex([$table === 'movies' ? 'movies_user_id_status_index' : 'series_user_id_status_index']);
                $t->dropUnique(['user_id', 'imdb_id']);
                $t->dropConstrainedForeignId('user_id');
                $t->unique('imdb_id');
            });
        }
    }

    /**
     * ვის მიება არსებული ჩანაწერები: პირველი super_admin → პირველი user.
     * თუ ჩანაწერები არსებობს და მომხმარებელი არა — მიგრაცია ჩერდება გასაგები შეტყობინებით.
     */
    private function ownerId(): ?int
    {
        $id = DB::table('users')->where('role', 'super_admin')->orderBy('id')->value('id')
            ?? DB::table('users')->orderBy('id')->value('id');

        if ($id) {
            return (int) $id;
        }

        $rows = DB::table('movies')->count() + DB::table('series')->count();
        if ($rows > 0) {
            throw new RuntimeException(
                "მიგრაცია შეჩერდა: ბაზაში {$rows} ჩანაწერია, მაგრამ არც ერთი მომხმარებელი. ".
                'ჯერ გაუშვი `php artisan mediary:bootstrap-admin`, მერე `php artisan migrate`.'
            );
        }

        return null; // ცარიელი ბაზა (migrate:fresh) — მისაბმელი არაფერია
    }
};
