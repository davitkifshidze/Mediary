<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;

/**
 * **გაშვების შედეგი ჩანაწერზე** (Tasks §31.1) — ოთხი ფაქტი, რომელიც აქამდე
 * ერთ მწვანე ✓-ში იკარგებოდა.
 *
 * ⚠️ **„ცარიელი" და „უცვლელი" სხვადასხვა ფაქტია**: პირველზე წყარომ არაფერი
 * დააბრუნა და ჩანაწერი დამუშავებულად **არ** ითვლება (გეგმა მას ისევ
 * სთავაზობს), მეორეზე წყარომ უპასუხა და ყველაფერი უკვე ისე იყო.
 * ⚠️ **ჩავარდნაც იწერება** (დროით და კოდით) — „ბოლოს როდის ვცადე" ჩავარდნაზეც
 * პასუხია; გეგმის „დამუშავებულების დამალვა" მას ისევ სთავაზობს.
 */
final class SyncOutcome
{
    public const UPDATED = 'updated';

    public const UNCHANGED = 'unchanged';

    public const EMPTY = 'empty';

    public const FAILED = 'failed';

    public const ALL = [self::UPDATED, self::UNCHANGED, self::EMPTY, self::FAILED];

    /** შედეგები, რომლებზეც გეგმა ჩანაწერს **ისევ** სთავაზობს */
    public const RETRY = [self::EMPTY, self::FAILED];

    /** `sync` → `last_synced_at`/`last_sync_result`; `translate` → `last_translated_at`/`last_translate_result` */
    public const COLUMNS = [
        'sync' => ['last_synced_at', 'last_sync_result'],
        'translate' => ['last_translated_at', 'last_translate_result'],
    ];

    /**
     * კვალის ჩაწერა **ობსერვერის გარეშე**: ეს მანქანის ფაქტია და არა
     * მომხმარებლის ქმედება — ყოველი გაშვება „განახლდა: last_synced_at" რიგად
     * ლოგს დამარხავდა. ⚠️ პირდაპირი query და არა `saveQuietly()`: ჩავარდნისას
     * მოდელზე შეიძლება ნახევრად დაწერილი ველები იდოს და ისინი არ უნდა
     * ჩაიწეროს; მეხსიერებაში მნიშვნელობა მაინც დგება, რომ პასუხი სწორი იყოს.
     */
    public static function stamp(Model $item, string $kind, string $result): void
    {
        [$at, $column] = self::COLUMNS[$kind];
        $now = AppTime::now();

        $item->newQueryWithoutScopes()->whereKey($item->getKey())->update([$at => $now, $column => $result]);
        $item->forceFill([$at => $now, $column => $result])->syncOriginalAttributes([$at, $column]);
    }
}
