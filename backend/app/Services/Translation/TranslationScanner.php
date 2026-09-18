<?php

namespace App\Services\Translation;

use App\Models\Anime;
use App\Models\Genre;
use App\Models\Movie;
use App\Models\Series;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * რას აკლია თარგმანი (Tasks 7).
 *
 * ⚠️ **მთავარი წესი: თარგმანს წყარო სჭირდება.** ჩანაწერი „სათარგმნია" მხოლოდ
 * მაშინ, თუ ველი ერთ ენაზე **არის** და მეორეზე არა. თუ აღწერა არც ka-ზეა და
 * არც en-ზე, ეს თარგმანის და არა — სინქრონის საქმეა (`/sync`), თორემ მრიცხველი
 * არასდროს დაჯდებოდა ნულზე და ჰედერის badge სამუდამოდ ანთებული დარჩებოდა.
 *
 * ვიდეოები განზრახ არ შედის: `videos.title`/`description` ჩვეულებრივი სვეტებია,
 * ორენოვანი სქემა მათ არ აქვთ (იხ. `CLAUDE.md`).
 */
class TranslationScanner
{
    /** მედია-დომენები, რომლებსაც ორენოვანი სქემა აქვთ */
    public const TYPES = ['movie', 'series', 'anime'];

    /** გაზომილი ტემპი — მიახლოებითი დროის შესაფასებლად (TMDB + Gemini) */
    public const ITEMS_PER_MINUTE = 8.0;

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
        // მესამე დომენის (`anime`, §7.1) დამატებისას სხვაობა ჩუმი იქნებოდა —
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
     * ფილტრები → დასამუშავებელი ჩანაწერების რიგი (`/sync`-ის plan-ის ანალოგი).
     *
     * @param  array<string, mixed>  $filters
     * @param  bool  $review  გადასამოწმებელი ჩანაწერებიც შედის თუ არა
     * @return array{items:array<int, array<string, mixed>>, genres:int}
     */
    public function plan(array $types, array $filters, bool $review = false): array
    {
        $ids = $filters['ids'] ?? [];
        $items = [];

        foreach (array_intersect($types, self::TYPES) as $type) {
            $query = $this->query($type);

            if (! empty($filters['status'])) {
                // §6.4 — გასაღები ლექსიკონშია და არა ჩანაწერზე
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

            foreach ($query->get() as $row) {
                $missing = self::missing($row);
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
     * **`missing()`-ის SQL-ტყუპი** (Tasks PERF-17).
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
        return match ($type) {
            'series' => Series::query(),
            'anime' => Anime::query(),
            default => Movie::query(),
        };
    }

    private function query(string $type): Builder
    {
        return $this->newQuery($type)->with('translations')->orderBy('id');
    }
}
