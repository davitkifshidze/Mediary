<?php

namespace App\Services\Translation;

use App\Models\Genre;
use App\Services\Tmdb\TmdbClient;
use App\Support\Lang;
use App\Support\MediaDomain;
use Illuminate\Database\Eloquent\Model;
use Throwable;

/**
 * ერთი ჩანაწერის თარგმნა (Tasks 7).
 *
 * ორნაბიჯიანია და თანმიმდევრობა განზრახ ასეთია:
 *   1. **TMDB** — უფასოა და ავტორიტეტული. ქართული სათაური/აღწერა TMDB-ს ხშირად
 *      უკვე აქვს; `Lang::georgian()` იცავს იმისგან, რომ TMDB ჩუმად ორიგინალ
 *      ენას აბრუნებს, როცა თარგმანი არ აქვს.
 *   2. **Claude** — მხოლოდ იმაზე, რაც TMDB-ის შემდეგ დარჩა. ე.ი. კლავიშის
 *      ხარჯი მინიმალურია და სათაურებზე თითქმის არასდროს გვჭირდება.
 *
 * არსებულ ტექსტს **არ ვცვლით** — მხოლოდ ცარიელი ივსება (იგივე სემანტიკა, რაც
 * Enricher-ებს აქვთ).
 */
class ItemTranslator
{
    public function __construct(
        private TmdbClient $tmdb,
        private Translator $translator,
    ) {}

    /**
     * @return array{ok:bool, skipped:bool, changed:array<int, string>, error:?string}
     */
    public function translate(Model $item): array
    {
        $missing = TranslationScanner::missing($item);
        if (! $missing) {
            return $this->result(true, true, [], null);
        }

        $filled = [];

        try {
            $filled = $this->fromTmdb($item, $missing);

            // რაც TMDB-მ ვერ შეავსო — თარჯიმანზე
            $rest = array_values(array_diff($missing, array_keys($filled)));
            $this->fromTranslator($item, $rest, $filled);

            $this->persist($item, $filled);
        } catch (Throwable $e) {
            return $this->result(false, false, array_keys($filled), $e->getMessage());
        }

        $changed = array_keys($filled);

        return $this->result(true, $changed === [], $changed, null);
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

    /** @param  array<string, string>  $filled */
    private function persist(Model $item, array $filled): void
    {
        foreach (['ka', 'en'] as $locale) {
            $attrs = [];
            if (isset($filled['title_'.$locale])) {
                $attrs['title'] = $filled['title_'.$locale];
            }
            if (isset($filled['description_'.$locale])) {
                $attrs['description'] = $filled['description_'.$locale];
                $attrs['source'] = 'translation';
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
     * ამიტომ ჯერ ის — და მხოლოდ დარჩენილზე Claude. ვამთხვევთ `tmdb_id`-ით:
     * slug ლათინურია და ქართულ სახელს ვერ დაედება.
     *
     * @param  iterable<Genre>  $genres
     * @return array{translated:int, changed:array<int, string>}
     */
    public function translateGenres(iterable $genres): array
    {
        $genres = collect($genres);
        if ($genres->isEmpty()) {
            return ['translated' => 0, 'changed' => []];
        }

        $lists = $this->genreLists();
        $changed = [];
        $translated = 0;

        foreach ($genres as $genre) {
            $did = false;

            foreach (TranslationScanner::genreMissing($genre) as $field) {
                $locale = substr($field, -2);
                $value = $this->genreName($genre, $locale, $lists);
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
    private function genreName(Genre $genre, string $locale, array $lists): string
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

        $source = trim((string) ($locale === 'ka' ? $genre->name_en : $genre->name_ka));
        if ($source === '') {
            return '';
        }

        $value = trim((string) $this->translator->translate($source, $locale, 'film genre name'));

        return $locale === 'ka' && ! Lang::georgian($value) ? '' : $value;
    }

    private function result(bool $ok, bool $skipped, array $changed, ?string $error): array
    {
        return ['ok' => $ok, 'skipped' => $skipped, 'changed' => $changed, 'error' => $error];
    }
}
