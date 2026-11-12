<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;

/**
 * **მიზანი** — „ამ პერიოდში ამდენი დავასრულო" ერთ მოდულზე.
 *
 * ⚠️ პროგრესი **არ ინახება**: ყოველ წაკითხვაზე ითვლება იმავე წყაროდან, რითაც
 * სტატისტიკა და მთავარი გვერდი (`LibraryStats::doneBetween()`) — შენახული რიცხვი
 * ჩანაწერის წაშლაზე ან თარიღის შესწორებაზე მოძველდებოდა.
 * ⚠️ თარიღები `Y-m-d` სტრიქონებია და არა `date` cast: cast მათ `Y-m-d H:i:s`-ად
 * წერს და sqlite-ზე `<=` ბოლო დღეს კარგავს.
 * ⚠️ მოდულზე მიუბმელი „თავისუფალი" მიზანი (ხელით „+1") აქ არ არის — ეს ჩვევების
 * აღრიცხვაა, სხვა ტიპის ფუნქცია.
 */
class Goal extends Model
{
    use BelongsToUser;

    public const PERIODS = ['year', 'month', 'week', 'custom'];

    /** ერთ ანგარიშზე მაქსიმუმ რამდენი მიზანი (ისტორიიანად) */
    public const MAX = 300;

    public const NAME_MAX = 120;

    protected $guarded = ['id'];

    protected $casts = [
        'target' => 'integer',
        'classifier_id' => 'integer',
    ];

    /** `starts_on`/`ends_on` ყოველთვის `Y-m-d` — MySQL-ის `date`-იც და sqlite-ის სტრიქონიც */
    public function getStartsOnAttribute(?string $value): ?string
    {
        return $value === null ? null : substr($value, 0, 10);
    }

    public function getEndsOnAttribute(?string $value): ?string
    {
        return $value === null ? null : substr($value, 0, 10);
    }
}
