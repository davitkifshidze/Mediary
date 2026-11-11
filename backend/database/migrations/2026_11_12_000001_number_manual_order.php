<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * **ხელით დალაგების საწყისი რიგი** — ბუკმარკები, ჩანაწერები, სიმღერები.
 *
 * `sort_order` სვეტი სამივე ცხრილზე არსებობდა, მაგრამ არაფერი იყენებდა:
 * თითქმის ყველა სტრიქონზე 0 ეწერა. გადალაგება იმას ეყრდნობა, რომ მფლობელის
 * ჩანაწერებს **განსხვავებული** მნიშვნელობები აქვთ, ამიტომ თითო მფლობელის
 * ჩანაწერები ერთხელ ინომრება იმ რიგით, რომელსაც სია აქამდე აჩვენებდა —
 * ახალი ჯერ (`id` კლებადობით). ურნაში მყოფიც ინომრება: აღდგენისას ის თავის
 * ადგილს უბრუნდება.
 *
 * ⚠️ უკან დაბრუნება არაფერს აკეთებს — ძველი მნიშვნელობები არაფერს ნიშნავდა.
 */
return new class extends Migration
{
    private const TABLES = ['bookmarks', 'note_entries', 'songs'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            $owners = DB::table($table)->distinct()->pluck('user_id');

            foreach ($owners as $owner) {
                $position = 0;

                DB::table($table)
                    ->where('user_id', $owner)
                    ->orderByDesc('id')
                    ->pluck('id')
                    ->each(function ($id) use ($table, &$position) {
                        DB::table($table)->where('id', $id)->update(['sort_order' => ++$position]);
                    });
            }
        }
    }

    public function down(): void
    {
        //
    }
};
