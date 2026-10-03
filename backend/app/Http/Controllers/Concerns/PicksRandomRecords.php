<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;

/**
 * **„რა ვნახო დღეს" — შემთხვევითი ჩანაწერები (FEAT-20 → Tasks §17.5).**
 *
 * ⚠️ **ერთი კოდი ოთხ კონტროლერს** (ფილმი, სერიალი, ანიმე, ვიდეო): აქამდე
 * სამი ასლი იყო და მეოთხე (ვიდეო) ახალ ასლს დაბადებდა — `count`-ის
 * დამატება სამჯერ უნდა გაკეთებულიყო.
 *
 * ⚠️ **`role = todo` ნაგულისხმევია და არა მყარი**: კითხვა „ჯერ რა არ
 * მინახავს"-ია, მაგრამ ცხადად არჩეული სტატუსი (`?status=`) მასზე მაღლა
 * დგას — თორემ „დაწყებულებიდან აირჩიე" შეუძლებელი იქნებოდა.
 * ⚠️ **როლი და არა გასაღები** (§6.4): სტატუსი per-user ლექსიკონია.
 *
 * ⚠️ **`inRandomOrder()` და არა PHP-ში არჩევა**: სიის მთლიანად წამოღება
 * რამდენიმე ჩანაწერის ასარჩევად ზუსტად ის არის, რის წინააღმდეგაც
 * პაგინაცია დაიწერა.
 *
 * ⚠️ **`count` 1–5-ით იჭრება** — დიალოგის ზღვარია (§17.4); მეტი ბარათი
 * მოდალში არ ეტევა, და ეს სიის მოთხოვნა არ არის.
 *
 * ⚠️ **ცარიელი შედეგი ცარიელი სიაა და არა 404**: „ფილტრში არაფერია"
 * ნორმალური მდგომარეობაა და ეკრანზე `EmptyState`-ად იხატება.
 */
trait PicksRandomRecords
{
    /** @var int დიალოგის ზედა ზღვარი — `NumberPick` 1–5 */
    protected static int $pickMax = 5;

    protected function randomRecords(Request $request, Builder $query, string $idColumn): Collection
    {
        if (! $request->filled('status') && ! $request->boolean('favorite')) {
            $query->statusRole('todo');
        }

        /* Tasks §6.5 — ⚠️ „სხვა" იგივე ჩანაწერს აბრუნებდა: `inRandomOrder()` უკვე
           ნაჩვენებს არ იცნობს. SPA ბოლო id-ებს `exclude`-ით აწვდის; როცა ყველა
           ამოიწურა, სია ცარიელია და დიალოგი ამას ამბობს — თავიდან დაწყება მისი საქმეა. */
        $exclude = array_filter(array_map('intval', (array) $request->input('exclude', [])));
        if ($exclude) {
            $query->whereNotIn($idColumn, $exclude);
        }

        $count = max(1, min(static::$pickMax, (int) $request->input('count', 1)));

        return $query->reorder()->inRandomOrder()->limit($count)->get();
    }
}
