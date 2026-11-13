<?php

namespace App\Services\Translation;

use App\Models\Anime;
use App\Models\CastMember;
use App\Models\Genre;
use App\Models\Movie;
use App\Models\Series;
use App\Services\Cast\CastPool;
use App\Support\SyncOutcome;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * რას აკლია თარგმანი.
 *
 * ⚠️ **მთავარი წესი: თარგმანს წყარო სჭირდება.** ჩანაწერი „სათარგმნია" მხოლოდ
 * მაშინ, თუ ველი ერთ ენაზე **არის** და მეორეზე არა. თუ აღწერა არც ka-ზეა და
 * არც en-ზე, ეს თარგმანის და არა — სინქრონის საქმეა (`/sync`), თორემ მრიცხველი
 * არასდროს დაჯდებოდა ნულზე და ჰედერის badge სამუდამოდ ანთებული დარჩებოდა.
 *
 * ვიდეოები განზრახ არ შედის: `videos.title`/`description` ჩვეულებრივი სვეტებია,
 * ორენოვანი სქემა მათ არ აქვთ (იხ. `CLAUDE.md`).
 *
 * ⚠️ **თარგმანი ნაწილებად იშლება** (`PARTS`): სათაური და აღწერა ორივე მიმართულებით,
 * გადასამოწმებელი აღწერები, ჟანრები და მსახიობების ქართული სახელები და ბიოგრაფიები.
 * თითო ნაწილს თავისი რიცხვი აქვს (`parts()`) და ცალკე ეშვება — გეგმა (`plan()`,
 * `castPlan()`) ზუსტად იმავე ნაწილს აბრუნებს, რასაც რიცხვი ითვლის.
 */
class TranslationScanner
{
    /** მედია-დომენები, რომლებსაც ორენოვანი სქემა აქვთ */
    public const TYPES = ['movie', 'series', 'anime'];

    /** გაზომილი ტემპი — მიახლოებითი დროის შესაფასებლად (TMDB + Gemini) */
    public const ITEMS_PER_MINUTE = 8.0;

    /** ჩანაწერის ნაწილები: ველი და მიმართულება — „სათაური ქართულად", „აღწერა ინგლისურად"… */
    public const FIELDS = ['title_ka', 'title_en', 'description_ka', 'description_en'];

    /** გადასამოწმებელი აღწერები (TMDB-ის ქართული ტექსტი) */
    public const PART_REVIEW = 'review';

    public const PART_GENRES = 'genres';

    /** მსახიობების ქართული სახელები და ბიოგრაფიები (`CastTranslator`) */
    public const PART_CAST_NAMES = 'cast_names';

    public const PART_CAST_BIOS = 'cast_bios';

    /** თარგმანის ყველა ნაწილი — რიცხვიც და გაშვებაც ამ სიით იშლება */
    public const PARTS = [...self::FIELDS, self::PART_REVIEW, self::PART_GENRES, self::PART_CAST_NAMES, self::PART_CAST_BIOS];

    /**
     * ჩანაწერს რომელი ველები აკლია. აბრუნებს `['title_ka', 'description_en', …]`.
     *
     * @return array<int, string>
     */
    public static function missing(Model $item): array
    {
        $missing = [];

        foreach (['title', 'description'] as $field) {
            $ka = trim((string) $item->{$field.'_ka'});
            $en = trim((string) $item->{$field.'_en'});

            if ($ka === '' && $en !== '') {
                $missing[] = $field.'_ka';
            }
            if ($en === '' && $ka !== '') {
                $missing[] = $field.'_en';
            }
        }

        return $missing;
    }

    /**
     * **გადასამოწმებელია თუ არა** — `review` რეჟიმის სკოუპი (2026-09-14).
     *
     * ⚠️ ეს `missing()`-ის საპირისპირო კითხვაა: იქ „რა აკლია", აქ — „რა
     * არსებობს და საეჭვოა". სამივე პირობა აუცილებელია და `ItemTranslator`-ის
     * იმავე შეზღუდვებს იმეორებს, თორემ გეგმა ჩაწერდა ჩანაწერს, რომელსაც
     * თარგმანი უარს ეტყოდა — ე.ი. რიგი „გამოტოვებულებით" აივსებოდა.
     */
    public static function reviewable(Model $item): bool
    {
        return trim((string) $item->description_ka) !== ''
            && trim((string) $item->description_en) !== ''
            // მხოლოდ TMDB-ისა: `manual` მომხმარებლისაა, `translation` — უკვე Gemini-ისა
            && $item->description_ka_source === 'tmdb';
    }

    /** ჟანრს რომელი სახელი აკლია */
    public static function genreMissing(Genre $genre): array
    {
        $ka = trim((string) $genre->name_ka);
        $en = trim((string) $genre->name_en);

        $missing = [];
        if ($ka === '' && $en !== '') {
            $missing[] = 'name_ka';
        }
        if ($en === '' && $ka !== '') {
            $missing[] = 'name_en';
        }

        return $missing;
    }

    /**
     * ჰედერის badge-ის რიცხვი — „გაქვს N სათარგმნი".
     *
     * ჟანრები გლობალურია, ჩანაწერები — per-user (`owner` scope თავისით მუშაობს).
     *
     * @param  array<int, string>  $types  მხოლოდ ჩართული მოდულები
     * @return array<string, int> თითო `TYPES`-ის დომენი + `genres` + `total`
     */
    public function summary(array $types): array
    {
        $out = array_fill_keys([...self::TYPES, 'genres', 'total', 'reviewable'], 0);

        foreach (array_intersect($types, self::TYPES) as $type) {
            $out[$type] = $this->missingQuery($type)->count();
            $out['reviewable'] += $this->reviewableQuery($type)->count();
        }

        $out['genres'] = $this->missingNameQuery(Genre::query(), 'name')->count();

        // ⚠️ ჯამი **`TYPES`-ზე** ითვლება და არა ხელით ჩამოთვლილ ორ დომენზე:
        // მესამე დომენის (`anime`) დამატებისას სხვაობა ჩუმი იქნებოდა —
        // ბეჯი ნაკლებს აჩვენებდა, ვიდრე გვერდი.
        $out['total'] = $out['genres'];
        foreach (self::TYPES as $type) {
            $out['total'] += $out[$type];
        }

        /* ⚠️ **`reviewable` ჯამში განზრახ არ შედის.** `total` ჰედერის badge-ია
           („გაქვს N სათარგმნი") — გადამოწმება კი ცხადი არჩევანია და არა
           ნაკლული თარგმანი; ჯამში ჩადებული ის badge-ს **სამუდამოდ** აანთებდა,
           ზუსტად ისე, როგორც „ორივე ენაზე ცარიელი" ტექსტი. */

        return $out;
    }

    /**
     * **ჩაშლილი რიცხვები** — თითო ნაწილზე რამდენია სათარგმნი, მოდულებად.
     *
     * ⚠️ რიცხვი იმასვე ითვლის, რასაც გეგმა გაუშვებს: „აღარ განაახლო" ჩანაწერი და ჩაკეტილი
     * აქ არ არის; მსახიობებზე — ამ ბიბლიოთეკის მსახიობები, ჩემი „აღარ განაახლო"-ს გარეშე.
     * ჟანრები გლობალური ლექსიკონია — მოდულებად არ იშლება.
     *
     * @param  array<int, string>  $types  ჩართული მოდულები (ან ერთი — მოდულის გვერდი)
     * @param  array<int, string>  $castTypes  რომელი ბიბლიოთეკის მსახიობები (`CastPool::typesFor()`)
     * @return array<string, array{count: int, by_type?: array<string, int>}>
     */
    public function parts(array $types, array $castTypes, int $userId): array
    {
        $types = array_values(array_intersect(self::TYPES, $types));
        $parts = [];

        foreach ([...self::FIELDS, self::PART_REVIEW] as $part) {
            $byType = [];

            foreach ($types as $type) {
                $byType[$type] = $part === self::PART_REVIEW
                    ? $this->reviewableQuery($type)->where('sync_paused', false)->count()
                    : $this->fieldQuery($type, $part)->count();
            }

            $parts[$part] = ['count' => array_sum($byType), 'by_type' => $byType];
        }

        $parts[self::PART_GENRES] = ['count' => $this->missingNameQuery(Genre::query(), 'name')->count()];
        $parts[self::PART_CAST_NAMES] = ['count' => $castTypes ? $this->castQuery($castTypes, $userId, [self::PART_CAST_NAMES])->count() : 0];
        $parts[self::PART_CAST_BIOS] = ['count' => $castTypes ? $this->castQuery($castTypes, $userId, [self::PART_CAST_BIOS])->count() : 0];

        return $parts;
    }

    /**
     * მსახიობების გეგმა: ვის აკლია ქართული სახელი და/ან ბიოგრაფია — არჩეული ნაწილების
     * მიხედვით. ერთეული მსახიობია (`type: actor`), `missing` — რა გაეშვება მასზე.
     *
     * @param  array<int, string>  $castTypes
     * @param  array<int, string>  $parts  `cast_names` · `cast_bios`
     * @return list<array<string, mixed>>
     */
    public function castPlan(array $castTypes, int $userId, array $parts): array
    {
        $parts = array_values(array_intersect([self::PART_CAST_NAMES, self::PART_CAST_BIOS], $parts));

        if (! $castTypes || ! $parts) {
            return [];
        }

        $fields = array_map(fn (string $part) => $part === self::PART_CAST_NAMES ? CastTranslator::NAME : CastTranslator::BIOGRAPHY, $parts);

        return $this->castQuery($castTypes, $userId, $parts)
            ->orderBy('name')
            ->orderBy('id')
            ->get()
            ->map(fn (CastMember $member) => [
                'type' => 'actor',
                'id' => $member->id,
                'title' => $member->name_ka ?: $member->name,
                'missing' => array_values(array_intersect(CastTranslator::missing($member), $fields)),
            ])
            ->filter(fn (array $item) => $item['missing'] !== [])
            ->values()
            ->all();
    }

    /**
     * ფილტრები → დასამუშავებელი ჩანაწერების რიგი (`/sync`-ის plan-ის ანალოგი).
     *
     * @param  array<string, mixed>  $filters
     * @param  bool  $review  გადასამოწმებელი ჩანაწერებიც შედის თუ არა
     * @param  array<int, string>|null  $fields  მხოლოდ ეს ნაწილები (`FIELDS`); `null` — ყველა
     * @return array{items:array<int, array<string, mixed>>, genres:int}
     */
    public function plan(array $types, array $filters, bool $review = false, ?array $fields = null): array
    {
        $ids = $filters['ids'] ?? [];
        $items = [];
        $fields = $fields === null ? self::FIELDS : array_values(array_intersect(self::FIELDS, $fields));

        foreach (array_intersect($types, self::TYPES) as $type) {
            $query = $this->query($type);

            if (! empty($filters['status'])) {
                // გასაღები ლექსიკონშია და არა ჩანაწერზე
                $query->statusKey($filters['status']);
            }
            if (! empty($filters['favorite'])) {
                $query->where('is_favorite', true);
            }
            if (! empty($filters['genres'])) {
                $query->whereHas('genres', fn ($q) => $q->whereIn('slug', $filters['genres']));
            }
            if (! empty($ids[$type])) {
                $query->whereIn('id', array_map('intval', $ids[$type]));
            }
            /* „აღარ განაახლო" თარგმანსაც ეხება; ბოლო გაშვებაზე
               წარმატებით ნათარგმნი `hide_processed`-ზე იმალება, ცარიელი და ჩავარდნილი რჩება */
            $query->where('sync_paused', false);
            if (! empty($filters['hide_processed'])) {
                $query->where(fn ($w) => $w->whereNull('last_translated_at')->orWhereIn('last_translate_result', SyncOutcome::RETRY));
            }
            foreach ($query->get() as $row) {
                // ერთი ნაწილის გაშვება სხვას არ ეხება — ჩანაწერი რიგშია მხოლოდ არჩეული ველების გამო
                $missing = array_values(array_intersect(self::missing($row), $fields));
                /* ⚠️ `review`-ზე სრულად შევსებული ჩანაწერიც სამუშაოა — მაგრამ
                   მხოლოდ მაშინ, თუ ნამდვილად აქვს გადასამოწმებელი ტექსტი:
                   თორემ რიგი მთელი ბიბლიოთეკით აივსებოდა და 95% „გამოვტოვე"
                   იქნებოდა. */
                $toReview = $review && self::reviewable($row);
                if (! $missing && ! $toReview) {
                    continue;
                }
                $items[] = [
                    'type' => $type,
                    'id' => $row->id,
                    'title' => $row->title_ka ?: ($row->title_en ?: '#'.$row->id),
                    'year' => $row->year,
                    'missing' => $missing,
                    // რიგის ბარათმა უნდა თქვას, რატომ არის აქ ეს ჩანაწერი
                    'review' => $toReview,
                ];
            }
        }

        return [
            'items' => $items,
            'genres' => $this->pendingGenres()->count(),
        ];
    }

    /** ჟანრები, რომლებსაც სახელი აკლია */
    public function pendingGenres()
    {
        return Genre::with('translations')->get()
            ->filter(fn (Genre $g) => self::genreMissing($g) !== [])
            ->values();
    }

    /**
     * **`missing()`-ის SQL-ტყუპი**.
     *
     * ⚠️ ჰედერის badge ყველა გვერდზეა და 5 წუთში ერთხელ ახლდება, ე.ი. ეს
     * აპის ყველაზე ხშირად შესრულებული query-ა. ადრე `summary()` **მთელ
     * ბიბლიოთეკას** ტვირთავდა თარგმანებითურთ და PHP-ში ითვლიდა — 353 ფილმზე
     * ~700 რიგი, ბიბლიოთეკასთან ერთად წრფივად მზარდი.
     *
     * ⚠️ **ორი განსაზღვრება ერთ კითხვაზე საშიშია და სწორედ ამიტომ არსებობს
     * `TranslationTest`-ის შემოწმება „badge = გეგმის სია"**: `missing()` რიგზე
     * მუშაობს (ბარათი ამბობს, *რა* აკლია), აქ კი დათვლაა. ერთადერთი ცნობილი
     * განსხვავება: PHP-ის `trim()` `\n`/`\t`/`\0`-საც ჭრის, SQL-ის `trim()` —
     * მხოლოდ ჰარეს; ე.ი. მხოლოდ ტაბით შევსებული თარგმანი აქ „შევსებულად"
     * ჩაითვლებოდა. ცარიელი და `NULL` ორივეგან ერთნაირად იკითხება.
     *
     * ⚠️ `$field` **შიდა სიიდანაა** (`title`/`description`/`name`) და არასდროს
     * მომხმარებლისგან — `whereRaw`-ში მისი ჩასმა სწორედ ამიტომ უსაფრთხოა.
     */
    private static function filled(string $locale, string $field): \Closure
    {
        return fn (Builder $q) => $q->where('locale', $locale)
            ->whereRaw("trim(coalesce({$field}, '')) <> ''");
    }

    /** ერთ ველზე: ერთ ენაზე არის, მეორეზე — არა */
    private function missingNameQuery(Builder $query, string ...$fields): Builder
    {
        return $query->where(function (Builder $w) use ($fields) {
            foreach ($fields as $field) {
                foreach ([['ka', 'en'], ['en', 'ka']] as [$empty, $present]) {
                    $w->orWhere(fn (Builder $x) => $x
                        ->whereHas('translations', self::filled($present, $field))
                        ->whereDoesntHave('translations', self::filled($empty, $field)));
                }
            }
        });
    }

    /**
     * ერთი ნაწილი ერთ დომენში: ველი ამ ენაზე ცარიელია, მეორეზე — არის; „აღარ განაახლო"
     * ჩანაწერის გარეშე, როგორც გეგმაში. `$part` შიდა სიიდანაა (`FIELDS`).
     */
    private function fieldQuery(string $type, string $part): Builder
    {
        [$field, $empty] = [substr($part, 0, -3), substr($part, -2)];
        $present = $empty === 'ka' ? 'en' : 'ka';

        return $this->newQuery($type)
            ->where('sync_paused', false)
            ->whereHas('translations', self::filled($present, $field))
            ->whereDoesntHave('translations', self::filled($empty, $field));
    }

    /**
     * ამ ბიბლიოთეკის მსახიობები, რომელთაც ქართული სახელი და/ან ბიოგრაფია აკლიათ.
     *
     * ⚠️ ფარგლები მსახიობების სინქრონიზაციისაა (`CastPool`): ჩემ მიერ ჩაკეტილი აქ არ არის;
     * ჩემი „აღარ განაახლო" მსახიობზე თარგმანსაც აჩერებს. ბიოგრაფია „აკლია" მხოლოდ მაშინ,
     * როცა ინგლისური არის — თარგმანს წყარო სჭირდება.
     *
     * @param  array<int, string>  $castTypes
     * @param  array<int, string>  $parts  `cast_names` · `cast_bios`
     */
    private function castQuery(array $castTypes, int $userId, array $parts): Builder
    {
        return CastPool::query($castTypes)
            ->whereDoesntHave('syncPauses', fn (Builder $pause) => $pause->where('user_id', $userId))
            ->where(function (Builder $w) use ($parts) {
                if (in_array(self::PART_CAST_NAMES, $parts, true)) {
                    $w->orWhereDoesntHave('translations', self::filled('ka', 'name'));
                }

                if (in_array(self::PART_CAST_BIOS, $parts, true)) {
                    $w->orWhere(fn (Builder $bio) => $bio
                        ->whereRaw("trim(coalesce(cast_members.biography, '')) <> ''")
                        ->whereDoesntHave('translations', self::filled('ka', 'biography')));
                }

                // ⚠️ ნაწილის გარეშე — არაფერი, და არა „ყველა"
                $w->orWhereRaw('1 = 0');
            });
    }

    /** სათარგმნი ჩანაწერები ერთ დომენში — `missing()`-ის ტოლფასი */
    private function missingQuery(string $type): Builder
    {
        return $this->missingNameQuery($this->newQuery($type), 'title', 'description');
    }

    /** `reviewable()`-ის SQL-ტყუპი: ორივე ენაზე აღწერა არის და `ka` TMDB-ისაა */
    private function reviewableQuery(string $type): Builder
    {
        return $this->newQuery($type)
            ->whereHas('translations', fn (Builder $q) => self::filled('ka', 'description')($q)->where('source', 'tmdb'))
            ->whereHas('translations', self::filled('en', 'description'));
    }

    private function newQuery(string $type): Builder
    {
        /* თარგმნის გეგმა და მრიცხველი ჩაკეტილის გარეშე (რიგია);
           ერთი ჩანაწერის თარგმნა მისივე გვერდიდან ჩვეულებრივად მუშაობს */
        return (match ($type) {
            'series' => Series::query(),
            'anime' => Anime::query(),
            default => Movie::query(),
        })->withoutLocked();
    }

    private function query(string $type): Builder
    {
        return $this->newQuery($type)->with('translations')->orderBy('id');
    }
}
