<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **სინქრონიზაციისა და თარგმანის კვალი ჩანაწერზე** (Tasks §31.1/§31.3).
 *
 * `last_synced_at` / `last_sync_result` — ბოლო მასობრივი ან ერთეულოვანი
 * სინქრონი და მისი შედეგი (`updated` · `unchanged` · `empty` · `failed`,
 * `SyncOutcome`); `last_translated_at` / `last_translate_result` — იგივე
 * თარგმანზე. ⚠️ `sync_status` უცვლელი რჩება: ის „ოდესმე სინქრონიზებულა"
 * ფაქტია და მას სხვებიც წერენ; **ცარიელ პასუხზე ის არ იწერება** — ჩანაწერი
 * დამუშავებულად არ ითვლება.
 *
 * `sync_paused` — „აღარ განაახლო": გეგმები (სინქრონი, თარგმანი, გალერეა) და
 * worker-ი ამ ჩანაწერს გამოტოვებენ; ერთეულოვანი ღილაკი დეტალზე მაინც მუშაობს.
 * ⚠️ სახელი `hidden`/`visible` **არ არის** — ეს სვეტები Eloquent-ის
 * თვისებებს ფარავს (`CLAUDE.md`).
 *
 * `cast_member_sync_prefs` — მსახიობი გლობალური ლექსიკონია, ე.ი. „აღარ
 * განაახლო" **თითო მომხმარებლის** ფაქტია და სვეტად ვერ დაჯდებოდა (ერთი
 * მომხმარებლის გადამრთველი სხვის რიგს ცვლიდა — `details_synced_at`-ის
 * იგივე ხაფანგი).
 */
return new class extends Migration
{
    private const MEDIA = ['movies', 'series', 'animes'];

    public function up(): void
    {
        foreach (self::MEDIA as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->boolean('sync_paused')->default(false);
                $t->timestamp('last_synced_at')->nullable();
                $t->string('last_sync_result', 12)->nullable();
                $t->timestamp('last_translated_at')->nullable();
                $t->string('last_translate_result', 12)->nullable();
            });
        }

        Schema::create('cast_member_sync_prefs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->foreignId('cast_member_id')->constrained()->cascadeOnDelete();
            $t->timestamp('paused_at')->nullable();
            $t->timestamps();

            $t->unique(['user_id', 'cast_member_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cast_member_sync_prefs');

        foreach (self::MEDIA as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropColumn(['sync_paused', 'last_synced_at', 'last_sync_result', 'last_translated_at', 'last_translate_result']);
            });
        }
    }
};
