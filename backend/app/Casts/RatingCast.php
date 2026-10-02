<?php

namespace App\Casts;

use App\Support\Rating;
use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * **ქულა ბაზაში `decimal(3,1)`-ია, JSON-ში — რიცხვი** (Tasks §9.3).
 *
 * ⚠️ რატომ არა `decimal:1`: ის სტრიქონს აბრუნებს ("7.0"), SPA-ს კი რიცხვი
 * სჭირდება (ვარსკვლავების შევსება, `step 0.1` ველი). რატომ არა `float`:
 * მთელი ქულა `7.0`-ად წავიდოდა და ყველა არსებული შემოწმება
 * (`assertJsonPath('data.rating', 7)`) და ეკრანი („7.0 / 10" „7 / 10"-ის
 * ნაცვლად) შეიცვლებოდა. ამიტომ **მთელი ქულა `int`-ია, წილადი — `float`
 * მეათედამდე**; ორივე JSON-ში რიცხვია.
 *
 * ⚠️ **ჩაწერაც აქ ნორმალიზდება** (`Rating::normalize()`): ცარიელი სტრიქონი,
 * `null` და `0` ქულის წაშლაა; მეტი სიზუსტე მეათედამდე მრგვალდება, რომ
 * MySQL-მა ჩუმად არ მოჭრას. sqlite-ის ტესტებში სვეტი integer-აფინურია და
 * 4.6-ს REAL-ად ინახავს — ე.ი. ორივე დრაივერზე ერთი და იგივე ბრუნდება.
 */
class RatingCast implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): int|float|null
    {
        if ($value === null || $value === '') {
            return null;
        }

        $value = round((float) $value, 1);

        return floor($value) === $value ? (int) $value : $value;
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): ?float
    {
        return Rating::normalize($value);
    }
}
