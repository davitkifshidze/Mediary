<?php

namespace App\Support;

use App\Models\Video;
use Illuminate\Database\Eloquent\Builder;

/**
 * **მოდულის სია — რა ითვლება მოდულის ჩანაწერად.**
 *
 * ცხრილის ყველა რიგი მოდულის ჩანაწერი არ არის: კურსის ფლეილისტიდან შექმნილი
 * ვიდეო `videos`-ში ზის, მაგრამ კურსში ცხოვრობს და ვიდეოების მოდულში არ ჩანს
 * (`Video::scopeListed()`). სია, ძებნა, მთვლელი, სტატისტიკა, საჯარო პროფილი
 * და მასობრივი წაშლა ერთსა და იმავე წესს აქედან იღებს — თორემ მთავარზე
 * „15 ვიდეო" ეწერებოდა, სიაში კი 6 ჩანდა.
 *
 * ⚠️ ფაილები, კვოტა, ურნა, ჩამოტვირთვა და ბმულის დუბლის ძებნა ამას **არ**
 * იყენებს — იქ ყველა რიგი ითვლება.
 */
final class ModuleList
{
    public static function narrow(Builder $query): Builder
    {
        return $query->getModel() instanceof Video ? $query->listed() : $query;
    }

    /**
     * **იგივე მოთხოვნის ის რიგები, რომლებიც მოდულის სიაში არ ჩანს** — კურსში
     * მცხოვრები ვიდეო. `null` — ამ მოდელს ასეთი რიგი არ ჰყავს.
     *
     * ⚠️ ლექსიკონის წაშლას სჭირდება: ტიპი და სტატუსი კურსის ვიდეოსაც აქვს, ე.ი.
     * „ამ ტიპის ჩანაწერები" ორ ნაწილად იყოფა — სიაში მყოფი (`narrow()`) და ეს.
     */
    public static function outside(Builder $query): ?Builder
    {
        $model = $query->getModel();

        return $model instanceof Video ? (clone $query)->where($model->qualifyColumn('listed'), false) : null;
    }
}
