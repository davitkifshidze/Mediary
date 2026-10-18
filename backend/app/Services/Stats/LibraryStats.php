<?php

namespace App\Services\Stats;

use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\Book;
use App\Models\Bookmark;
use App\Models\CastMember;
use App\Models\Course;
use App\Models\CustomRecord;
use App\Models\DutyShift;
use App\Models\Game;
use App\Models\Genre;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\PersonalMedia;
use App\Models\Place;
use App\Models\Series;
use App\Models\Song;
use App\Models\Status;
use App\Models\User;
use App\Models\Video;
use App\Support\CustomModules;
use App\Support\RecordLocks;
use App\Support\SqlDate;
use App\Support\StatusDomain;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ბიბლიოთეკის სტატისტიკა.**
 *
 * ძველი გეგმის „ჯერ მხოლოდ რაოდენობა — სტატუსებად დაშლა მოგვიანებით" სამ
 * კვირაზე მეტი ხნის „მოგვიანებით" იყო: დეშბორდი მხოლოდ რიცხვებია, ხოლო
 * „წელს რამდენი ვნახე", ჟანრების განაწილება და ქულების სურათი — არსად.
 * მონაცემი ისედაც გვაქვს (`watched_at`, `rating`, `status.role`,
 * `genreables`), ე.ი. აკლდა მხოლოდ დათვლა.
 *
 * ⚠️ **ყველაფერი SQL-ის აგრეგატია და არა PHP-ის ციკლი.** 5000-სიმღერიანი
 * ბიბლიოთეკის ჩატვირთვა მხოლოდ იმისთვის, რომ ჟანრები დაითვალოს, ზუსტად
 * ის შეცდომაა, რომელსაც სიების გვერდებად დაყოფა ასწორებდა.
 *
 * ⚠️ **ერთადერთი გამონაკლისი ქულებია და ის შეგნებულია**: `rating`
 * `decimal(3,1)`-ია და მისი დამრგვალება SQL-ში დრაივერზეა დამოკიდებული
 * (sqlite-ის `round()` float-ს აბრუნებს, MySQL-ისა decimal-ს), ხოლო
 * განსხვავებული მნიშვნელობა ათამდეა — ე.ი. დაჯგუფება იაფია და
 * კალათებად დაშლა PHP-ში უფრო ზუსტიც და გადასამოწმებელიც.
 *
 * ⚠️ **ცხადი `user_id` და არა `owner` scope** — იგივე მიზეზი, რაც
 * `RecordExporter`-ს: scope `Auth::id()`-ს კითხულობს და რექვესთის გარეთ
 * ცარიელია.
 */
class LibraryStats
{
    /**
     * მოდული → საიდან რა ჭრილი იკითხება.
     *
     * `year` — რომელი სვეტი ნიშნავს „გამოშვების წელს" (თარიღიც შეიძლება);
     * `done_at` — „როდის გავაკეთე" (თვეების ჭრილი მხოლოდ ამაზე დგას);
     * `genres` — `morph` (გლობალური polymorphic) · `pivot` · `column`;
     * `rating` — **მფლობელის** ქულის სვეტი (მედიაზე `my_rating`, რადგან `rating` TMDB-ისაა) ან `null`.
     *
     * ⚠️ **`done_at` დღეს ყველა მოდულს აქვს, მაგრამ `null` კვლავ კანონიერია.**
     * 2026-09-20-მდე წიგნს, თამაშს, ბორდგეიმსა და ჩანაწერს ასეთი სვეტი არ
     * ჰქონდათ, ე.ი. არც თვეების ჭრილი და არც წლიური მიზანი მათზე
     * არ მუშაობდა; ახლა თითოეულს თავისი აქვს. ახალ მოდულს რომ არ ჰქონდეს,
     * `null` სწორედ ამას იტყვის — ჭრილი არ დაიხატება.
     *
     * ⚠️ **გამოგონილი თარიღი (`updated_at`) მაინც გამორიცხულია**: ორი
     * სხვადასხვა ფაქტი ერთ სვეტში ზუსტად ის ხაფანგია, რომლის გამოც ვიდეოს
     * `watched_at` სტატუსს არ ეხმიანება.
     *
     * @var array<string, array{model: class-string<Model>, year: ?string, done_at: ?string, genres: ?array, rating: ?string}>
     */
    private const MODULES = [
        'movie' => ['model' => Movie::class, 'year' => 'year', 'done_at' => 'watched_at', 'genres' => ['kind' => 'morph', 'alias' => 'movie'], 'rating' => 'my_rating', 'watch_log' => 'movie'],
        'series' => ['model' => Series::class, 'year' => 'year', 'done_at' => 'watched_at', 'genres' => ['kind' => 'morph', 'alias' => 'series'], 'rating' => 'my_rating', 'watch_log' => 'series'],
        'anime' => ['model' => Anime::class, 'year' => 'year', 'done_at' => 'watched_at', 'genres' => ['kind' => 'morph', 'alias' => 'anime'], 'rating' => 'my_rating', 'watch_log' => 'anime'],
        'video' => ['model' => Video::class, 'year' => null, 'done_at' => 'watched_at', 'genres' => ['kind' => 'column', 'column' => 'type_id', 'table' => 'video_types'], 'rating' => null],
        'song' => ['model' => Song::class, 'year' => 'year', 'done_at' => 'played_at', 'genres' => ['kind' => 'pivot', 'table' => 'song_genre_song', 'local' => 'song_id', 'foreign' => 'song_genre_id', 'dictionary' => 'song_genres'], 'rating' => 'rating'],
        /* წიგნს დასრულების თავისი სვეტი აქვს. */
        'book' => ['model' => Book::class, 'year' => 'year', 'done_at' => 'finished_at', 'genres' => ['kind' => 'column', 'column' => 'genre_id', 'table' => 'book_genres'], 'rating' => 'rating'],
        /* სამაგიდო თამაშს სტატუსი და შეძენის თარიღი აღარ აქვს, ე.ი.
           თვეების ჭრილი და მიზანი მას არ ეხება. */
        'board_game' => ['model' => BoardGame::class, 'year' => 'year', 'done_at' => null, 'genres' => ['kind' => 'column', 'column' => 'genre_id', 'table' => 'board_game_genres'], 'rating' => 'rating'],
        'game' => ['model' => Game::class, 'year' => 'release_date', 'done_at' => 'finished_at', 'genres' => ['kind' => 'pivot', 'table' => 'game_genre_game', 'local' => 'game_id', 'foreign' => 'game_genre_id', 'dictionary' => 'game_genres'], 'rating' => 'rating'],
        'note' => ['model' => NoteEntry::class, 'year' => null, 'done_at' => 'finished_at', 'genres' => ['kind' => 'column', 'column' => 'category_id', 'table' => 'note_categories'], 'rating' => null],
        'bookmark' => ['model' => Bookmark::class, 'year' => null, 'done_at' => 'visited_at', 'genres' => ['kind' => 'column', 'column' => 'category_id', 'table' => 'bookmark_categories'], 'rating' => null],
        /* ⚠️ `done_at` **`finished_at`-ია და არა `updated_at`**:
           „წელს რამდენი დავასრულე" სწორედ ამით ითვლება. */
        'course' => ['model' => Course::class, 'year' => null, 'done_at' => 'finished_at', 'genres' => ['kind' => 'column', 'column' => 'category_id', 'table' => 'course_categories'], 'rating' => null],
        // ⚠️ `done_at` = `visited_at` — „წელს სად ვიყავი“ სწორედ ეს კითხვაა
        'place' => ['model' => Place::class, 'year' => null, 'done_at' => 'visited_at', 'genres' => ['kind' => 'column', 'column' => 'category_id', 'table' => 'place_categories'], 'rating' => 'rating'],
        /* პირადი გალერეა ფოტოებსა და ვიდეოებს ითვლის (და არა ადამიანებს);
           თვეების ჭრილი „როდის გადავიღე"-ა (`taken_at`). */
        'personal' => ['model' => PersonalMedia::class, 'year' => null, 'done_at' => 'taken_at', 'genres' => null, 'rating' => null],
        // მორიგეობის დღე „შესრულების“ თარიღია (თვეების მრუდი)
        'duty' => ['model' => DutyShift::class, 'year' => null, 'done_at' => 'date', 'genres' => null, 'rating' => null],
    ];

    /** რამდენი ჟანრი/კატეგორია ჩანს ჭრილში — დანარჩენი „სხვა"-ში იყრება */
    private const TOP_GENRES = 12;

    /** „ვინ არის ჩემი ყველაზე ხშირი მსახიობი": ათეული */
    private const TOP_ACTORS = 10;

    public static function modules(): array
    {
        return array_keys(self::MODULES);
    }

    public static function has(string $module): bool
    {
        return isset(self::MODULES[$module]) || CustomModules::exists($module);
    }

    /**
     * **მოდულის რუკა** — საბაზისოზე `MODULES`-იდან, პირად მოდულზე
     * მისი აღწერიდან.
     *
     * ⚠️ პირადი მოდული რუკაში ვერ ჩაიწერება (გასაღები ინტერფეისიდან იქმნება),
     * მაგრამ მისი ფორმა ყოველთვის ერთია: დასრულების თარიღი `finished_at`-ია
     * (მიზანი და თვეების ჭრილი ნამდვილ თარიღს ითვლის),
     * კლასიფიკაცია — ზოგადი კლასიფიკატორის სვეტი, თუ მოდულს ის აქვს; წელი და
     * ქულა მას არ აქვს.
     *
     * @return array<string, mixed>|null
     */
    private static function map(string $module): ?array
    {
        if (isset(self::MODULES[$module])) {
            return self::MODULES[$module];
        }

        if (! CustomModules::isKey($module)) {
            return null;
        }

        return [
            'model' => CustomRecord::class,
            'year' => null,
            'done_at' => 'finished_at',
            'genres' => CustomModules::classifies($module)
                ? ['kind' => 'column', 'column' => 'category_id', 'table' => 'custom_categories']
                : null,
            'rating' => null,
            'custom' => true,
        ];
    }

    /**
     * ერთი მოდულის ჩანაწერების ფაბრიკა (`$base`).
     *
     * ⚠️ **პირად მოდულზე მოდულითაც იჭრება** — ერთი ცხრილი ყველა პირად მოდულს
     * ემსახურება, ე.ი. `user_id` მარტო მეზობელი მოდულის ჩანაწერებსაც დათვლიდა.
     *
     * @param  array<string, mixed>  $map
     */
    private function base(User $user, string $module, array $map): callable
    {
        $model = $map['model'];

        return fn () => $model::withoutGlobalScope('owner')
            ->where('user_id', $user->getKey())
            ->when(! empty($map['custom']), fn ($q) => $q->where('module', $module))
            // სტატისტიკა ჩაკეტილის გარეშე, სესიის მიუხედავად
            ->when(RecordLocks::hides($model), fn ($q) => $q->withoutLocked());
    }

    /**
     * ერთი მოდულის ყველა ჭრილი.
     *
     * ⚠️ **თითოეული ჭრილი ახალ query-ს იღებს (`$base` ფაბრიკა) და არა
     * საერთოს.** `select('id')`-ის ან `groupBy`-ის დამატება builder-ს
     * **ადგილზე** ცვლის, ე.ი. გაზიარებული ობიექტი მეორე ჭრილს ჩუმად
     * გაუფუჭებდა — სწორედ ამიტომ ბრუნდებოდა წლების სია ცარიელი.
     *
     * @param  int|null  $year  თვეების ჭრილის წელი (`null` — მიმდინარე)
     * @return array<string, mixed>
     */
    public function forModule(User $user, string $module, ?int $year = null): array
    {
        $map = self::map($module);
        $base = $this->base($user, $module, $map);

        return [
            'module' => $module,
            'total' => $base()->count(),
            'favorites' => $base()->where('is_favorite', true)->count(),
            'status' => $this->byStatus($base, $module),
            'years' => $map['year'] ? $this->byYear($base, $map['year']) : [],
            'genres' => $map['genres'] ? $this->byGenre($base, $map['genres']) : [],
            'ratings' => $map['rating'] ? $this->byRating($base, $map['rating']) : [],
            /* მედია-დომენები თვეებს **ნახვების ჟურნალიდან** კითხულობენ,
               ე.ი. ხელახლა ნახვასაც ითვლიან; დანარჩენი — `done_at` სვეტიდან. */
            'months' => isset($map['watch_log'])
                ? $this->byWatchLog($user, $map['watch_log'], $year)
                : ($map['done_at'] ? $this->byMonth($base, $map['done_at'], $year) : []),
            'has_months' => $map['done_at'] !== null,
            /* „ვინ არის ჩემი ყველაზე ხშირი მსახიობი" თითო მედია-ჩანართში
               (ადრე „მედიის" საერთო ჩანართში იყო, მერე სამ ჩანართად დაიყო). */
            'actors' => isset($map['watch_log']) ? $this->topActors($user, $map['watch_log'], $base) : [],
            /* ჩანართის თავის ერთი ხაზი („წელს 42 · შარშან 35").
               ⚠️ `null` = მოდულს „როდის დავასრულე" არ აქვს და ხაზი არ იხატება;
               ნული კი ნამდვილი პასუხია. */
            'this_year' => $this->doneIn($user, $map, $base, $year ?? (int) now()->format('Y')),
            'last_year' => $this->doneIn($user, $map, $base, ($year ?? (int) now()->format('Y')) - 1),
        ];
    }

    /**
     * **ყველაზე ხშირი მსახიობები ერთ მედია-დომენში** — რამდენ **ჩემს** ჩანაწერში თამაშობს.
     *
     * ⚠️ „მედიის" ჩანართი სამ ჩანართად დაიყო, ე.ი. ტოპი
     * დომენ-დომენ ითვლება და აღარ იკრიბება. ⚠️ **`castable_type`-ით გაფილტრული** —
     * polymorphic ცხრილი სამივე დომენს ერთად ინახავს (`byGenre()`-ის იგივე
     * ხაფანგი); წაშლილი (`is_removed`) და ჩემ მიერ ჩაკეტილი მსახიობი არ
     * ითვლება, დამალული კი ითვლება — „ამ ფილმში თამაშობს" ფაქტია.
     *
     * @return list<array<string, mixed>>
     */
    private function topActors(User $user, string $domain, callable $base): array
    {
        $rows = RecordLocks::exclude(DB::table('castables'), 'cast_member', 'castables.cast_member_id', owner: (int) $user->getKey())
            ->where('castable_type', $domain)
            ->where('is_removed', false)
            ->whereIn('castable_id', $base()->toBase()->select('id'))
            ->groupBy('cast_member_id')
            ->selectRaw('cast_member_id as cid, count(*) as total')
            ->orderByDesc('total')
            ->orderBy('cid')
            ->limit(self::TOP_ACTORS)
            ->get();

        // ⚠️ ერთი query ათივეზე — სახელი და ფოტო გლობალურ ლექსიკონშია
        $people = CastMember::whereIn('id', $rows->pluck('cid')->all())->get()->keyBy('id');

        return $rows
            ->filter(fn ($row) => isset($people[$row->cid]))
            ->map(fn ($row) => [
                'id' => (int) $row->cid,
                'name' => $people[$row->cid]->name,
                'name_ka' => $people[$row->cid]->name_ka,
                'photo_path' => $people[$row->cid]->photo_path,
                'count' => (int) $row->total,
            ])
            ->values()
            ->all();
    }

    /**
     * რამდენი დავასრულე ერთ წელს — მედიაზე ნახვების ჟურნალიდან, დანარჩენზე
     * `done_at`-იდან. `null` — მოდულს დასრულების თარიღი არ აქვს.
     *
     * @param  array<string, mixed>  $map
     */
    private function doneIn(User $user, array $map, callable $base, int $year): ?int
    {
        if (isset($map['watch_log'])) {
            return DB::table('media_watches')
                ->where('user_id', $user->getKey())
                ->where('watchable_type', $map['watch_log'])
                ->whereNull('trashed_at')
                ->whereYear('watched_at', $year)
                ->count();
        }

        if (! $map['done_at']) {
            return null;
        }

        return $base()->toBase()->whereNotNull($map['done_at'])->whereYear($map['done_at'], $year)->count();
    }

    /**
     * რომელ წლებში მაქვს საერთოდ აქტივობა — წლის ამომრჩევს სია სჭირდება.
     *
     * ⚠️ **გამოშვების წელი აქ არ ითვლება.** „2011 წლის ფილმი" და „2011-ში
     * ვნახე" ორი სხვადასხვა ფაქტია; ამომრჩევი მეორეს ეხება, ე.ი. სიაში
     * მხოლოდ `done_at`-იანი მოდულები მონაწილეობენ.
     *
     * @param  list<string>  $modules
     * @return list<int>
     */
    public function activeYears(User $user, array $modules): array
    {
        $years = [];

        foreach ($modules as $module) {
            $map = self::map($module);

            if (! $map || ! $map['done_at']) {
                continue;
            }

            $column = $map['done_at'];

            $found = $this->base($user, $module, $map)()
                ->whereNotNull($column)
                ->toBase()
                ->distinct()
                ->selectRaw(SqlDate::year($column).' as bucket')
                ->pluck('bucket')
                ->all();

            $years = [...$years, ...$found];
        }

        $years = array_values(array_unique(array_filter(array_map('intval', $years))));
        rsort($years);

        return $years;
    }

    /**
     * დეშბორდის მოკლე ჯამი.
     *
     * ⚠️ **ეს `forModule()`-ის შემოკლება არ არის.** ის თითო მოდულზე ხუთ
     * ჭრილს აგებს (ჟანრი, ქულა, გამოშვების წელი), ე.ი. ათი მოდული
     * ~50 query-ა; დეშბორდი კი მთავარი გვერდია და შედეგს მეორე წამში
     * უნდა აბრუნებდეს. ამიტომ სკალარები ერთ პირობით აგრეგატში იკითხება
     * — თითო მოდულზე ორი query, სულ ~16.
     *
     * ⚠️ **წელი პარამეტრი არ არის და ეს განზრახია.** დეშბორდი „რა მახსოვს
     * და რა გავაკეთე ბოლო დროს" გვერდია; წლის ამორჩევანი `/stats`-ისაა.
     * უამისოდ „ამ თვეში" საერთოდ ვერ ითქმებოდა: არჩეულ 2019 წელს
     * „ამ თვეს" აზრი არ აქვს.
     *
     * ⚠️ **გალერეა აქ არ ითვლება და ეს გამორჩენა არ არის** — მისი შიგთავსი
     * **ფაილებია** და არა ჩანაწერები, ზუსტად ისევე, როგორც `ExportDomain`-ში.
     * ამიტომ „სულ ჩანაწერი" ბარათების ჯამს გალერეის ოდენობით
     * შეიძლება დააკლდეს.
     *
     * @param  list<string>  $modules
     * @return array<string, mixed>
     */
    public function summary(User $user, array $modules): array
    {
        $now = now();
        $year = (int) $now->format('Y');
        $month = (int) $now->format('n');

        $records = 0;
        $favorites = 0;
        $doneYear = 0;
        $doneMonth = 0;
        $months = array_fill(1, 12, 0);
        /* წლიური მიზნებისთვის იგივე რიცხვი **მოდულებად**.
           ⚠️ ცალკე query არ ემატება: თვეების სტრიქონები ისედაც მოდულ-მოდულ
           იკითხება, ე.ი. აქ მხოლოდ მეორე ჯამი გროვდება. ორი წყარო ერთი
           კითხვისთვის ორ განსხვავებულ რიცხვს მოგვცემდა (`byWatchLog()`-ის
           იგივე გაკვეთილი). */
        $doneByModule = [];

        foreach ($modules as $module) {
            $map = self::map($module);

            if (! $map) {
                continue;
            }

            $base = $this->base($user, $module, $map);

            /* ⚠️ ორი რიცხვი — ერთი query. `sum(case when …)` ორივე დრაივერზე
               ერთნაირად მუშაობს (boolean ორივეგან 0/1-ია), `count()`-ის და
               `where()`-ის ორი ცალკე გამოძახება კი ორი წასვლაა ბაზაში. */
            $row = $base()->toBase()
                ->selectRaw('count(*) as total')
                ->selectRaw('sum(case when is_favorite = 1 then 1 else 0 end) as favorites')
                ->first();

            $records += (int) ($row->total ?? 0);
            $favorites += (int) ($row->favorites ?? 0);

            if (! $map['done_at']) {
                continue;
            }

            /* მედიაზე თვეები **ჟურნალიდან** იკითხება, ე.ი. ჯამიც
               ხელახლა ნახვებს ითვლის. ⚠️ ორი სხვადასხვა წყარო ერთსა და იმავე
               კითხვაზე (`/stats` და დეშბორდი) ორ განსხვავებულ რიცხვს
               აჩვენებდა — და განსხვავებას ვერავინ ახსნიდა. */
            $rows = isset($map['watch_log'])
                ? collect($this->byWatchLog($user, $map['watch_log'], $year))
                    ->map(fn (array $row) => (object) ['bucket' => $row['month'], 'total' => $row['count']])
                : $this->monthRows($base, $map['done_at'], $year);

            foreach ($rows as $bucket) {
                $index = (int) $bucket->bucket;

                if ($index < 1 || $index > 12) {
                    continue;
                }

                $count = (int) $bucket->total;

                $months[$index] += $count;
                $doneByModule[$module] = ($doneByModule[$module] ?? 0) + $count;

                /* ⚠️ წლიური ჯამი აქვე იკრიბება და არა ცალკე query-თ: თვეები
                   ისედაც მთელ წელს ფარავს, ე.ი. მეორე დათვლა იმავე რიცხვს
                   მიიღებდა — და განსხვავებაც კი ვერასდროს აიხსნებოდა. */
                $doneYear += $count;

                if ($index === $month) {
                    $doneMonth += $count;
                }
            }
        }

        return [
            'year' => $year,
            'month' => $month,
            'totals' => [
                'records' => $records,
                'favorites' => $favorites,
                'done_year' => $doneYear,
                'done_month' => $doneMonth,
            ],
            'months' => array_map(
                fn (int $index) => ['month' => $index, 'count' => $months[$index]],
                range(1, 12),
            ),
            /* იგივე რიცხვი მოდულებად, **ნულებით შევსებული**:
               გამოტოვებული გასაღები ინტერფეისში „მიზანი არ არსებობს"-ად
               წაიკითხებოდა და არა „ჯერ არაფერი დაგისრულებია". */
            'done_by_module' => collect(self::goalModules($modules))
                ->mapWithKeys(fn (string $module) => [$module => $doneByModule[$module] ?? 0])
                ->all(),
            /* ⚠️ **რომელ მოდულს შეიძლება მიზანი ჰქონდეს საერთოდ.** მიზანი
               „წელს რამდენი დავასრულე"-ს ითვლის, ე.ი. მოდულს თარიღი უნდა
               ჰქონდეს (`done_at`). წიგნს, თამაშს, სამაგიდოსა და ჩანაწერს ის
               **არ აქვს** — და `updated_at`-ით ჩანაცვლება ზუსტად ის იქნებოდა,
               რასაც თვეების ჭრილი თავიდან იცილებს (ერთ სვეტში ორი ფაქტი). */
            'goal_modules' => array_values(self::goalModules($modules)),
            /* **რომელ ჩემს მოდულს არ შეუძლია მიზანი** (დასრულების
               თარიღი არ აქვს — დღეს სამაგიდო თამაში). სია სერვერზეა, რომ
               გალერეის მსგავსი არა-ჩანაწერიანი მოდული „აკლიად" არ ჩაითვალოს. */
            'no_goal_modules' => array_values(array_diff($modules, self::goalModules($modules))),
        ];
    }

    /**
     * **სტატისტიკიდან სიაზე**: გრაფიკის ზოლზე დაჭერა სიას იმავე
     * ჭრილით ფილტრავს.
     *
     * ⚠️ სვეტები **იგივე რუკიდანაა** (`MODULES`), რომლითაც ზოლი დაითვალა — ე.ი.
     * სიის რიცხვი ზოლის რიცხვს ემთხვევა; სხვა სვეტი (მაგ. შექმნის თარიღი) მას
     * აცდებოდა.
     *
     * - `done=YYYY-MM` — „როდის დავასრულე" (`done_at`);
     * - `watched=YYYY-MM` — მედია: ნახვების ჟურნალი (ხელახლა ნახვაც ითვლება);
     * - `year_min`/`year_max` — გამოშვების წელი (მედიას თავისი, უფრო ძველი ფილტრი აქვს);
     * - `my_rating_min`/`my_rating_max` — **შენი** ქულა (მედიაზე `my_rating` — `rating_*` იქ TMDB-ისაა).
     */
    public static function drill(Builder $query, string $module, Request $request): void
    {
        $map = self::map($module);

        if (! $map) {
            return;
        }

        $table = $query->getModel()->getTable();
        $month = function (string $key) use ($request): ?array {
            if (! preg_match('/^(\d{4})-(\d{2})$/', (string) $request->query($key), $m) || (int) $m[2] < 1 || (int) $m[2] > 12) {
                return null;
            }

            return [(int) $m[1], (int) $m[2]];
        };

        if (isset($map['watch_log'])) {
            if ($ym = $month('watched')) {
                $query->whereExists(fn ($w) => $w->from('media_watches')
                    ->whereColumn('media_watches.watchable_id', $table.'.id')
                    ->where('media_watches.watchable_type', $map['watch_log'])
                    ->whereNull('media_watches.trashed_at')
                    ->whereYear('media_watches.watched_at', $ym[0])
                    ->whereMonth('media_watches.watched_at', $ym[1]));
            }
        } elseif ($map['done_at'] && ($ym = $month('done'))) {
            $query->whereYear($table.'.'.$map['done_at'], $ym[0])->whereMonth($table.'.'.$map['done_at'], $ym[1]);
        }

        if ($map['year'] && ! isset($map['watch_log'])) {
            $column = $table.'.'.$map['year'];
            $expr = str_contains($map['year'], 'date') ? SqlDate::year($column) : $column;

            foreach (['year_min' => '>=', 'year_max' => '<='] as $key => $op) {
                if (is_numeric($request->query($key))) {
                    $query->whereRaw("{$expr} {$op} ?", [(int) $request->query($key)]);
                }
            }
        }

        if ($map['rating']) {
            foreach (['my_rating_min' => '>=', 'my_rating_max' => '<='] as $key => $op) {
                if (is_numeric($request->query($key))) {
                    $query->where($table.'.'.$map['rating'], $op, (float) $request->query($key));
                }
            }
        }
    }

    /**
     * **რომელ მოდულს შეუძლია წლიური მიზანი.**
     *
     * ⚠️ მხოლოდ ისინი, ვისაც „როდის დავასრულე" თარიღი აქვს — სხვაგვარად
     * მიზნის პროგრესი გამოსათვლელი არ არის. სია `MODULES`-იდან გამოითვლება
     * და არა ხელით: მეთერთმეტე მოდული ავტომატურად შემოვა ან დარჩება გარეთ.
     *
     * @param  list<string>  $modules
     * @return list<string>
     */
    public static function goalModules(array $modules): array
    {
        return array_values(array_filter(
            $modules,
            fn (string $module) => ! empty(self::map($module)['done_at'] ?? null),
        ));
    }

    /* ---------- ჭრილები ---------- */

    /**
     * სტატუსი — ორი მექანიზმი ერთდროულად.
     *
     * ⚠️ ექვს დომენს **per-user ლექსიკონი** აქვს (`status_id`), სამს —
     * enum-სვეტი. ერთი `groupBy('status')` ორივეზე შეუძლებელია, ხოლო
     * ლექსიკონის სახელი მხოლოდ **მფლობელის** რიგშია, ე.ი. აქვე უნდა
     * ამოიკითხოს — `id`-ს დაბრუნება გვერდს ვერაფერს ეტყოდა.
     *
     * ⚠️ **რიგი ლექსიკონისაა**: სტატუსი ერთ დაწყობილ ზოლად
     * იხატება, ე.ი. სეგმენტების თანმიმდევრობა თვითონ ამბობს რამეს
     * („საყურებელი → ვუყურებ → ნანახი"). `groupBy`-ის რიგი დრაივერისაა —
     * ლექსიკონზე `sort_order` წყვეტს, enum-ზე მოდელის `STATUSES`.
     */
    private function byStatus(callable $base, string $module): array
    {
        if (! StatusDomain::usesDictionary($module)) {
            $model = self::map($module)['model'];
            $table = (new $model)->getTable();

            if (! Schema::hasColumn($table, 'status')) {
                return [];
            }

            $order = defined($model.'::STATUSES') ? array_flip($model::STATUSES) : [];

            return $base()->toBase()
                ->whereNotNull('status')
                ->groupBy('status')
                ->selectRaw('status, count(*) as total')
                ->get()
                ->sortBy(fn ($row) => $order[$row->status] ?? PHP_INT_MAX)
                ->values()
                ->map(fn ($row) => [
                    'key' => $row->status,
                    'name_ka' => null,
                    'name_en' => null,
                    'role' => null,
                    'color' => null,
                    'count' => (int) $row->total,
                ])
                ->all();
        }

        $counts = $base()->toBase()
            ->whereNotNull('status_id')
            ->groupBy('status_id')
            ->selectRaw('status_id, count(*) as total')
            ->pluck('total', 'status_id');

        $rows = Status::withoutGlobalScope('owner')
            ->whereIn('id', $counts->keys()->all())
            ->get()
            ->keyBy('id');

        return $counts->sortBy(fn ($count, $id) => $rows[$id]->sort_order ?? PHP_INT_MAX)->map(fn ($count, $id) => [
            'key' => $rows[$id]->key ?? null,
            'name_ka' => $rows[$id]->name_ka ?? null,
            'name_en' => $rows[$id]->name_en ?? null,
            'role' => $rows[$id]->role ?? null,
            'color' => $rows[$id]->color ?? null,
            'count' => (int) $count,
        ])->values()->all();
    }

    /**
     * გამოშვების წლები.
     *
     * ⚠️ `game` წელს **თარიღად** ინახავს (`release_date`) და არა რიცხვად —
     * `year` სვეტი მას საერთოდ არ აქვს (აქსესორია). ამიტომ გამოსახულება
     * სვეტის ტიპიდან იგება და არა დომენიდან.
     */
    private function byYear(callable $base, string $column): array
    {
        $expr = str_contains($column, 'date') ? SqlDate::year($column) : $column;

        return $base()->toBase()
            ->whereNotNull($column)
            ->groupByRaw($expr)
            ->orderByRaw($expr)
            ->selectRaw($expr.' as bucket, count(*) as total')
            ->get()
            ->map(fn ($row) => ['year' => (int) $row->bucket, 'count' => (int) $row->total])
            ->filter(fn (array $row) => $row['year'] > 0)
            ->values()
            ->all();
    }

    /** ჟანრი/კატეგორია/ტიპი — სამივე ფორმა ერთ ფუნქციაში */
    private function byGenre(callable $base, array $map): array
    {
        if ($map['kind'] === 'column') {
            $counts = $base()->toBase()
                ->whereNotNull($map['column'])
                ->groupBy($map['column'])
                ->selectRaw($map['column'].' as gid, count(*) as total')
                ->pluck('total', 'gid');

            return $this->named($counts, $map['table']);
        }

        [$table, $local, $foreign, $dictionary] = $map['kind'] === 'pivot'
            ? [$map['table'], $map['local'], $map['foreign'], $map['dictionary']]
            /* გლობალური polymorphic — ერთი ცხრილი სამივე მედია-დომენზე,
               ამიტომ `genreable_type`-ის ფილტრი სავალდებულოა: მის გარეშე
               სერიალის ჟანრები ფილმების ჭრილში აღმოჩნდებოდა. */
            : ['genreables', 'genreable_id', 'genre_id', 'genres'];

        $pivot = DB::table($table)
            ->whereIn($local, $base()->toBase()->select('id'))
            ->groupBy($foreign)
            ->selectRaw($foreign.' as gid, count(*) as total');

        if ($map['kind'] === 'morph') {
            $pivot->where('genreable_type', $map['alias']);
        }

        return $this->named($pivot->pluck('total', 'gid'), $dictionary);
    }

    /**
     * id → სახელი, ჭრილის სახით.
     *
     * ⚠️ **გლობალური `genres` სახელს ცალკე ცხრილში ინახავს** (თარგმანები),
     * per-user ლექსიკონები კი სვეტებში — ამიტომ პირველი მოდელით იკითხება
     * (აქსესორები) და დანარჩენი პირდაპირ.
     */
    private function named($counts, string $dictionary): array
    {
        $ids = $counts->keys()->filter()->all();

        /* გლობალურ ჟანრს `slug` ახლავს: მედიის სია ჟანრით **slug-ით**
           ფილტრავს (`?genre=drama`), ლექსიკონები კი id-ით — ზოლზე დაჭერას ორივე სჭირდება. */
        $names = $dictionary === 'genres'
            ? Genre::whereIn('id', $ids)->get()->mapWithKeys(fn (Genre $g) => [$g->id => ['ka' => $g->name_ka, 'en' => $g->name_en, 'slug' => $g->slug]])
            : DB::table($dictionary)->whereIn('id', $ids)->get()->mapWithKeys(fn ($r) => [$r->id => ['ka' => $r->name_ka ?? null, 'en' => $r->name_en ?? null, 'slug' => null]]);

        $rows = $counts->map(fn ($count, $id) => [
            'id' => (int) $id,
            'name_ka' => $names[$id]['ka'] ?? null,
            'name_en' => $names[$id]['en'] ?? null,
            'slug' => $names[$id]['slug'] ?? null,
            'count' => (int) $count,
        ])->values()->sortByDesc('count')->values();

        /* ⚠️ **ჭრა ჯამს არ კარგავს**: დანარჩენი ერთ „სხვა" რიგში იყრება,
           თორემ ზოლების ჯამი მთლიან რიცხვს აღარ დაემთხვეოდა და გრაფიკი
           ჩუმად მოტყუვდებოდა. */
        if ($rows->count() <= self::TOP_GENRES) {
            return $rows->all();
        }

        $top = $rows->take(self::TOP_GENRES);
        $rest = $rows->skip(self::TOP_GENRES);

        return [...$top->all(), [
            'id' => 0,
            'name_ka' => null,
            'name_en' => null,
            'slug' => null,
            'count' => (int) $rest->sum('count'),
            'rest' => $rest->count(),
        ]];
    }

    /**
     * ქულების განაწილება.
     *
     * ⚠️ **დამრგვალება PHP-შია** — `rating` `decimal(3,1)`-ია და SQL-ის
     * `round()` ორ დრაივერზე სხვადასხვა ტიპს აბრუნებს; განსხვავებული
     * მნიშვნელობა კი ათამდეა, ე.ი. დაჯგუფება ისედაც იაფია.
     */
    private function byRating(callable $base, string $column): array
    {
        $buckets = [];

        $rows = $base()->toBase()
            ->whereNotNull($column)
            ->groupBy($column)
            ->selectRaw("{$column} as rating, count(*) as total")
            ->get();

        foreach ($rows as $row) {
            $bucket = (int) round((float) $row->rating);

            if ($bucket < 1) {
                continue;
            }

            $buckets[$bucket] = ($buckets[$bucket] ?? 0) + (int) $row->total;
        }

        ksort($buckets);

        return array_map(
            fn (int $score) => ['score' => $score, 'count' => $buckets[$score]],
            array_keys($buckets),
        );
    }

    /**
     * თვეები არჩეულ წელს.
     *
     * ⚠️ **თორმეტივე თვე ბრუნდება, ნულებიანიც.** მხოლოდ არსებული თვეების
     * დაბრუნება წელს არათანაბრად დაჭიმავდა და „ივლისში არაფერი" იმ
     * თვისგან ვერ განირჩეოდა, რომელიც სიაშივე არ იყო.
     */
    private function byMonth(callable $base, string $column, ?int $year): array
    {
        $counts = $this->monthRows($base, $column, $year ?? (int) now()->format('Y'))
            ->mapWithKeys(fn ($row) => [(int) $row->bucket => (int) $row->total]);

        return $this->months($counts);
    }

    /**
     * ⚠️ **ერთი query ორ გამომძახებელზე** (`byMonth()` და `summary()`) —
     * ორი ასლი პირველივე შეცვლაზე დაშორდებოდა და გვერდი დეშბორდს
     * აცდებოდა, ისე რომ არცერთი არ იქნებოდა ცხადად მცდარი.
     */
    private function monthRows(callable $base, string $column, int $year): Collection
    {
        $expr = SqlDate::month($column);

        return $base()->toBase()
            ->whereNotNull($column)
            ->whereYear($column, $year)
            ->groupByRaw($expr)
            ->selectRaw($expr.' as bucket, count(*) as total')
            ->get();
    }

    /**
     * თვეები **ნახვების ჟურნალიდან**.
     *
     * ⚠️ **ეს ზუსტად ის მიზეზია, რის გამოც ჟურნალი დაიწერა.** `watched_at`
     * ერთი მომენტია, ე.ი. „წელს რამდენი ვნახე" **გამეორებებს ვერ ითვლიდა**:
     * მარტში ნანახი და სექტემბერში ხელახლა ნანახი ფილმი ერთ თვეში ჩანდა
     * და მეორეში — არა.
     *
     * ⚠️ **`DB::table()` და არა Eloquent** — `media_watches`-ს `owner` scope
     * აქვს და კონსოლიდან (სტატისტიკა რექვესთის გარეთაც გამოიძახება)
     * `Auth::id()` ცარიელია; ცხადი `user_id` იგივე წესია, რასაც მთელი
     * ეს კლასი მიჰყვება.
     */
    private function byWatchLog(User $user, string $alias, ?int $year): array
    {
        $year ??= (int) now()->format('Y');
        $expr = SqlDate::month('watched_at');

        $counts = RecordLocks::excludeMorph(DB::table('media_watches'), 'media_watches.watchable_type', 'media_watches.watchable_id', session: false)
            ->where('user_id', $user->getKey())
            ->where('watchable_type', $alias)
            // ⚠️ ურნაში მყოფი ნახვა აღარ ითვლება (ნედლ ცხრილს scope არ აქვს)
            ->whereNull('trashed_at')
            ->whereYear('watched_at', $year)
            ->groupByRaw($expr)
            ->selectRaw($expr.' as bucket, count(*) as total')
            ->get()
            ->mapWithKeys(fn ($row) => [(int) $row->bucket => (int) $row->total]);

        return $this->months($counts);
    }

    /**
     * ⚠️ **თორმეტივე თვე ბრუნდება, ნულებიანიც** — მხოლოდ არსებული თვეების
     * დაბრუნება წელს არათანაბრად დაჭიმავდა და „ივლისში არაფერი" იმ
     * თვისგან ვერ განირჩეოდა, რომელიც სიაშივე არ იყო.
     */
    private function months(Collection $counts): array
    {
        return array_map(
            fn (int $month) => ['month' => $month, 'count' => (int) ($counts[$month] ?? 0)],
            range(1, 12),
        );
    }
}
