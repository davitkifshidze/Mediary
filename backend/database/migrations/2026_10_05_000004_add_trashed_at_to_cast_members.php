<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks §35.9 (Q17) — ხელით შექმნილი მსახიობი ურნაში.**
 *
 * `cast_members` გლობალური ლექსიკონია და ურნის რეესტრი მოდულებზეა აწყობილი,
 * ამიტომ მსახიობს `trashed_at` აქამდე არ სჭირდებოდა. ურნაში მხოლოდ **კერძო**
 * მსახიობი გადადის (ხელით შექმნილი, TMDB-ის გარეშე — ის მხოლოდ შემქმნელს
 * უჩანს), ე.ი. სვეტი სხვა ანგარიშის ხედვას არ ცვლის. ⚠️ ინდექსი: `CastMember`-ის
 * `trash` scope ყოველ მოთხოვნას ამ სვეტით ჭრის.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cast_members', function (Blueprint $table) {
            $table->timestamp('trashed_at')->nullable()->after('created_by')->index();
        });
    }

    public function down(): void
    {
        Schema::table('cast_members', function (Blueprint $table) {
            $table->dropIndex(['trashed_at']);
            $table->dropColumn('trashed_at');
        });
    }
};
