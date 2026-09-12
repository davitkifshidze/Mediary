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

    /** გაზომილი ტემპი — მიახლოებითი დროის შესაფასებლად (TMDB + Claude) */
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
        $out = array_fill_keys([...self::TYPES, 'genres', 'total'], 0);

        foreach (array_intersect($types, self::TYPES) as $type) {
            $out[$type] = $this->query($type)->get()
                ->filter(fn ($row) => self::missing($row) !== [])
                ->count();
        }

        $out['genres'] = Genre::with('translations')->get()
            ->filter(fn (Genre $g) => self::genreMissing($g) !== [])
            ->count();

        // ⚠️ ჯამი **`TYPES`-ზე** ითვლება და არა ხელით ჩამოთვლილ ორ დომენზე:
        // მესამე დომენის (`anime`, §7.1) დამატებისას სხვაობა ჩუმი იქნებოდა —
        // ბეჯი ნაკლებს აჩვენებდა, ვიდრე გვერდი.
        $out['total'] = $out['genres'];
        foreach (self::TYPES as $type) {
            $out['total'] += $out[$type];
        }

        return $out;
    }

    /**
     * ფილტრები → დასამუშავებელი ჩანაწერების რიგი (`/sync`-ის plan-ის ანალოგი).
     *
     * @param  array<string, mixed>  $filters
     * @return array{items:array<int, array<string, mixed>>, genres:int}
     */
    public function plan(array $types, array $filters): array
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
                if (! $missing) {
                    continue;
                }
                $items[] = [
                    'type' => $type,
                    'id' => $row->id,
                    'title' => $row->title_ka ?: ($row->title_en ?: '#'.$row->id),
                    'year' => $row->year,
                    'missing' => $missing,
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

    private function query(string $type): Builder
    {
        $q = match ($type) {
            'series' => Series::query(),
            'anime' => Anime::query(),
            default => Movie::query(),
        };

        return $q->with('translations')->orderBy('id');
    }
}
