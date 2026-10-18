<?php

namespace App\Http\Controllers\Concerns;

use App\Support\RecordLocks;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;

/**
 * **„რა ვნახო დღეს" — შემთხვევითი ჩანაწერები.**
 *
 * ⚠️ **ერთი კოდი ოთხ კონტროლერს** (ფილმი, სერიალი, ანიმე, ვიდეო): აქამდე
 * სამი ასლი იყო და მეოთხე (ვიდეო) ახალ ასლს დაბადებდა — `count`-ის
 * დამატება სამჯერ უნდა გაკეთებულიყო.
 *
 * ⚠️ **`role = todo` ნაგულისხმევია და არა მყარი**: კითხვა „ჯერ რა არ
 * მინახავს"-ია, მაგრამ ცხადად არჩეული სტატუსი (`?status=`) მასზე მაღლა
 * დგას — თორემ „დაწყებულებიდან აირჩიე" შეუძლებელი იქნებოდა.
 * ⚠️ **როლი და არა გასაღები**: სტატუსი per-user ლექსიკონია.
 *
 * ⚠️ **`inRandomOrder()` და არა PHP-ში არჩევა**: სიის მთლიანად წამოღება
 * რამდენიმე ჩანაწერის ასარჩევად ზუსტად ის არის, რის წინააღმდეგაც
 * პაგინაცია დაიწერა.
 *
 * ⚠️ **`count` 1–20-ით იჭრება** — დიალოგის ზღვარია („1 · 5 · 10 ·
 * სხვა", ხელით 20-მდე; ადრე 1–5 იყო); ეს „რამდენი შემომთავაზო"-ა და არა
 * სიის მოთხოვნა — სიას თავისი გვერდები აქვს.
 *
 * ⚠️ **ცარიელი შედეგი ცარიელი სიაა და არა 404**: „ფილტრში არაფერია"
 * ნორმალური მდგომარეობაა და ეკრანზე `EmptyState`-ად იხატება.
 */
trait PicksRandomRecords
{
    /** @var int დიალოგის ზედა ზღვარი — SPA-ს `PICK_MAX` (`lib/pick.ts`) */
    protected static int $pickMax = 20;

    protected function randomRecords(Request $request, Builder $query, string $idColumn): Collection
    {
        // „რა ვნახო დღეს" ჩაკეტილს არ სთავაზობს, სესიაში გახსნილსაც
        if (RecordLocks::hides($query->getModel())) {
            $query->withoutLocked();
        }

        if (! $request->filled('status') && ! $request->boolean('favorite')) {
            $query->statusRole('todo');
        }

        /* ⚠️ „სხვა" იგივე ჩანაწერს აბრუნებდა: `inRandomOrder()` უკვე
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
