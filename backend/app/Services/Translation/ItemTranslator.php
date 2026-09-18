<?php

namespace App\Services\Translation;

use App\Models\Genre;
use App\Services\Tmdb\TmdbClient;
use App\Support\Lang;
use App\Support\MediaDomain;
use App\Support\Redact;
use Illuminate\Database\Eloquent\Model;
use Throwable;

/**
 * ერთი ჩანაწერის თარგმნა (Tasks 7).
 *
 * ორნაბიჯიანია და თანმიმდევრობა განზრახ ასეთია:
 *   1. **TMDB** — უფასოა და ავტორიტეტული. ქართული სათაური/აღწერა TMDB-ს ხშირად
 *      უკვე აქვს; `Lang::georgian()` იცავს იმისგან, რომ TMDB ჩუმად ორიგინალ
 *      ენას აბრუნებს, როცა თარგმანი არ აქვს.
 *   2. **Gemini** — მხოლოდ იმაზე, რაც TMDB-ის შემდეგ დარჩა — ე.ი. სათაურებზე
 *      თითქმის არასდროს გვჭირდება. ⚠️ გასაღების გარეშე ეს ნაბიჯი
 *      უბრალოდ არაფერს აკეთებს — და ინტერფეისი ამას ცხადად წერს.
 *
 * ⚠️ **წყაროებს ახლა მომხმარებელი ირჩევს** (შენი მითითება, 2026-09-14:
 * „უნდა ირჩევდე, გუგლით თარგმნო თუ TMDB-დან — თავისით არ უნდა ხდებოდეს").
 * `$sources` ქვესიმრავლეა და **თანმიმდევრობას ინარჩუნებს**: მარტო `tmdb`,
 * მარტო `gemini`, ან ორივე.
 *
 * ⚠️ **„რომელმა წყარომ შეავსო" ახლა ბრუნდება და ინახება.** აქამდე
 * `persist()` აღწერას **ყოველთვის** `source = 'translation'`-ს აწერდა —
 * მაშინაც, როცა ტექსტი TMDB-მ მოიტანა, ე.ი. ჩანაწერის გვერდზე ბარათი
 * ცრუობდა.
 *
 * არსებულ ტექსტს **არ ვცვლით** — მხოლოდ ცარიელი ივსება (იგივე სემანტიკა, რაც
 * Enricher-ებს აქვთ).
 *
 * ⚠️ **ერთადერთი გამონაკლისი `review` რეჟიმია** (2026-09-14) — და სწორედ
 * იმიტომაა ცალკე, ცხადად ჩასართავი დროშა და არა ჩუმი ქცევა, რომ ზემოთა წესს
 * არღვევს: იქ TMDB-ის **ქართული აღწერა** Gemini-ს გადასამოწმებლად მიდის.
 * იხ. `reviewGeorgian()`.
 */
class ItemTranslator
{
    /** დასაშვები წყაროები, **თანმიმდევრობით** — TMDB ჯერ, Gemini მერე */
    public const SOURCES = ['tmdb', 'gemini'];

    public function __construct(
        private TmdbClient $tmdb,
        private Translator $translator,
    ) {}

    /**
     * @param  array<int, string>  $sources  `tmdb` · `gemini` (ქვესიმრავლე)
     * @param  bool  $review  TMDB-ის ქართული აღწერა Gemini-მ გადაამოწმოს თუ არა
     * @return array{ok:bool, skipped:bool, changed:array<int, string>, providers:array<string, string>, error:?string}
     */
    public function translate(Model $item, array $sources = self::SOURCES, bool $review = false): array
    {
        $sources = $this->normalizeSources($sources);

        $missing = TranslationScanner::missing($item);

        /* ⚠️ **`review`-ზე ცარიელი `missing` „გამოტოვებას" აღარ ნიშნავს.**
           გადამოწმების საგანი სწორედ **არსებული** ტექსტია, ე.ი. სრულად
           შევსებული ჩანაწერიც სამუშაოა. */
        if (! $missing && ! $review) {
            return $this->result(true, true, [], null);
        }

        /** @var array<string, string> ველი => წყარო */
        $providers = [];
        $filled = [];

        try {
            if ($missing && in_array('tmdb', $sources, true)) {
                $filled = $this->fromTmdb($item, $missing);
                foreach ($filled as $field => $_) {
                    $providers[$field] = 'tmdb';
                }
            }

            if ($missing && in_array('gemini', $sources, true)) {
                // რაც TMDB-მ ვერ შეავსო — თარჯიმანზე
                $rest = array_values(array_diff($missing, array_keys($filled)));
                $before = $filled;
                $this->fromTranslator($item, $rest, $filled);

                foreach (array_diff_key($filled, $before) as $field => $_) {
                    $providers[$field] = 'gemini';
                }
            }

            if ($review) {
                $this->reviewGeorgian($item, $filled, $providers);
            }

            $this->persist($item, $filled, $providers);
        } catch (Throwable $e) {
            return $this->result(false, false, array_keys($filled), Redact::secrets($e->getMessage()), $providers);
        }

        $changed = array_keys($filled);

        /* ⚠️ **ამოწურული ლიმიტი ჩუმად არ გაივლის.** თუ ვერაფერი შეივსო და
           თარჯიმანმა კვოტის მიზეზი დააბრუნა, ეს **შეცდომაა** და არა
           „გამოტოვებული" — თორემ რიგი დაწერდა „შესრულდა" და ბიბლიოთეკა
           უთარგმნელი დარჩებოდა. */
        if (! $changed && ($reason = $this->translator->lastError()) === 'gemini_quota_exceeded') {
            return $this->result(false, false, [], $reason, $providers);
        }

        return $this->result(true, $changed === [], $changed, null, $providers);
    }

    /* ---------- ნაბიჯი 3: გადამოწმება (`review`, 2026-09-14) ---------- */

    /**
     * **TMDB-ის ქართულ აღწერას Gemini ადარებს ინგლისურ ორიგინალს.**
     *
     * ⚠️ **ეს ერთადერთი ადგილია, სადაც არსებული ტექსტი გადაიწერება** — ამიტომ
     * არის ცალკე, სახელდებული რეჟიმი და არა ჩუმი ქცევა (პროექტის მზიდი წესი:
     * „არსებული ტექსტი არასდროს გადაიწერება").
     *
     * ოთხი შეზღუდვა და თითოეულს თავისი მიზეზი აქვს:
     *
     * ⚠️ **მხოლოდ `ka`.** ინგლისური ტექსტი TMDB-ზე თარგმანი კი არა, ორიგინალია
     * — მის „გადამოწმებას" შესადარებელი არაფერი აქვს.
     *
     * ⚠️ **მხოლოდ აღწერა და არა სათაური.** `<domain>_translations.source`
     * **სტრიქონის** სვეტია და პრაქტიკულად აღწერას აღწერს; სათაურის გადაწერისას
     * იგივე სტრიქონი განაგრძობდა „TMDB-ისაა"-ს მტკიცებას მანქანურად
     * გადაკეთებულ სათაურზე, ე.ი. ბარათი ცრუობდა. სათაური თან ერთ-ორსიტყვიანია
     * — TMDB-ის ოფიციალური ქართული სახელის „გასწორება" უფრო ზიანია.
     *
     * ⚠️ **მხოლოდ `source = 'tmdb'`.** `manual` მომხმარებლის საკუთარი ტექსტია
     * (მისი გადაწერა ყველაზე მძიმე ზიანია), `translation` კი თავად Gemini-ის
     * გამოსავალია — მისი გადამოწმება იმავე მოდელით ხარჯია და არა შემოწმება.
     *
     * ⚠️ **ორიგინალიც TMDB-ისა უნდა იყოს.** თუ ინგლისური აღწერა ამავე
     * გატარებაზე Gemini-მ დაწერა (ka-დან), მასთან შედარება წრეა — ქართულს
     * საკუთარი თარგმანის თარგმანს შევადარებდით.
     *
     * @param  array<string, string>  $filled
     * @param  array<string, string>  $providers
     */
    private function reviewGeorgian(Model $item, array &$filled, array &$providers): void
    {
        if (! $this->translator->configured()) {
            return;
        }

        if (isset($filled['description_ka'])) {
            // ამავე გატარებაზე შევსებული — მხოლოდ TMDB-ისა გადამოწმდება
            if (($providers['description_ka'] ?? null) !== 'tmdb') {
                return;
            }
            $text = $filled['description_ka'];
        } else {
            $text = trim((string) $item->description_ka);
            if ($text === '' || $item->description_ka_source !== 'tmdb') {
                return;
            }
        }

        $original = ($providers['description_en'] ?? null) === 'tmdb'
            ? ($filled['description_en'] ?? '')
            : trim((string) $item->description_en);

        if ($original === '') {
            return;
        }

        $kind = MediaDomain::isTv(MediaDomain::typeOf($item)) ? 'TV series' : 'movie';
        $fixed = trim((string) $this->translator->review($text, $original, 'ka', "{$kind} synopsis"));

        // შედეგიც მხედრული უნდა იყოს — თორემ მოდელმა ორიგინალი დაგვიბრუნა
        if ($fixed === '' || ! Lang::georgian($fixed)) {
            return;
        }

        $filled['description_ka'] = $fixed;
        /* ⚠️ წყარო **`translation`-ია** (შენი პასუხი, 2026-09-14): ბარათზე
           ორი რამ უნდა ითქვას — „TMDB-ისაა" თუ „მანქანამ თარგმნა", და
           გადამოწმებული ტექსტი უკვე Gemini-ის დაწერილია. `providers`-ში
           კი `review` რჩება, რომ ლოგმა „რა რითი" ზუსტად თქვას. */
        $providers['description_ka'] = 'review';
    }

    /**
     * არჩეული წყაროები — თანმიმდევრობა **ჩვენია** და არა გამომძახებლის.
     *
     * @param  array<int, string>  $sources
     * @return array<int, string>
     */
    private function normalizeSources(array $sources): array
    {
        $picked = array_values(array_intersect(self::SOURCES, $sources));

        // ⚠️ ცარიელი არჩევანი კონტროლერზე 422-ია; აქ ის მხოლოდ პროგრამული
        // გამოძახებისთვის ბრუნდება ნაგულისხმევზე (CLI, ტესტი).
        return $picked ?: self::SOURCES;
    }

    /* ---------- ნაბიჯი 1: TMDB ---------- */

    /**
     * @param  array<int, string>  $missing
     * @return array<string, string> ველი => ტექსტი
     */
    private function fromTmdb(Model $item, array $missing): array
    {
        if (! $item->tmdb_id || ! $this->tmdb->configured()) {
            return [];
        }

        // ⚠️ TMDB-ის `/tv/*`-ზე ორი დომენი ზის (სერიალი და ანიმე, §7.1)
        $isSeries = MediaDomain::isTv(MediaDomain::typeOf($item));
        $titleKey = $isSeries ? 'name' : 'title';
        $filled = [];

        foreach (['ka' => 'ka', 'en' => 'en-US'] as $locale => $language) {
            $wanted = array_values(array_filter($missing, fn ($f) => str_ends_with($f, '_'.$locale)));
            if (! $wanted) {
                continue;
            }

            try {
                $d = $isSeries
                    ? $this->tmdb->tvDetails($item->tmdb_id, $language)
                    : $this->tmdb->details($item->tmdb_id, $language);
            } catch (Throwable) {
                continue; // TMDB-ის ჩავარდნა თარგმანს არ აჩერებს — თარჯიმანი მაინც სცდის
            }

            $map = [
                'title_'.$locale => $d[$titleKey] ?? null,
                'description_'.$locale => $d['overview'] ?? null,
            ];

            foreach ($wanted as $field) {
                $value = trim((string) ($map[$field] ?? ''));
                // ka-ზე TMDB ჩუმად ორიგინალს აბრუნებს — მხედრულის გარეშე არ ვიღებთ
                if ($locale === 'ka') {
                    $value = (string) Lang::georgian($value);
                }
                if ($value !== '') {
                    $filled[$field] = $value;
                }
            }
        }

        return $filled;
    }

    /* ---------- ნაბიჯი 2: თარჯიმანი ---------- */

    /**
     * შევსებულს პირდაპირ `$filled`-ში წერს, რომ ერთსა და იმავე გატარებაზე
     * TMDB-ით მოტანილი ტექსტიც წყაროდ გამოდგეს.
     *
     * @param  array<int, string>  $rest
     * @param  array<string, string>  $filled
     */
    private function fromTranslator(Model $item, array $rest, array &$filled): void
    {
        if (! $rest) {
            return;
        }

        $kind = MediaDomain::isTv(MediaDomain::typeOf($item)) ? 'TV series' : 'movie';

        foreach ($rest as $field) {
            [$attr, $locale] = [substr($field, 0, -3), substr($field, -2)];
            $from = $locale === 'ka' ? 'en' : 'ka';

            // წყარო: ან უკვე შევსებული (ამავე გატარებაზე), ან ბაზაში არსებული
            $source = trim((string) ($filled[$attr.'_'.$from] ?? $item->{$attr.'_'.$from}));
            if ($source === '') {
                continue;
            }

            $context = $attr === 'title' ? "{$kind} title" : "{$kind} synopsis";
            $value = trim((string) $this->translator->translate($source, $locale, $context));

            // ka-ზე შედეგიც უნდა იყოს მხედრული, თორემ თარჯიმანმა ორიგინალი დაგვიბრუნა
            if ($value === '' || ($locale === 'ka' && ! Lang::georgian($value))) {
                continue;
            }

            $filled[$field] = $value;
        }
    }

    /* ---------- ჩაწერა ---------- */

    /**
     * @param  array<string, string>  $filled
     * @param  array<string, string>  $providers  ველი => `tmdb`|`gemini`
     */
    private function persist(Model $item, array $filled, array $providers = []): void
    {
        foreach (['ka', 'en'] as $locale) {
            $attrs = [];
            if (isset($filled['title_'.$locale])) {
                $attrs['title'] = $filled['title_'.$locale];
            }
            if (isset($filled['description_'.$locale])) {
                $attrs['description'] = $filled['description_'.$locale];
                /* ⚠️ **წყარო ნამდვილი უნდა იყოს და არა ყოველთვის `translation`.**
                   აქამდე TMDB-ის ტექსტიც „მანქანურ თარგმანად" ინიშნებოდა, ე.ი.
                   ჩანაწერის გვერდზე ბარათი პირდაპირ ცრუობდა — და სწორედ ესაა
                   შენი „რა რითი ითარგმნა უნდა ჩანდეს". */
                $attrs['source'] = ($providers['description_'.$locale] ?? 'gemini') === 'tmdb'
                    ? 'tmdb'
                    : 'translation';
            }
            if ($attrs) {
                $item->setTranslation($locale, $attrs);
            }
        }
    }

    /* ---------- ჟანრები ---------- */

    /**
     * ჟანრების ლექსიკონი ერთ გატარებაზე (მათი რაოდენობა ათეულებია).
     *
     * TMDB-ს ჟანრის ქართული სახელი **უკვე აქვს** (`/genre/movie/list?language=ka`),
     * ამიტომ ჯერ ის — და მხოლოდ დარჩენილზე Gemini. ვამთხვევთ `tmdb_id`-ით:
     * slug ლათინურია და ქართულ სახელს ვერ დაედება.
     *
     * @param  iterable<Genre>  $genres
     * @param  array<int, string>  $sources  `tmdb` · `gemini` (ქვესიმრავლე)
     * @return array{translated:int, changed:array<int, string>}
     */
    public function translateGenres(iterable $genres, array $sources = self::SOURCES): array
    {
        $sources = $this->normalizeSources($sources);

        $genres = collect($genres);
        if ($genres->isEmpty()) {
            return ['translated' => 0, 'changed' => []];
        }

        // ⚠️ TMDB-ის სიაც ფულს არ ხარჯავს, მაგრამ არჩევანი არჩევანია:
        // „მარტო Gemini"-ზე TMDB-ს საერთოდ არ ვეკითხებით
        $lists = in_array('tmdb', $sources, true) ? $this->genreLists() : ['ka' => [], 'en' => []];
        $changed = [];
        $translated = 0;

        foreach ($genres as $genre) {
            $did = false;

            foreach (TranslationScanner::genreMissing($genre) as $field) {
                $locale = substr($field, -2);
                $value = $this->genreName($genre, $locale, $lists, in_array('gemini', $sources, true));
                if ($value === '') {
                    continue;
                }

                $genre->setTranslation($locale, $value);
                $changed[] = $genre->slug.':'.$field;
                $did = true;
            }

            if ($did) {
                $translated++;
            }
        }

        return ['translated' => $translated, 'changed' => $changed];
    }

    /**
     * TMDB-ის ჟანრების სია ორივე ენაზე. ფილმებისა და სერიალების სიები
     * ერთმანეთს ავსებს (TV-ს თავისი ჟანრები აქვს, მაგ. „Reality").
     *
     * @return array<string, array<int, string>>
     */
    private function genreLists(): array
    {
        $lists = ['ka' => [], 'en' => []];
        if (! $this->tmdb->configured()) {
            return $lists;
        }

        foreach (['ka' => 'ka', 'en' => 'en-US'] as $locale => $language) {
            try {
                $lists[$locale] = $this->tmdb->genreList($language) + $this->tmdb->genreList($language, true);
            } catch (Throwable) {
                $lists[$locale] = [];
            }
        }

        return $lists;
    }

    /** ჟანრის სახელი მოცემულ ენაზე — ჯერ TMDB, მერე თარჯიმანი */
    private function genreName(Genre $genre, string $locale, array $lists, bool $useTranslator = true): string
    {
        if ($genre->tmdb_id && isset($lists[$locale][$genre->tmdb_id])) {
            $value = trim($lists[$locale][$genre->tmdb_id]);
            if ($locale === 'ka') {
                $value = (string) Lang::georgian($value);
            }
            if ($value !== '') {
                return $value;
            }
        }

        if (! $useTranslator) {
            return '';
        }

        $source = trim((string) ($locale === 'ka' ? $genre->name_en : $genre->name_ka));
        if ($source === '') {
            return '';
        }

        $value = trim((string) $this->translator->translate($source, $locale, 'film genre name'));

        return $locale === 'ka' && ! Lang::georgian($value) ? '' : $value;
    }

    private function result(bool $ok, bool $skipped, array $changed, ?string $error, array $providers = []): array
    {
        return [
            'ok' => $ok,
            'skipped' => $skipped,
            'changed' => $changed,
            // „რა რითი ითარგმნა" — ველი => წყარო (ლოგისა და ინტერფეისისთვის)
            'providers' => $providers,
            'error' => $error,
        ];
    }
}
