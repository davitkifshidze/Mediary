<?php

namespace App\Support;

use App\Models\AuditLog;
use App\Models\TrashEntry;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * **აუდიტის ლოგის გასუფთავება ურნაში — ერთ ელემენტად (Tasks §29.8).**
 *
 * შენი გადაწყვეტილება (Q39 — „ა"): აკრეფილი `DELETE`-ით წაშლაც ურნაში
 * მიდის. ⚠️ **ათასი ცალკე რიგი ურნას დამარხავდა**, ამიტომ ერთი გასუფთავება
 * ერთი `trash_entries` რიგია (`kind = audit_log`), ლოგის რიგები კი ადგილზე
 * რჩება და მას `trash_entry_id`-ით მიებმის — `AuditLog`-ის `trash` scope მათ
 * ჩვეულებრივ წაკითხვას უმალავს.
 *
 * ⚠️ **საბოლოო წაშლა კოდი არ არის — FK-ის კასკადია**: ელემენტის წაშლა
 * (ხელით, დაცლით, ვადის გასვლით, ან გამწმენდის ანგარიშის წაშლით) რიგებს
 * თვითონ შლის. აღდგენა კი სვეტს **ელემენტის წაშლამდე** ასუფთავებს, თორემ
 * კასკადი სწორედ აღსადგენ რიგებს წაშლიდა.
 *
 * ⚠️ **აღდგენას `admin:audit` სჭირდება** (`TrashBin::blocked()`) — როლი რომ
 * დაკარგოს, ელემენტი ურნაში ჩანს, მაგრამ ვერ აღადგენს. `PROTECTED_ACTIONS`
 * აქ ისედაც არ მოხვდება (`cleanable()`).
 */
final class AuditLogTrash
{
    public const KIND = 'audit_log';

    /**
     * გასუფთავება — რიგები ურნაში, ერთ ელემენტად.
     *
     * @return int რამდენი რიგი გადავიდა ურნაში
     */
    public static function trash(User $admin, Builder $rows): int
    {
        return DB::transaction(function () use ($admin, $rows) {
            $entry = TrashEntry::withoutGlobalScope('owner')->create([
                'user_id' => $admin->getKey(),
                'kind' => self::KIND,
                'payload' => ['count' => 0],
                'trashed_at' => now(),
            ]);

            $count = $rows->update(['trash_entry_id' => $entry->getKey()]);

            // ⚠️ ცარიელი გასუფთავება ურნაში ცარიელ ელემენტს არ ტოვებს
            if ($count === 0) {
                $entry->delete();

                return 0;
            }

            $entry->forceFill(['payload' => ['count' => $count]])->save();

            return $count;
        });
    }

    /** აღდგენა — რიგები ლოგში ბრუნდება, ელემენტი ქრება */
    public static function restore(TrashEntry $entry): int
    {
        return DB::transaction(function () use ($entry) {
            $count = AuditLog::withoutGlobalScope('trash')
                ->where('trash_entry_id', $entry->getKey())
                ->update(['trash_entry_id' => null]);

            // ⚠️ სვეტი უკვე ცარიელია — კასკადი აღარაფერს წაშლის
            $entry->delete();

            return $count;
        });
    }

    /** რამდენი რიგია ამ ელემენტში — სიისთვის */
    public static function count(TrashEntry $entry): int
    {
        return (int) ($entry->payload['count'] ?? 0);
    }
}
