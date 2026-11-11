<?php

namespace App\Http\Controllers\Concerns;

use App\Services\Stats\LibraryStats;
use App\Support\Like;
use App\Support\RecordLocks;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * **ფილმის, სერიალისა და ანიმეს სია — ერთი ფილტრი და ერთი დალაგება.**
 *
 * ⚠️ სამივე კონტროლერს ეს ბლოკი სიტყვასიტყვით ეწერა, ე.ი. ყოველი შესწორება
 * სამ ადგილას კეთდებოდა და ერთ-ერთი აუცილებლად ჩამორჩებოდა. აქ ერთხელ წერია
 * ყველაფერი, რაც სიას ავიწროებს ან ალაგებს; კონტროლერს რჩება ის, რაც მართლა
 * მისია (ფრანჩაიზის შეკრება, რესურსი).
 *
 * ⚠️ **„ჩაკეტილი" ჭრილი იმავე ფილტრებს იღებს — დამალულის შიგთავსის გაუმხელად.**
 * დამალული ჩანაწერის ბარათზე მხოლოდ სათაური გამოდის (`lockedCard()`), ე.ი. ჟანრით,
 * წლით ან ქულით გაფილტვრა მასზე პასუხს გასცემდა კითხვაზე „რა ჟანრისაა ჩაკეტილი
 * ფილმი" — პაროლის გარეშე. ამიტომ შიგთავსის ფილტრს მხოლოდ ამ სესიაში გახსნილი
 * ჩანაწერი პასუხობს, შიგთავსით დალაგებაში კი დამალული ბოლოშია. სათაურით ძებნა
 * ყველა ჩაკეტილზე მუშაობს — სათაური ბარათზე ისედაც ჩანს.
 */
trait FiltersMediaLibrary
{
    /** „დან – მდე" წყვილები; შებრუნებული წყვილი თავისით სწორდება */
    private const LIBRARY_RANGES = ['year', 'rating', 'my_rating'];

    /** შიგთავსზე მომუშავე ფილტრები — დამალული ჩანაწერი მათ არ პასუხობს */
    private const LIBRARY_CONTENT_FILTERS = [
        'status', 'favorite', 'source', 'genre', 'done', 'watched',
        'year_min', 'year_max', 'rating_min', 'rating_max', 'my_rating_min', 'my_rating_max',
    ];

    /** შიგთავსით დალაგება (დანარჩენი — დამატების რიგია) */
    private const LIBRARY_CONTENT_SORTS = ['year_desc', 'year_asc', 'rating_desc', 'rating', 'rating_asc'];

    /**
     * გაფილტრული სია — დალაგებამდე.
     *
     * @param  class-string<Model>  $model
     * @param  string  $module  `LibraryStats`-ის გასაღები (`movie` · `series` · `anime`)
     */
    protected function libraryQuery(Request $request, string $model, string $module): Builder
    {
        $this->straightenRanges($request);

        $query = $model::query()->with('genres');

        if ($request->boolean('locked')) {
            $query->onlyLocked();

            $hidden = RecordLocks::hiddenIds($query->getModel()->getMorphClass());
            if ($hidden && $this->filtersContent($request)) {
                $query->whereNotIn($query->getModel()->getQualifiedKeyName(), $hidden);
            }
        }

        // სტატისტიკის ზოლიდან მოსული ჭრილი (თვე, შენი ქულა)
        LibraryStats::drill($query, $module, $request);

        /* სტატუსი ლექსიკონის რიგია; ფილტრი კვლავ **გასაღებით** მოდის (`?view=watched`).
           ⚠️ რამდენიმე სტატუსი **ან**-ითაა: ჩანაწერს ერთი სტატუსი აქვს, ე.ი. თითო
           გასაღებზე ცალკე პირობა ყოველთვის ცარიელს დააბრუნებდა. */
        if ($keys = $this->statusKeys($request)) {
            $query->statusKey($keys);
        }

        if ($request->boolean('favorite')) {
            $query->where('is_favorite', true);
        }

        if ($request->string('source')->toString() === 'synced') {
            $query->where('sync_status', 'synced');
        }

        $this->filterGenres($query, $request);

        if ($q = $request->string('q')->toString()) {
            $query->whereHas('translations', fn ($t) => $t->where('title', 'like', Like::contains($q)));
        }

        /* ⚠️ ზღვრის დასმისთანავე უწლო / ურეიტინგო ჩანაწერი სიიდან გადის: `NULL`
           არცერთ შედარებას არ აკმაყოფილებს. ეს განზრახ ასეა — „2000-დან" ნიშნავს
           „ვიცი, რომ 2000-ის შემდეგაა" — და პანელის `i`-ში წერია. */
        if ($request->filled('year_min')) {
            $query->where('year', '>=', $request->integer('year_min'));
        }
        if ($request->filled('year_max')) {
            $query->where('year', '<=', $request->integer('year_max'));
        }
        // ⚠️ `rating` TMDB-ის ქულაა; შენი ქულა (`my_rating_*`) ზემოთ, `drill()`-შია
        if ($request->filled('rating_min')) {
            $query->where('rating', '>=', $request->float('rating_min'));
        }
        if ($request->filled('rating_max')) {
            $query->where('rating', '<=', $request->float('rating_max'));
        }

        return $query;
    }

    /** დალაგება — `sort` პარამეტრით; ნაგულისხმევი ახალი ზემოთ */
    protected function sortLibrary(Builder $query, Request $request): string
    {
        $sort = $request->string('sort')->toString();

        // ⚠️ შიგთავსით დალაგებული დამალული ჩანაწერის ადგილი მის წელს ან ქულას გაამხელდა
        if ($request->boolean('locked') && in_array($sort, self::LIBRARY_CONTENT_SORTS, true)) {
            $hidden = RecordLocks::hiddenIds($query->getModel()->getMorphClass());

            if ($hidden) {
                $key = $query->getModel()->getQualifiedKeyName();
                $query->orderByRaw("case when {$key} in (".implode(',', array_map('intval', $hidden)).') then 1 else 0 end');
            }
        }

        match ($sort) {
            'added_asc' => $query->orderBy('id'),
            'year_desc' => $query->orderByDesc('year'),
            'year_asc' => $query->orderBy('year'),
            'rating_desc', 'rating' => $query->orderByDesc('rating'),
            'rating_asc' => $query->orderBy('rating'),
            default => $query->orderByDesc('id'),
        };

        return $sort;
    }

    /**
     * **რამდენიმე ჟანრი: „ნებისმიერი" (ნაგულისხმევი) ან „ყველა ერთად".**
     *
     * ⚠️ ადრე მხოლოდ „ყველა ერთად" იყო — თითო ჟანრზე ცალკე `whereHas` —, ამიტომ
     * ორი მონიშნული ჟანრი, რომლებშიც ცალ-ცალკე ფილმები არის, ცარიელ სიას აბრუნებდა.
     * `genre_mode=all` ვიწრო ძებნისთვის რჩება („კომედია + საშინელება").
     */
    private function filterGenres(Builder $query, Request $request): void
    {
        $slugs = $this->slugList($request->string('genre')->toString());

        if ($slugs === []) {
            return;
        }

        if ($request->string('genre_mode')->toString() === 'all') {
            foreach ($slugs as $slug) {
                $query->whereHas('genres', fn ($q) => $q->where('slug', $slug));
            }

            return;
        }

        $query->whereHas('genres', fn ($q) => $q->whereIn('slug', $slugs));
    }

    /**
     * „დან" > „მდე" → წყვილი გადაისმება. ⚠️ შებრუნებული ზღვარი ცარიელ სიას
     * აბრუნებდა ახსნის გარეშე; რას გულისხმობდა მომხმარებელი, ორაზროვანი არ არის.
     */
    private function straightenRanges(Request $request): void
    {
        foreach (self::LIBRARY_RANGES as $range) {
            $min = $request->query("{$range}_min");
            $max = $request->query("{$range}_max");

            if (is_numeric($min) && is_numeric($max) && (float) $min > (float) $max) {
                $request->query->set("{$range}_min", $max);
                $request->query->set("{$range}_max", $min);
            }
        }
    }

    /** მოთხოვნაში შიგთავსის ფილტრი დევს? */
    private function filtersContent(Request $request): bool
    {
        foreach (self::LIBRARY_CONTENT_FILTERS as $key) {
            if ($request->filled($key)) {
                return true;
            }
        }

        return false;
    }
}
