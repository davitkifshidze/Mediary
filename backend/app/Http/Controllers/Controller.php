<?php

namespace App\Http\Controllers;

use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

abstract class Controller
{
    /**
     * ნაგულისხმევი ჩანაწერი გვერდზე — ცხრავე მოდულისთვის ერთი რიცხვი.
     *
     * ⚠️ სახელს `LIST_` წინსართი **განზრახ** აქვს: `PER_PAGE`/`MAX_PER_PAGE`
     * კონტროლერებს უკვე თავისი აქვთ (`GalleryController` — `private`), ხოლო
     * მემკვიდრეობით მიღებულ კონსტანტას ხილვადობის დავიწროება PHP-ში
     * **ფატალური შეცდომაა**. ბაზისურ კლასში ზოგადი სახელი ასე იჭერს ადგილს.
     */
    public const LIST_PER_PAGE = 60;

    /** ჭერი: `per_page=100000` ერთი მოთხოვნით მთელ ბიბლიოთეკას არ ჩამოიტანს */
    public const LIST_PER_PAGE_MAX = 500;

    /**
     * მძიმით გამოყოფილი slug-ების სია → სუფთა მასივი.
     * ფილტრების პანელი (Tasks 2.2) ერთ პარამეტრში რამდენიმე ჟანრს/ტეგს გზავნის.
     *
     * @return list<string>
     */
    protected function slugList(?string $value): array
    {
        if ($value === null || trim($value) === '') {
            return [];
        }

        return array_values(array_unique(array_filter(
            array_map('trim', explode(',', $value)),
            fn (string $slug) => $slug !== '',
        )));
    }

    /**
     * სიის გვერდებად დაყოფა — **ერთი წესი ცხრავე მოდულზე**.
     *
     * ⚠️ **`all=1` ცხადი გამონაკლისია და არა ნაგულისხმევი ქცევა.** მთელი სია
     * მართლა სჭირდება ოთხ გამომძახებელს — `/purge`-ის რიგს, მასობრივ
     * ცვლილებას, ჩანაწერების ამრჩევს და პლეილისტის ავზს — და **მხოლოდ**
     * მათ. ნაგულისხმევად სია იჭრება, თორემ 3000-ჩანაწერიანი ბიბლიოთეკა
     * ყოველ გახსნაზე მთლიანად მოდიოდა (ჟანრებით და მთვლელებით).
     *
     * ⚠️ **`Collection`-იც მიიღება და არა მხოლოდ query.** ვიდეოს ძებნა
     * relevance-ს PHP-ში ითვლის (`VideoSearch::search()`), ე.ი. SQL-ს
     * `limit` ვეღარ მიეცემა — ასეთი სია აქვე იჭრება, რომ გამომძახებელს
     * ორი სხვადასხვა გზა არ ჰქონდეს.
     *
     * @param  Builder|Collection  $source
     * @return Collection|LengthAwarePaginator
     */
    protected function paginated(Request $request, $source, int $default = self::LIST_PER_PAGE)
    {
        if ($request->boolean('all')) {
            return $source instanceof Collection ? $source : $source->get();
        }

        $perPage = min(max((int) $request->integer('per_page', $default), 1), self::LIST_PER_PAGE_MAX);

        if ($source instanceof Collection) {
            $page = max((int) $request->integer('page', 1), 1);

            return new LengthAwarePaginator(
                $source->forPage($page, $perPage)->values(),
                $source->count(),
                $perPage,
                $page,
                ['path' => $request->url(), 'query' => $request->query()],
            );
        }

        return $source->paginate($perPage);
    }
}
