<?php

namespace App\Services\Share;

use App\Models\Playlist;
use App\Models\User;
use App\Support\MediaDomain;
use App\Support\ShareDomain;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;

/**
 * **„ეს უკვე გაქვს?" — ერთი წესი სამი ადგილისთვის (Tasks §40.7, §40.8, §40.10).**
 *
 * მიმღების გვერდის „უკვე გაქვს ✓", დამატების გეგმის „ახალი · გაქვს · ურნაშია"
 * და თვითონ დამატება ერთსა და იმავე კითხვას სვამენ. ორი წესი ეკრანზე
 * „ახალს" დახატავდა და დამატება მერე „უკვე გქონდა"-ს იტყოდა.
 *
 * ## ნაბიჯები (`STEPS`) — თითო დომენს თავისი რიგი
 *
 * ჩანაწერს **პირველი ის ნაბიჯი** წყვეტს, რომლის ველებიც მას შევსებული აქვს
 * (მედიის არსებული წესი): TMDB-იანი ფილმი მხოლოდ `tmdb_id`-ით ედრება, კოდის
 * არმქონე — `imdb_id`-ით, ორივეს არმქონე — სათაურით.
 *  - **სვეტების ნაბიჯი** (`['rawg_id']`, `['platform', 'external_id']`) —
 *    ყველა სვეტი ზუსტად უნდა დაემთხვეს; ცარიელი სვეტი ნაბიჯს გამოტოვებს.
 *  - **`title`** — ნორმალიზებული სათაური (რეგისტრი, ზედმეტი ჰარი) + გამრჩევი
 *    (`TITLE`-ის `by`: წელი, ადგილზე ქალაქი); ქართული წიგნი Open Library-ში
 *    არ არის, ე.ი. ორი ადამიანის ერთი წიგნი **მხოლოდ** ასე შეხვდება ერთმანეთს.
 *
 * ⚠️ **ბმულის ბუნებრივი იდენტობის დომენებს** (ვიდეო, სიმღერა, ბუკმარკი)
 * სათაურის ნაბიჯი არ აქვს: ერთი სათაურის ორი სხვადასხვა ბმული სხვადასხვა
 * ჩანაწერია. კურსს ბმული არასავალდებულო აქვს, ამიტომ მის გარეშე — სათაურით.
 *
 * ⚠️ **ურნაც ჩანს** (`trashed: true`) — 40.1-ის გაკვეთილი: ურნაში მყოფზე
 * „არ გაქვს" ტყუილი იქნებოდა და დამატება `unique`-ზე წაიქცეოდა. ორივე თუ
 * არის, ცოცხალი იმარჯვებს.
 * ⚠️ **ერთი query მთელ სიაზე** და არა ჩანაწერზე; მფლობელი ცხადია (`owner`
 * და `trash` scope-ების გარეშე — მნახველის ურნაც უნდა ჩანდეს).
 *
 * ⚠️ **პლეილისტი (§40.13) ასლის წყაროთი იცნობა** (`playlists.copied_from_id`)
 * და არა სახელით: „რჩეული"/„გზაში" ჩვეულებრივი სახელებია, და მეგობრის
 * პლეილისტი ჩემს თანამოსახელე პლეილისტად ჩაითვლებოდა.
 */
final class ShareMatcher
{
    /** @var array<string, list<list<string>|'title'>> */
    private const STEPS = [
        'movie' => [['tmdb_id'], ['imdb_id'], 'title'],
        'series' => [['tmdb_id'], ['imdb_id'], 'title'],
        'anime' => [['tmdb_id'], ['imdb_id'], 'title'],
        'game' => [['rawg_id'], ['igdb_id'], 'title'],
        'book' => [['openlibrary_id'], ['isbn'], 'title'],
        'board_game' => [['bgg_id'], 'title'],
        'place' => [['osm_id'], 'title'],
        'video' => [['platform', 'external_id'], ['url']],
        'song' => [['platform', 'external_id'], ['url']],
        'bookmark' => [['url']],
        'course' => [['url'], 'title'],
    ];

    /**
     * სათაურის ნაბიჯი: რომელ სვეტებშია სათაური და რა არჩევს ორ თანამოსახელეს.
     *
     * ⚠️ მედიის სათაური თარგმანების ცხრილშია (`title_ka`/`title_en` აქსესორები);
     * წინასწარი SQL-ფილტრი ყველგან **წლითაა** (სადაც წელი გამრჩევია) და არა
     * სათაურით — იხ. `titlePrefilter()`; საბოლოო შედარება ყველგან PHP-შია.
     *
     * @var array<string, array{columns: list<string>, by: ?string}>
     */
    private const TITLE = [
        'movie' => ['columns' => ['title_en', 'title_ka'], 'by' => 'year'],
        'series' => ['columns' => ['title_en', 'title_ka'], 'by' => 'year'],
        'anime' => ['columns' => ['title_en', 'title_ka'], 'by' => 'year'],
        'game' => ['columns' => ['title_en', 'title_ka'], 'by' => 'year'],
        'book' => ['columns' => ['title_en', 'title_ka'], 'by' => 'year'],
        'board_game' => ['columns' => ['title'], 'by' => 'year'],
        'place' => ['columns' => ['name'], 'by' => 'city'],
        'course' => ['columns' => ['title'], 'by' => null],
    ];

    /**
     * @param  Collection<int, Model>  $records  გამზიარებლის ჩანაწერები
     * @return array<int, array{id: int, trashed: bool}> გამზიარებლის ჩანაწერის id-ით
     */
    public static function matches(User $viewer, string $domain, Collection $records): array
    {
        if ($records->isEmpty()) {
            return [];
        }

        if (ShareDomain::isList($domain)) {
            return self::playlistCopies($viewer, $records);
        }

        $steps = self::STEPS[$domain] ?? [];

        // თითო ჩანაწერს — პირველი შესაფერისი ნაბიჯი და მისი გასაღები
        $plan = [];
        foreach ($records as $record) {
            foreach ($steps as $i => $step) {
                $key = self::stepKey($domain, $step, $record);

                if ($key !== null) {
                    $plan[(int) $record->getKey()] = ['step' => $i, 'key' => $key, 'record' => $record];
                    break;
                }
            }
        }

        if ($plan === []) {
            return [];
        }

        $rows = self::candidates($viewer, $domain, $steps, $plan);

        $out = [];

        foreach ($plan as $id => $entry) {
            $step = $steps[$entry['step']];

            $candidates = $step === 'title'
                ? $rows->filter(fn (Model $row) => self::sameTitle($domain, $entry['record'], $row))
                : $rows->filter(fn (Model $row) => self::stepKey($domain, $step, $row) === $entry['key']);
            $pick = $candidates->first(fn (Model $row) => $row->getAttribute('trashed_at') === null) ?? $candidates->first();

            if ($pick) {
                $out[$id] = [
                    'id' => (int) $pick->getKey(),
                    'trashed' => $pick->getAttribute('trashed_at') !== null,
                ];
            }
        }

        return $out;
    }

    /**
     * იდენტობის გასაღები — პირველი სვეტების ნაბიჯი (`null` — ჩანაწერს ის არ აქვს).
     *
     * ⚠️ საჯაროა ძველი გამომძახებლების გამო; „ვინ ვისი ტყუპია" `matches()`-ის კითხვაა.
     */
    public static function identityKey(string $domain, Model $record): ?string
    {
        $first = self::STEPS[$domain][0] ?? null;

        return is_array($first) ? self::stepKey($domain, $first, $record) : null;
    }

    /* ---------- შიდა ---------- */

    /**
     * მნახველის ასლები გამზიარებლის პლეილისტებიდან — ერთი query.
     *
     * @param  Collection<int, Model>  $records
     * @return array<int, array{id: int, trashed: bool}>
     */
    private static function playlistCopies(User $viewer, Collection $records): array
    {
        $copies = Playlist::withoutGlobalScopes(['owner', 'trash'])
            ->where('user_id', $viewer->id)
            ->whereIn('copied_from_id', $records->modelKeys())
            ->get(['id', 'copied_from_id', 'trashed_at']);

        $out = [];

        foreach ($copies->groupBy('copied_from_id') as $source => $rows) {
            // ცოცხალი იმარჯვებს — ურნაში მყოფი მხოლოდ მაშინ, როცა სხვა არ არის
            $pick = $rows->first(fn (Model $row) => $row->getAttribute('trashed_at') === null) ?? $rows->first();

            $out[(int) $source] = [
                'id' => (int) $pick->getKey(),
                'trashed' => $pick->getAttribute('trashed_at') !== null,
            ];
        }

        return $out;
    }

    /**
     * ერთი query მნახველის ყველა შესაძლო ტყუპზე.
     *
     * @param  list<list<string>|'title'>  $steps
     * @param  array<int, array{step: int, key: string, record: Model}>  $plan
     * @return Collection<int, Model>
     */
    private static function candidates(User $viewer, string $domain, array $steps, array $plan): Collection
    {
        $model = ShareDomain::model($domain);
        $table = (new $model)->getTable();
        $media = MediaDomain::has($domain);

        $byStep = [];
        foreach ($plan as $entry) {
            $byStep[$entry['step']][] = $entry['record'];
        }

        $titleStep = array_search('title', $steps, true);
        $usesTitle = $titleStep !== false && isset($byStep[$titleStep]);

        return $model::withoutGlobalScopes(['owner', 'trash'])
            // ⚠️ თარგმანი მხოლოდ მედიის სათაურით შედარებას სჭირდება; სტატუსი — არავის
            ->withOnly($media && $usesTitle ? ['translations'] : [])
            ->where($table.'.user_id', $viewer->id)
            ->where(function (Builder $q) use ($domain, $steps, $byStep, $table) {
                foreach ($byStep as $i => $records) {
                    $step = $steps[$i];

                    if (is_array($step)) {
                        // წყვილზე (`platform` + `external_id`) — ბოლო სვეტით ვიწროვდება, PHP ზუსტად ადარებს
                        $column = $step[count($step) - 1];
                        $values = collect($records)->map(fn (Model $r) => $r->getAttribute($column))->unique()->values()->all();
                        $q->orWhereIn($table.'.'.$column, $values);

                        continue;
                    }

                    self::titlePrefilter($q, $domain, $records, $table);
                }
            })
            ->get();
    }

    /**
     * სათაურის ნაბიჯის წინასწარი ფილტრი — **წლით**, სადაც წელი გამრჩევია.
     *
     * ⚠️ სათაურით SQL-ში არ ვფილტრავთ: ნორმალიზაცია (რეგისტრი, **შიგა** ორმაგი
     * ჰარი) ორ ძრავზე ერთნაირად ვერ დაიწერება, და `lower(trim())` „ჯაყოს  ხიზნები"-ს
     * ჩუმად გამოტოვებდა — ქართული წიგნისთვის კი სათაური ერთადერთი გზაა. წელი
     * ზუსტი რიცხვია და საკმარისად ავიწროებს; თამაშის წელი `release_date`-იდან
     * იკითხება (`whereYear` — Laravel-ის გრამატიკა ორივე ძრავზე სწორად წერს).
     * ⚠️ ადგილსა და კურსს რიცხვითი გამრჩევი არ აქვს — იქ მნახველის **მთელი**
     * სია მოდის ამ დომენში (ეს სიები მცირეა); შედარება ყველგან PHP-შია.
     *
     * @param  list<Model>  $records
     */
    private static function titlePrefilter(Builder $q, string $domain, array $records, string $table): void
    {
        if ((self::TITLE[$domain]['by'] ?? null) !== 'year') {
            $q->orWhereRaw('1 = 1');

            return;
        }

        $years = collect($records)->map(fn (Model $r) => $r->getAttribute('year'))->unique()->values();
        $column = $domain === 'game' ? 'release_date' : 'year';

        $q->orWhere(function (Builder $y) use ($years, $table, $column) {
            foreach ($years->filter(fn ($v) => $v !== null) as $year) {
                $column === 'year'
                    ? $y->orWhere($table.'.year', (int) $year)
                    : $y->orWhereYear($table.'.'.$column, (int) $year);
            }

            if ($years->contains(null)) {
                $y->orWhereNull($table.'.'.$column);
            }
        });
    }

    /**
     * სათაურის ნაბიჯი: **ერთი საერთო სათაური მაინც** (ენა არ ითვლება — ერთს
     * შეიძლება მხოლოდ ქართული ჰქონდეს, მეორეს ორივე) და იგივე გამრჩევი.
     *
     * ⚠️ წელი: ორივეს არ აქვს — ემთხვევა; ერთს აქვს, მეორეს არა — არა (მედიის
     * არსებული წესი). ქალაქი ნორმალიზებულად შედარდება.
     */
    private static function sameTitle(string $domain, Model $record, Model $row): bool
    {
        if (array_intersect(self::titles($domain, $record), self::titles($domain, $row)) === []) {
            return false;
        }

        $by = self::TITLE[$domain]['by'] ?? null;

        if ($by === 'year') {
            $mine = $row->getAttribute('year');
            $theirs = $record->getAttribute('year');

            return $mine === null ? $theirs === null : $theirs !== null && (int) $mine === (int) $theirs;
        }

        if ($by !== null) {
            return self::normalize((string) ($row->getAttribute($by) ?? '')) === self::normalize((string) ($record->getAttribute($by) ?? ''));
        }

        return true;
    }

    /**
     * ნაბიჯის გასაღები; `null` — ჩანაწერს ამ ნაბიჯის ველები არ აქვს.
     *
     * ⚠️ სათაურის ნაბიჯზე გასაღები მხოლოდ „შეიძლება" ნიშანია — ტყუპი
     * `sameTitle()`-ით შედარდება (ერთი საერთო სათაური, და არა სრული სია).
     *
     * @param  list<string>|'title'  $step
     */
    private static function stepKey(string $domain, array|string $step, Model $record): ?string
    {
        if ($step === 'title') {
            return self::titles($domain, $record) === [] ? null : 'title';
        }

        $parts = [];

        foreach ($step as $column) {
            $value = $record->getAttribute($column);

            if ($value === null || $value === '') {
                return null;
            }

            $parts[] = (string) $value;
        }

        return $parts === [] ? null : implode("\x1f", $parts);
    }

    /** @return list<string> ნორმალიზებული სათაურები (ორივე ენაზე, სადაც ორია) */
    private static function titles(string $domain, Model $record): array
    {
        $out = [];

        foreach (self::TITLE[$domain]['columns'] ?? [] as $field) {
            $value = $record->getAttribute($field);

            if (is_string($value) && trim($value) !== '') {
                $out[] = self::normalize($value);
            }
        }

        return array_values(array_unique($out));
    }

    private static function normalize(string $value): string
    {
        return mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', $value)));
    }
}
