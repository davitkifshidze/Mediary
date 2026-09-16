<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * **Tasks §1.3 — ნაგულისხმევი სტატუსების ხატულები.**
 *
 * სამი ხატულა თავის მნიშვნელობას არ პასუხობდა და ორი მათგანი **სხვა
 * განყოფილების** ხატულას იმეორებდა — ე.ი. საიდბარში ერთი და იგივე
 * სურათი ორ სხვადასხვა რამეს ნიშნავდა:
 *
 *  · `archived` → `Wrench` — ქანჩის გასაღები „არქივზე";
 *  · `done`/`read` → `ListChecks` — ეს კი მასობრივი სტატუსის სექციის
 *    ხატულაა (`lib/toolSections.ts`);
 *  · `to_watch`/`to_read`/`open` → `Bookmark` — ეს კი **ბუკმარკის
 *    მოდულის** ხატულაა.
 *
 * ⚠️ **ხელით არჩეული ხატულა არ გადაიწერება.** პირობა `icon = <ძველი
 * ნაგულისხმევი>` ზუსტად იმას ნიშნავს, რომ რიგს ჯერ არავის შეხებია —
 * იგივე წესი, რასაც `ModulesSeeder` იცავს `color`-ზე (ივსება მხოლოდ
 * `null`-ზე). ვინც სტატუსს თავისი ხატულა მისცა, ისეთივე დარჩება.
 *
 * ⚠️ **`down()` სიმეტრიულია და არა „ყველას დაუბრუნე ძველი"** — უკან
 * მხოლოდ ის რიგები ბრუნდება, რომლებსაც *ახალი* ნაგულისხმევი აქვთ.
 */
return new class extends Migration
{
    /** [მოდულები, გასაღები, ძველი ნაგულისხმევი, ახალი] */
    private const MOVES = [
        [['movie', 'series', 'anime', 'video'], 'to_watch', 'Bookmark', 'Clock'],
        [['note'], 'open', 'Bookmark', 'Circle'],
        [['note'], 'done', 'ListChecks', 'CheckCheck'],
        [['note'], 'archived', 'Wrench', 'Archive'],
        [['bookmark'], 'to_read', 'Bookmark', 'Clock'],
        [['bookmark'], 'read', 'ListChecks', 'BookOpenCheck'],
        [['bookmark'], 'archived', 'Wrench', 'Archive'],
    ];

    public function up(): void
    {
        $this->move(fn (array $m) => [$m[2], $m[3]]);
    }

    public function down(): void
    {
        $this->move(fn (array $m) => [$m[3], $m[2]]);
    }

    /** @param  callable(array): array{0: string, 1: string}  $direction */
    private function move(callable $direction): void
    {
        foreach (self::MOVES as $move) {
            [$from, $to] = $direction($move);

            DB::table('statuses')
                ->whereIn('module', $move[0])
                ->where('key', $move[1])
                ->where('icon', $from)
                ->update(['icon' => $to]);
        }
    }
};
