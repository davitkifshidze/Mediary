<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **გაზიარების ბმულით მიღებული პლეილისტის წყარო (Tasks §40.13, Q53 — „გ").**
 *
 * მიმღებთან ბმულიდან დამატებული პლეილისტი **ასლია** — ის, რაც მას „უკვე
 * გაქვს"-ად აქცევს, ამ სვეტშია: გამზიარებლის პლეილისტის id.
 *
 * ⚠️ **სახელით შედარება არ გამოდგება**: „რჩეული", „სავარჯიშო", „გზაში" —
 * ჩვეულებრივი სახელებია, და მეგობრის პლეილისტი ჩემს საკუთარ, თანამოსახელე
 * პლეილისტში ჩაიღვრებოდა. ამიტომ წყარო ცხადად ინახება.
 * ⚠️ **FK არ აქვს** — წყარო სხვა ანგარიშისაა და შეიძლება წაიშალოს; ასლი მაშინაც
 * მიმღების პლეილისტად რჩება.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('playlists', function (Blueprint $table) {
            $table->unsignedBigInteger('copied_from_id')->nullable()->after('visibility');
            $table->index(['user_id', 'copied_from_id']);
        });
    }

    public function down(): void
    {
        Schema::table('playlists', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'copied_from_id']);
            $table->dropColumn('copied_from_id');
        });
    }
};
