<?php

namespace App\Models\Concerns;

use App\Models\RecordLock;

/**
 * **ჩანაწერი, რომელსაც პაროლი შეიძლება დაედოს (Tasks §33.7 ← §35.4).**
 *
 * ⚠️ ლოკი ცალკე ცხრილშია (`record_locks`, morph-ალიასით), ე.ი. SQL-ის კასკადი
 * მას ვერ ხედავს — **საბოლოო წაშლა** რიგს აქ შლის, თორემ id-ის ხელახლა
 * გამოყენებისას (sqlite, ბაზის აღდგენა) ახალ ჩანაწერს ძველი პაროლი დაედებოდა.
 * ურნა (`moveToTrash()`) რიგს არ ეხება: აღდგენილი ჩაკეტილი ისევ ჩაკეტილია.
 */
trait HasRecordLock
{
    protected static function bootHasRecordLock(): void
    {
        static::deleting(function ($record) {
            RecordLock::withoutGlobalScopes()
                ->where('lockable_type', $record->getMorphClass())
                ->where('lockable_id', $record->getKey())
                ->get()
                ->each->delete();
        });
    }
}
