<?php

namespace App\Services\Suggest;

use App\Support\MediaDomain;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

/**
 * **რაზე დგას შემოთავაზება** — ჩემი სათაურები, რომელთა მსგავსსაც ვეძებ.
 *
 * არჩევანი ორსაფეხურიანია: ჯერ **ავზი** — ერთი ან რამდენიმე სტატუსი და / ან „რჩეული"
 * (ერთმანეთს ემატება), დავიწროებული ჟანრით, წლით, ჩემი ქულითა და TMDB-ის რეიტინგით;
 * შემდეგ, თუ კონკრეტული სათაურებია მონიშნული (`ids`), საფუძველი ზუსტად ისინია.
 *
 * ⚠️ დიდი ავზიდან ერთ გაშვებაზე `LIMIT` სათაური აიღება — ჯერ რჩეულები და ჩემი მაღალი
 * ქულის მქონეები, შემდეგ ბოლოს ნანახი / დამატებული: გემოვნებას ეს რაოდენობა სრულად
 * ხატავს, ასობით კი შედეგს აზოგადებს და თითო სათაურზე წყაროს ცალკე ეკითხება.
 * ⚠️ ჩაკეტილი ჩანაწერი საფუძველში არ ხვდება, არც სესიაში გახსნილი (`withoutLocked()`):
 * შედეგის „რატომ" მის სათაურს აჩვენებდა. TMDB-ის id-ის გარეშე ჩანაწერს წყარო ვერ ცნობს.
 */
final class SuggestionBasis
{
    public const LIMIT = 30;

    /**
     * ავზი — არჩეული სტატუსებისა და „რჩეულის" ჩანაწერები, დავიწროების შემდეგ.
     *
     * @param  array<string, mixed>  $in  `MediaSuggestionController::selection()`-ის ფორმა
     */
    public static function pool(string $type, array $in): Builder
    {
        $query = self::visible($type);
        $statuses = $in['statuses'] ?? [];
        $favorite = ! empty($in['favorite']);

        // არაფერია არჩეული — ავზი ცარიელია (და არა მთელი ბიბლიოთეკა)
        if (! $statuses && ! $favorite) {
            return $query->whereRaw('1 = 0');
        }

        $query->where(function (Builder $either) use ($statuses, $favorite) {
            if ($statuses) {
                $either->orWhere(fn (Builder $q) => $q->statusKey($statuses));
            }
            if ($favorite) {
                $either->orWhere('is_favorite', true);
            }
        });

        if (! empty($in['genre'])) {
            $query->whereHas('genres', fn ($q) => $q->whereIn('slug', $in['genre']));
        }

        // ზღვრის დასმისთანავე უწლო / უქულო ჩანაწერი ავზიდან გადის — სიის ფილტრის წესი
        foreach (['year_min' => ['year', '>='], 'year_max' => ['year', '<='],
            'my_rating_min' => ['my_rating', '>='], 'my_rating_max' => ['my_rating', '<='],
            'rating_min' => ['rating', '>='], 'rating_max' => ['rating', '<=']] as $key => [$column, $op]) {
            if (($in[$key] ?? null) !== null) {
                $query->where($query->getModel()->qualifyColumn($column), $op, $in[$key]);
            }
        }

        return $query;
    }

    /**
     * საფუძველი: მონიშნული სათაურები, ან ავზის პირველი `LIMIT`.
     *
     * @param  array<string, mixed>  $in
     * @return array{records: Collection, total: int}
     */
    public static function resolve(string $type, array $in): array
    {
        $ids = $in['ids'] ?? [];
        $query = $ids
            ? self::visible($type)->whereIn(self::visible($type)->getModel()->getQualifiedKeyName(), $ids)
            : self::pool($type, $in);

        return [
            'total' => (clone $query)->count(),
            'records' => self::ordered($query)->limit(self::LIMIT)->get(),
        ];
    }

    /** რჩეული → ჩემი ქულა → ბოლოს ნანახი → ბოლოს დამატებული */
    public static function ordered(Builder $query): Builder
    {
        $model = $query->getModel();
        $rating = $model->qualifyColumn('my_rating');
        $watched = $model->qualifyColumn('watched_at');

        return $query
            ->orderByDesc($model->qualifyColumn('is_favorite'))
            ->orderByRaw("case when {$rating} is null then 1 else 0 end")
            ->orderByDesc($rating)
            ->orderByRaw("case when {$watched} is null then 1 else 0 end")
            ->orderByDesc($watched)
            ->orderByDesc($model->getQualifiedKeyName());
    }

    private static function visible(string $type): Builder
    {
        $query = MediaDomain::query($type)->withoutLocked();

        return $query->whereNotNull($query->getModel()->qualifyColumn('tmdb_id'));
    }
}
