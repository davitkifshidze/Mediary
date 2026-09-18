<?php

namespace App\Services\Profile;

use App\Http\Resources\StatusResource;
use App\Models\User;
use App\Services\Modules\FieldSettings;
use App\Support\PublicDomain;
use App\Support\StatusDomain;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks §16.2 — დამთხვევები („ერთნაირად გავაკეთეთ").**
 *
 * ორ **საჯარო** პროფილს შორის საერთო ჩანაწერები, დომენებად დაშლილი, +
 * მსგავსების ინდექსი.
 *
 * ⚠️ **ორივე მხარე მხოლოდ `public` ჩანაწერებით ითვლება** — ეს §16.2-ის ცხადი
 * წესია („პრივატული არასდროს გაჟონავს"). ტექნიკურად ამას ის უზრუნველყოფს, რომ
 * **ორივე მხარე `PublicProfileService::query()`-ზე გადის** — იგივე სამფენოვანი
 * query, რაც საჯარო პროფილს კვებავს. ცალკე „დამთხვევის query" განზრახ არ იწერება:
 * ორი წყარო დროთა განმავლობაში დაშორდებოდა და ერთი მათგანი პრივატულს გაუშვებდა.
 *
 * ⚠️ **ქეში განზრახ არ არის** (§16.2 მას ითხოვდა — იხ. ქვემოთ). ის შენიშვნა
 * დაწერილი იყო *cross-user join*-ის დაშვებით, ორ **სრულ** ცხრილს შორის. აქ
 * join არაა: თითო მხარე კითხულობს **მხოლოდ თავის საჯარო** რიგებს
 * `(user_id, visibility)` ინდექსით და გადაკვეთა PHP-შია. ე.ი. საქეშირებელი
 * ჯერ არაფერია, ქეში კი **რეალურ რისკს** შემატებდა: ჩანაწერის დაპრივატებიდან
 * TTL-ის ბოლომდე რიცხვი მას მაინც ითვლიდა — ესეც გაჟონვაა, თუნდაც აგრეგატული.
 * **როდის გადავიხედოთ:** როცა ერთ ანგარიშს ათასობით საჯარო ჩანაწერი ექნება,
 * ან პროფილების სია გამოჩნდება („ვისთან ჰგავს ჩემი გემოვნება" ყველაზე). მაშინ
 * ქეშის გასაღებში **შიგთავსის ბეჭედი** უნდა ჩაჯდეს (რაოდენობა + `max(updated_at)`),
 * და არა მარტო TTL — თორემ გაუქმების ადგილს ვინმე დაავიწყდება.
 */
class MatchService
{
    /**
     * **რამდენ პროფილს ვადარებთ ერთ რექვესთში** („ვისთან ჰგავს ჩემი გემოვნება").
     *
     * ⚠️ ჭერი **აუცილებელია და არა სიფრთხილე**: თითო პროფილზე ითვლება
     * `summary()`, ე.ი. მისი საჯარო რიგები დომენებად. ეს ზუსტი შედეგია და
     * არა მიახლოებითი — მაგრამ წრფივად იზრდება. ჭერს რომ გადავაბიჯოთ,
     * პასუხში `truncated` ჩნდება, რომ UI-მ სიმართლე თქვას და არა
     * „ესაა ყველა".
     *
     * **რა უნდა გაკეთდეს, როცა ეს აღარ იკმარებს:** ქეში **შიგთავსის
     * ბეჭდით** (რაოდენობა + `max(updated_at)` თითო user/დომენზე), და არა
     * TTL-ით — იხ. კლასის docblock-ის „როდის გადავიხედოთ".
     */
    public const MAX_PROFILES = 50;

    /** ერთი რექვესთის ფარგლებში წაკითხულის დამახსოვრება (ჯამიც და სიაც ერთსა და იმავეს კითხულობს) */
    private array $memo = [];

    public function __construct(
        private PublicProfileService $profiles,
        private FieldSettings $fields,
    ) {}

    /**
     * დომენები, რომლებზეც ორივე მხარეს შეიძლება დამთხვევა ჰქონდეს:
     * **ორივეს** უნდა ჰქონდეს მოდული საჯარო და დომენი შედარებადი უნდა იყოს.
     *
     * @return list<string>
     */
    public function domains(User $a, User $b): array
    {
        $mine = $this->profiles->domains($a);
        $theirs = $this->profiles->domains($b);

        return array_values(array_filter(
            PublicDomain::matchable(),
            fn (string $d) => in_array($d, $mine, true) && in_array($d, $theirs, true),
        ));
    }

    /**
     * ჯამური სურათი — თითო დომენზე რაოდენობები და მსგავსების ინდექსი.
     *
     * `percent` **Jaccard-ია** (საერთო ÷ გაერთიანება) და არა „საერთო ÷ ჩემი":
     * უკანასკნელი ასიმეტრიულია — ვისაც ორი ფილმი აქვს და ორივე საერთოა, 100%-ს
     * მიიღებდა იმისგან, ვისაც ხუთასი აქვს. §16.2 სწორედ „მსგავსების ინდექსს" ითხოვს.
     */
    public function summary(User $a, User $b): array
    {
        $rows = [];
        $sharedTotal = 0;
        $unionTotal = 0;
        $doneTotal = 0;

        foreach ($this->domains($a, $b) as $domain) {
            $mine = $this->keys($a, $domain);
            $theirs = $this->keys($b, $domain);

            $shared = array_values(array_intersect($mine, $theirs));
            $union = count($mine) + count($theirs) - count($shared);

            $sharedTotal += count($shared);
            $unionTotal += $union;

            $done = $this->bothDone($a, $b, $domain, $shared);
            $doneTotal += $done ?? 0;

            $rows[] = [
                'domain' => $domain,
                'shared' => count($shared),
                // `null` — დომენს სტატუსი არ აქვს (ვიდეო/სიმღერა)
                'both_done' => $done,
                'done_status' => PublicDomain::doneStatus($domain),
                'mine' => count($mine),
                'theirs' => count($theirs),
                'percent' => $this->percent(count($shared), $union),
            ];
        }

        return [
            'domains' => $rows,
            'total' => [
                'shared' => $sharedTotal,
                'both_done' => $doneTotal,
                'percent' => $this->percent($sharedTotal, $unionTotal),
            ],
        ];
    }

    /**
     * ერთი დომენის საერთო ჩანაწერები — ბარათი + **ორივე მხარის** სტატუსი/ქულა.
     *
     * ⚠️ ბარათი მეორე მხარისაა (პროფილს ვუყურებ), ჩემი მონაცემი კი `mine`-შია:
     * ორივეს სრული ბარათი ერთსა და იმავეს გაიმეორებდა — სათაური და ყდა
     * განსაზღვრებით ერთია, განსხვავდება მხოლოდ სტატუსი და ქულა.
     */
    public function items(User $a, User $b, string $domain): array
    {
        abort_unless(in_array($domain, $this->domains($a, $b), true), 404);

        $columns = PublicDomain::matchColumns($domain);
        $mine = $this->records($a, $domain)->keyBy(fn (Model $r) => $this->keyOf($r, $columns));
        $theirs = $this->records($b, $domain)->keyBy(fn (Model $r) => $this->keyOf($r, $columns));

        /* §6 ფაზა 4 — ბარათი **მეორე მხარისაა**, ე.ი. მისი არჩევანი წყვეტს,
           რომელი ველი ჩანს. ჩემი კონფიგი აქ არაფერს ნიშნავს. */
        $hidden = $this->fields->hiddenOnPublic($b, PublicDomain::module($domain));

        $out = [];

        foreach ($theirs as $key => $record) {
            $own = $mine->get($key);
            if (! $own) {
                continue;
            }

            // ⚠️ ბარათის `status`/`rating` **მეორე მხარისაა** — ცალკე
            // `their_status`/`their_rating` იმავე ფაქტს ორ ველში გაიმეორებდა
            $out[] = PublicDomain::card($domain, $record, $hidden) + [
                'mine' => [
                    'id' => $own->id,
                    /* §6.4 — ჩემი სტატუსი **ჩემი** ლექსიკონიდან; სწორედ ამიტომ
                       აქაც ობიექტია და არა გასაღები: ჩემი „ნანახი" და მისი
                       „ნანახი" სხვადასხვა რიგია, თუნდაც ერთნაირად ერქვათ. */
                    'status' => StatusResource::brief($own->status ?? null),
                    'rating' => $own->rating,
                ],
                // ⚠️ ორივე მექანიზმი ერთ ადგილას — `PublicDomain::isDone()`
                'both_done' => PublicDomain::countsDone($domain)
                    && PublicDomain::isDone($record, $domain)
                    && PublicDomain::isDone($own, $domain),
            ];
        }

        return $out;
    }

    /**
     * **„ვისთან ჰგავს ჩემი გემოვნება"** (§16.2) — საჯარო პროფილების კატალოგი,
     * მსგავსების მიხედვით დალაგებული.
     *
     * ⚠️ **დამთხვევის გარეშე პროფილებიც შედის სიაში.** ეს კატალოგიცაა და არა
     * მარტო რეიტინგი: §16.2 ცხადად ითხოვს „საჯარო პროფილების ძებნა/კატალოგს",
     * რომელიც 16.1-ს არ ჰქონდა — ე.ი. ახალი პროფილი, რომელსაც ჯერ არაფერი
     * აქვს საერთო, უნდა მოიძებნებოდეს. ისინი ბოლოში ჩამოდიან.
     *
     * ⚠️ **ჩემი პროფილის საჯაროობა კონტროლერის საქმეა** (409-ს ის აბრუნებს) —
     * აქ მხოლოდ იმას ვამოწმებთ, რაც შედარებას ეხება.
     *
     * @param  string|null  $term  ძებნა username-სა და სახელზე
     * @return array{items: list<array>, total: int, truncated: bool}
     */
    public function ranking(User $me, ?string $term = null): array
    {
        /* ⚠️ **გადამრთველი მატჩინგსაც თიშავს** (Tasks GAP-07, შენი
           გადაწყვეტილება). ეს ერთადერთი გზა იყო, რომლითაც `PUBLIC_PROFILES=false`
           გვერდს უვლიდა: `ranking()` username-ით არავის ეძებს, ე.ი.
           `resolve()`-ს არ იძახებს — და ავტორიზებული მომხმარებელი გამორთულ
           გადამრთველზეც ხედავდა ყველა საჯარო პროფილს და მისი ბიბლიოთეკის
           დომენურ ჭრილს.

           ⚠️ **პასუხი ცარიელი კატალოგია და არა 404/403**: `/people` მოდულური
           გვერდი არაა და მისი გატეხვა არ გვინდა — გამორთულზე ის უბრალოდ
           ცარიელია, ზუსტად ისე, როგორც არც ერთი საჯარო პროფილი რომ არ იყოს.

           ⚠️ შემოწმება **სერვისშია და არა კონტროლერში**: მეორე გამომძახებელი
           მას სხვაგვარად ვერ აუვლის გვერდს. */
        if (! $this->profiles->enabled()) {
            return ['items' => [], 'total' => 0, 'truncated' => false];
        }

        $query = User::query()
            ->where('profile_visibility', 'public')
            ->where('is_active', true)
            ->whereKeyNot($me->id);

        if ($term !== null && trim($term) !== '') {
            $like = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], trim($term)).'%';
            $query->where(fn ($w) => $w->where('username', 'like', $like)->orWhere('name', 'like', $like));
        }

        $total = (clone $query)->count();

        // დალაგება ჯერ სტაბილურია (username), მსგავსებით გადალაგება PHP-შია:
        // `percent` SQL-ში არ არსებობს და ვერც იქნება — ის გადაკვეთაა
        $candidates = $query->orderBy('username')->limit(self::MAX_PROFILES)->get();

        /* ⚠️ **ყველა კანდიდატის საჯარო მოდულები ერთ query-ში** (Tasks PERF-06).
           თითო იტერაცია `summary()`-ს იძახებს, ის კი `domains($me, $other)`-ს:
           ე.ი. `module_user` 50 კანდიდატზე **101-ჯერ** იკითხებოდა — 50-ჯერ
           ერთი და იგივე `domains($me)` და თითოზე ერთხელ მისი. ერთი `whereIn`
           ორივეს ფარავს და ციკლი ბაზას აღარ ეკითხება. */
        // ⚠️ `push()` კი არა `concat()`: `$candidates` ქვემოთ ციკლშია და `$me`
        // მასში ჩამატება საკუთარ თავთან დამთხვევას დაბადებდა
        $this->profiles->warmDomains($candidates->concat([$me]));

        $items = [];

        foreach ($candidates as $other) {
            $summary = $this->summary($me, $other);

            $items[] = [
                'profile' => $this->profiles->header($other),
                'shared' => $summary['total']['shared'],
                'both_done' => $summary['total']['both_done'],
                'percent' => $summary['total']['percent'],
                // კომპაქტური ბარათისთვის — მხოლოდ ის დომენები, სადაც რამე დაემთხვა.
                // სრული დაშლა `/u/{username}`-ის „დამთხვევების" ტაბზეა.
                'domains' => array_values(array_filter(
                    array_map(
                        fn (array $row) => ['domain' => $row['domain'], 'shared' => $row['shared']],
                        $summary['domains'],
                    ),
                    fn (array $row) => $row['shared'] > 0,
                )),
            ];
        }

        usort($items, fn (array $a, array $b) => [$b['percent'], $b['shared'], $a['profile']['username']]
            <=> [$a['percent'], $a['shared'], $b['profile']['username']]);

        return [
            'items' => $items,
            'total' => $total,
            'truncated' => $total > count($candidates),
        ];
    }

    /* ---------- შიგნეული ---------- */

    /** გაერთიანება 0-ია, როცა ორივე ცარიელია — 0/0 პროცენტი 0-ია და არა NaN */
    private function percent(int $shared, int $union): float
    {
        return $union > 0 ? round($shared / $union * 100, 1) : 0.0;
    }

    /**
     * ერთი მხარის საჯარო ჩანაწერები ამ დომენში.
     * ⚠️ `PublicProfileService::query()`-ზე გადის — სამფენოვანი წესის ერთადერთი წყარო.
     */
    private function records(User $user, string $domain, bool $full = true): Collection
    {
        $memo = ($full ? 'full:' : 'thin:')."{$user->id}:{$domain}";

        if (! isset($this->memo[$memo])) {
            $q = $this->profiles->query($user, $domain);

            // იდენტობის გასაღები სრული უნდა იყოს — ნახევრად შევსებული ჩანაწერი
            // („ხელით დამატებული, TMDB-ს გარეშე") დამთხვევაში არ მონაწილეობს
            foreach (PublicDomain::matchColumns($domain) as $column) {
                $q->whereNotNull($column);
            }

            if (! $full) {
                $q->select($this->thinColumns($q->getModel()->getTable(), $domain));
            }

            $this->memo[$memo] = $q->get();
        }

        return $this->memo[$memo];
    }

    /**
     * **მხოლოდ საჭირო სვეტები** (აუდიტი 2026-09-14).
     *
     * ⚠️ `GET /api/matches` **ორმოცდაათ პროფილს** ადარებს, თითოს ცხრა
     * დომენზე — ე.ი. ერთ მოთხოვნაში 450-მდე სრული `get()`. სათაურები,
     * აღწერები და პოსტერების გზები აქ **არასდროს იკითხება**: შედარებას
     * მხოლოდ იდენტობა და სტატუსი სჭირდება. ბარათების აწყობა `items()`-ის
     * საქმეა და ის ერთ წყვილს ერთ დომენზე ეხება, ე.ი. სრულ ჩანაწერებს იღებს.
     *
     * ⚠️ **`id`/`user_id` მაინც შედის**: პირველი `keyBy`-სა და რესურსს
     * სჭირდება, მეორე — `status` კავშირის მიბმას.
     *
     * @return list<string>
     */
    private function thinColumns(string $table, string $domain): array
    {
        $columns = ['id', 'user_id', ...PublicDomain::matchColumns($domain)];

        // §6.4 — ექვს დომენს ლექსიკონი აქვს (`status_id`), სამს — `enum`
        $columns[] = StatusDomain::usesDictionary($domain) ? 'status_id' : 'status';

        return array_map(
            fn (string $c) => "{$table}.{$c}",
            array_values(array_unique(array_filter(
                $columns,
                fn (string $c) => Schema::hasColumn($table, $c),
            ))),
        );
    }

    /** @return list<string> უნიკალური იდენტობის გასაღებები */
    private function keys(User $user, string $domain): array
    {
        $columns = PublicDomain::matchColumns($domain);

        return $this->records($user, $domain, full: false)
            ->map(fn (Model $r) => $this->keyOf($r, $columns))
            ->unique()
            ->values()
            ->all();
    }

    /**
     * ⚠️ გამყოფი `|`-ია და გასაღები ყოველთვის სტრიქონი: ვიდეო/სიმღერაზე ის
     * წყვილია (`youtube|dQw4…`), დანარჩენებზე ერთსვეტიანი. ერთი ფორმა ერთ
     * შედარებას ნიშნავს — თორემ int და string ერთმანეთს ჩუმად დაემთხვეოდა.
     */
    private function keyOf(Model $record, array $columns): string
    {
        return implode('|', array_map(fn (string $c) => (string) $record->{$c}, $columns));
    }

    /** რამდენი საერთო ჩანაწერია **ორივესთან** „გაკეთებული"; `null` — დომენს სტატუსი არ აქვს */
    private function bothDone(User $a, User $b, string $domain, array $sharedKeys): ?int
    {
        if (! PublicDomain::countsDone($domain)) {
            return null;
        }

        if (! $sharedKeys) {
            return 0;
        }

        $columns = PublicDomain::matchColumns($domain);
        $shared = array_flip($sharedKeys);

        /* ⚠️ **კრიტერიუმი `PublicDomain::isDone()`-ია და არა სახელის შედარება**
           (§6.4): ექვს დომენზე სტატუსი per-user ლექსიკონია, ე.ი. „ნანახი"
           ორ ანგარიშზე სხვადასხვა რიგია — მნიშვნელობას მხოლოდ `role` ატარებს. */
        $doneKeys = fn (User $u) => $this->records($u, $domain, full: false)
            ->filter(fn (Model $r) => PublicDomain::isDone($r, $domain))
            ->map(fn (Model $r) => $this->keyOf($r, $columns))
            ->filter(fn (string $k) => isset($shared[$k]))
            ->unique()
            ->all();

        return count(array_intersect($doneKeys($a), $doneKeys($b)));
    }
}
