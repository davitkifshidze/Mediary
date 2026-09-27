<?php

namespace App\Models\Concerns;

use App\Support\DictionaryKey;

/**
 * **per-user ლექსიკონის `key` (აუდიტი 2026-09-14, §B3).**
 *
 * შვიდ ლექსიკონს — ვიდეოს ტიპები, ოთხი ჟანრის სია და ორი კატეგორიის სია —
 * **სიმბოლო-სიმბოლოში იდენტური** `makeKey()` ჰქონდა, და მასთან ერთად
 * იდენტური ბაგიც (იხ. `DictionaryKey`). ეს trait ორივეს ერთ ადგილას აქცევს.
 *
 * ⚠️ **`withoutGlobalScope('owner')` სავალდებულოა.** `BelongsToUser`-ის scope
 * მიმდინარე user-ზე ჭრის, ხოლო გასაღები **სხვის** ლექსიკონშიც შეიძლება
 * იყოს დაკავებული — მაგალითად, როცა ადმინი სხვის ჩანაწერზე მუშაობს ან
 * როცა `Auth::id()` საერთოდ არ არსებობს (CLI/seeder). scope-ით შემოწმება
 * უნიკალურ ინდექსს ჩუმად გვერდს აუვლიდა.
 *
 * ⚠️ **მოდელი მხოლოდ სიტყვას განსაზღვრავს** (`keyFallback()`) — ის მაშინ
 * გამოიყენება, როცა სახელში ლათინური არაფერი გამოდის.
 */
trait HasDictionaryKey
{
    /** უსახელო გასაღების ნაცვალი — `genre` · `category` · `type` */
    protected static function keyFallback(): string
    {
        return 'item';
    }

    public static function makeKey(int $userId, string $name): string
    {
        return DictionaryKey::make(
            $name,
            // ⚠️ ურნაში მყოფი რიგიც (Tasks §29) — ის თავის გასაღებს უნიკალურ ინდექსში ინარჩუნებს
            fn (string $key) => static::withoutGlobalScopes(['owner', 'trash'])
                ->where('user_id', $userId)
                ->where('key', $key)
                ->exists(),
            static::keyFallback(),
        );
    }
}
