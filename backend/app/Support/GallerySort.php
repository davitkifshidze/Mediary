<?php

namespace App\Support;

use Illuminate\Contracts\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * **გალერეის ფოტოების რიგი — „ახალი · ძველი · არეული" (§8.3 → Tasks §32).**
 *
 * ⚠️ **ცალკე ფაილშია, რადგან ორი მკითხველი ჰყავს**: მფლობელის გალერეა
 * (`GalleryController::photos()`) და საჯარო პროფილის გალერეა
 * (`PublicGallery`). სიდიანი არევის არითმეტიკა ორ ასლად რომ დაწერილიყო,
 * ერთ დღეს გაშორდებოდა — და „არეულის" მე-2 გვერდი ერთ მხარეს უკვე ნანახ
 * ფოტოებს დააბრუნებდა.
 *
 * ⚠️ **„არეული" სიდით მუშაობს და გვერდებს შორის მდგრადია.** სიდის გარეშე
 * მე-2 გვერდი პირველზე უკვე ნანახს გამოიტანდა.
 *
 * ⚠️ **sqlite-ს `RAND(seed)` არ აქვს** (ტესტები იქ გადიან), ამიტომ იქ იგივე
 * მდგრადი არევა არითმეტიკით კეთდება.
 */
final class GallerySort
{
    /** ვალიდაციის ერთადერთი წყარო */
    public const VALUES = ['new', 'old', 'random'];

    /**
     * რიგის დადება. `false` — ეს რიგი არ იცის (გამომძახებელი თავის
     * ნაგულისხმევს წყვეტს: მფლობელის „დაჯგუფებული" ხედი მშობლებით ალაგებს).
     *
     * ⚠️ სვეტი ცხრილის სახელითაა დაწერილი: საჯარო query-ში `id` სხვა
     * ცხრილთან join-ის შემდეგ ორაზროვანი გახდებოდა.
     */
    public static function apply(Builder $query, ?string $sort, int $seed, string $table = 'gallery_images'): bool
    {
        $id = $table.'.id';

        if ($sort === 'random') {
            if (DB::connection()->getDriverName() === 'mysql') {
                $query->orderByRaw('RAND(?)', [$seed]);
            } else {
                $query->orderByRaw('('.$id.' * ? + ?) % 9973', [($seed % 97) + 3, $seed]);
            }

            return true;
        }

        if ($sort === 'old') {
            $query->orderBy($id);

            return true;
        }

        if ($sort === 'new') {
            $query->orderByDesc($id);

            return true;
        }

        return false;
    }
}
