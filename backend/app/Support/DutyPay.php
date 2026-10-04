<?php

namespace App\Support;

use App\Models\DutyShiftType;
use App\Models\DutyWorkplace;

/**
 * **რამდენი ეკუთვნის ერთ მორიგეობაზე (Tasks §34, Q8).**
 *
 *  1. ტიპიანზე — სამსახურის ტარიფი ამ ტიპზე (`duty_rates`: „A · 24 სთ = 220“);
 *  2. ტარიფის გარეშე ან ქასთომ საათებზე — საათები × სამსახურის საათობრივი განაკვეთი;
 *  3. არცერთი — `null` (თანხა უცნობია და ჯამში არ ითვლება, „0“ კი ტყუილი იქნებოდა).
 *
 * ⚠️ **ტიპის ტარიფი ფიქსირებულია** და საათების შესწორებაზე არ იცვლება: 24-იანი
 * მორიგეობა, რომელიც 20 საათი გაგრძელდა, ხელშეკრულებით მაინც „24-იანია“ —
 * განსხვავებული თანხა ჩანაწერზე ხელით იწერება.
 */
final class DutyPay
{
    public static function for(?DutyWorkplace $workplace, ?DutyShiftType $type, float $hours): ?float
    {
        if (! $workplace) {
            return null;
        }

        if ($type) {
            $rate = $workplace->relationLoaded('rates')
                ? $workplace->rates->firstWhere('type_id', $type->id)
                : $workplace->rates()->where('type_id', $type->id)->first();

            if ($rate) {
                return round((float) $rate->pay, 2);
            }
        }

        return $workplace->hourly_rate !== null
            ? round($hours * (float) $workplace->hourly_rate, 2)
            : null;
    }
}
