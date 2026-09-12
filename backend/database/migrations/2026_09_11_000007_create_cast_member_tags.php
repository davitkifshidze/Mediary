<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks §7.5 — მსახიობზე გაწერილი სიტყვები/ტეგები, რომლითაც ვებში ფოტოები იძებნება.
 *
 * ⚠️ **ცალკე ცხრილი განზრახაა და არა სვეტი `cast_members`-ზე.** `cast_members`
 * **გლობალური ლექსიკონია** — ერთი და იგივე მსახიობი ყველა ანგარიშზე ერთი
 * რიგია (იგივე წესი, რაც `genres`-ს აქვს). იქ დამატებული `tags` სვეტი ჩემს
 * ტეგებს **სხვის** გვერდზეც აჩვენებდა და ორი მომხმარებელი ერთმანეთს
 * გადააწერდა. აქ კი წყვილი `(user_id, cast_member_id)` უნიკალურია, ე.ი.
 * თითოეულს თავისი აქვს.
 *
 * ⚠️ **`tags` JSON მასივია და არა ცხრილი** — ზუსტად ისე, როგორც ვიდეოს,
 * სიმღერის, წიგნისა და ჩანიშვნის ტეგები (არსებული წესი). დუბლს ორივე მხარე
 * ჭრის: ფორმაში `dedupeTags()`, სერვერზე `Video::normalizeTags()`.
 *
 * ⚠️ **`visibility` სვეტი არ აქვს და არც სჭირდება** — ეს ჩემი საძიებო
 * სიტყვებია და არა საჯარო ჩანაწერი; ფოტო კი მშობლის ხილვადობას იზიარებს
 * (§10-ის წესი).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cast_member_tags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('cast_member_id')->constrained()->cascadeOnDelete();
            $table->json('tags');
            $table->timestamps();

            // ერთ მსახიობზე ერთ მომხმარებელს ერთი ნაკრები აქვს
            $table->unique(['user_id', 'cast_member_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cast_member_tags');
    }
};
