<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

/**
 * **ბუკმარკის საკუთარი ველი** — „სახელი → მნიშვნელობა" ერთ ჩანაწერზე.
 *
 * ⚠️ **ყველა მნიშვნელობა ბაზაში დაშიფრულია** (`value` აქსესორი): ბაზის ასლში,
 * რომელიც მანქანიდან მანქანაზე გადადის, ნომერი ღიად არ დევს. აპი მაინც სეიფი
 * არ არის — ასლი და მისი გასაღები ერთ მანქანაზეა; ნამდვილი პაროლის ადგილი
 * პაროლების მენეჯერია.
 * ⚠️ **გაშიფვრის ჩავარდნა (სხვა `APP_KEY`) `null`-ია და არა გამონაკლისი** —
 * სხვაგვარად ერთი წაუკითხავი ველი მთელ ფანჯარას დააგდებდა. მდგომარეობას
 * `isReadable()` ამბობს; შენახვა წაუკითხავ მნიშვნელობას ცარიელით არ ცვლის
 * (`BookmarkFieldController::replace()`).
 * ⚠️ **`is_secret`** მხოლოდ ჩვენებაა და არა სხვა დაშიფვრა: საიდუმლო ველი
 * ეკრანზე წერტილებადაა და ძებნაში არ ხვდება (`bookmarksMatching()`).
 * ⚠️ პასუხში ველი მხოლოდ მფლობელის `GET /bookmarks/{id}/fields`-ით გადის —
 * `BookmarkResource`, საჯარო გვერდი და გაზიარება მას არ ეხება.
 */
class BookmarkOwnField extends Model
{
    use BelongsToUser;

    /** ერთ ბუკმარკზე მაქსიმუმ რამდენი ველი */
    public const MAX = 20;

    public const LABEL_MAX = 100;

    public const VALUE_MAX = 2000;

    protected $guarded = ['id'];

    protected $casts = [
        'is_secret' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function bookmark(): BelongsTo
    {
        return $this->belongsTo(Bookmark::class);
    }

    /** ღია მნიშვნელობა წასაკითხად, დაშიფრული — ჩასაწერად; ცარიელი — `null` */
    protected function value(): Attribute
    {
        return Attribute::make(
            get: fn (?string $stored) => self::open($stored)[1],
            set: fn (?string $plain) => $plain === null || $plain === '' ? null : Crypt::encryptString($plain),
        );
    }

    /** მნიშვნელობა იშიფრება? (ცარიელი — კი) */
    public function isReadable(): bool
    {
        return self::open($this->attributes['value'] ?? null)[0];
    }

    /**
     * ბუკმარკები, რომელთა **ღია** ველის სახელი ან მნიშვნელობა შეკითხვას შეიცავს.
     *
     * ⚠️ შედარება PHP-შია: მნიშვნელობა დაშიფრულია და SQL-ის `LIKE` მას ვერ
     * წაიკითხავს. მფლობელის ღია ველები ერთი query-ით მოდის (`owner` scope).
     * ⚠️ საიდუმლო ველი აქ არ იკითხება — არც სახელით, არც მნიშვნელობით.
     *
     * @return list<int>
     */
    public static function bookmarksMatching(string $term): array
    {
        $needle = mb_strtolower(trim($term));

        if ($needle === '') {
            return [];
        }

        $ids = [];

        foreach (self::query()->where('is_secret', false)->get(['id', 'bookmark_id', 'label', 'value']) as $field) {
            if (! isset($ids[$field->bookmark_id]) && str_contains(mb_strtolower($field->label."\n".$field->value), $needle)) {
                $ids[$field->bookmark_id] = true;
            }
        }

        return array_keys($ids);
    }

    /** @return array{0: bool, 1: ?string} წაიკითხა? · ღია მნიშვნელობა */
    private static function open(?string $stored): array
    {
        if ($stored === null || $stored === '') {
            return [true, null];
        }

        try {
            return [true, Crypt::decryptString($stored)];
        } catch (DecryptException) {
            return [false, null];
        }
    }
}
