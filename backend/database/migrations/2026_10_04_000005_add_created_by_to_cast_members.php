<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ხელით შექმნილი მსახიობი — მხოლოდ შემქმნელს უჩანს.**
 *
 * `cast_members` გლობალური ლექსიკონია: ხელით შექმნილი „ნინო ქასრაძე" აქამდე
 * ყველა ანგარიშის ძებნაში ჩნდებოდა. ახლა მას `created_by` აქვს და
 * `CastMember`-ის `creator` scope მას სხვებს უმალავს — **სანამ TMDB-ის პირს
 * არ დაუკავშირდება** (მაშინ ის ფაქტია და ყველასია).
 *
 * ⚠️ **არსებული ხელით შექმნილები** (TMDB-ის გარეშე) მფლობელს იღებენ, თუ ის
 * ცალსახაა — ერთი ანგარიში, რომლის ჩანაწერზეც, ფოტოებში ან ტეგებშია. ორ
 * ანგარიშში გამოყენებული რჩება `null`-ად, ე.ი. საერთოდ: დამალვა მეორეს მის
 * ჩანაწერზე ხელით დამატებულ მსახიობს მოაშორებდა.
 *
 * ⚠️ `nullOnDelete` — ანგარიშის წაშლისას TMDB-ის მსახიობი რჩება საერთოდ;
 * შემქმნელის ხელით შექმნილს კი `AccountEraser` თვითონ შლის (მოდელით —
 * ფოტო კვოტიდან უნდა ჩამოიჭრას).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cast_members', function (Blueprint $table) {
            $table->foreignId('created_by')->nullable()->after('tmdb_person_id')->constrained('users')->nullOnDelete();
        });

        $manual = DB::table('cast_members')->whereNull('tmdb_person_id')->pluck('id')->all();

        foreach (array_chunk($manual, 500) as $ids) {
            $owners = [];

            foreach (['movie' => 'movies', 'series' => 'series', 'anime' => 'animes'] as $type => $table) {
                $rows = DB::table('castables')
                    ->join($table, "{$table}.id", '=', 'castables.castable_id')
                    ->where('castables.castable_type', $type)
                    ->whereIn('castables.cast_member_id', $ids)
                    ->select('castables.cast_member_id', "{$table}.user_id")
                    ->get();

                foreach ($rows as $row) {
                    $owners[(int) $row->cast_member_id][(int) $row->user_id] = true;
                }
            }

            foreach ([
                DB::table('gallery_images')->where('imageable_type', 'cast_member')->whereIn('imageable_id', $ids)->select('imageable_id as cast_member_id', 'user_id'),
                DB::table('cast_member_tags')->whereIn('cast_member_id', $ids)->select('cast_member_id', 'user_id'),
                DB::table('cast_member_sync_prefs')->whereIn('cast_member_id', $ids)->select('cast_member_id', 'user_id'),
            ] as $query) {
                foreach ($query->get() as $row) {
                    $owners[(int) $row->cast_member_id][(int) $row->user_id] = true;
                }
            }

            foreach ($owners as $memberId => $users) {
                if (count($users) === 1) {
                    DB::table('cast_members')->where('id', $memberId)->update(['created_by' => array_key_first($users)]);
                }
            }
        }
    }

    public function down(): void
    {
        Schema::table('cast_members', function (Blueprint $table) {
            $table->dropConstrainedForeignId('created_by');
        });
    }
};
