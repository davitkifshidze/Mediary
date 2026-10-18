<?php

namespace App\Services\Enrichment;

use App\Services\Tmdb\TmdbClient;

/**
 * **ნაპოვნი ფორმის ტიპს არ ემთხვევა?**
 *
 * შენი სიტყვები: „რამეს თუ ვამატებ ფილმში და სერიალია, უნდა მითხრას და
 * მიხვდეს, რომ სერიალია, და გადამიყვანოს სერიალის დამატებაში, და იქ
 * დამხვდეს შევსებული."
 *
 * ფილმის ფორმის ძებნა მხოლოდ ფილმებს კითხულობს (`/find`-ის `movie_results`,
 * `/search/movie`), სერიალისა — მხოლოდ სერიალებს; ე.ი. სერიალის IMDb id
 * ფილმის ფორმაში „ვერ მოიძებნა" იყო. აქ იგივე შეყვანა მეორე ტიპშიც მოწმდება:
 *
 * - IMDb id — `/find`-ის მეორე სია (`tv_results` / `movie_results`);
 * - TMDB-ის ბმული — `/tv/N` ფილმის ფორმაში, `/movie/N` სერიალისაში;
 * - სახელი — `/search/multi`-ის პირველი ფილმი ან სერიალი (TMDB-ის რიგით).
 *
 * იაპონური ანიმაცია (ჟანრი 16 + `origin_country` JP) ანიმეა — TMDB მას
 * ცალკე ტიპად არ იცნობს.
 *
 * ⚠️ **მინიშნებაა და არა წესი**: ფორმა არჩევანს გთავაზობს („სერიალებში
 * გადასვლა" / „მაინც ფილმად"), კანდიდატების სია კი უცვლელი რჩება.
 */
final class MediaTypeHint
{
    /** TMDB-ის ჟანრი „Animation" (ფილმიც და სერიალიც) */
    private const ANIMATION = 16;

    private string $img = 'https://image.tmdb.org/t/p';

    public function __construct(private readonly TmdbClient $tmdb) {}

    /**
     * @param  array{url?: string|null, imdb?: string|null, query?: string|null}  $in
     * @return array{type: string, tmdb_id: int, title: string, year: int|null, poster: string|null}|null
     */
    public function suggest(string $type, array $in): ?array
    {
        $tv = $type !== 'movie';

        if ($imdb = self::imdb($in)) {
            $found = $this->tmdb->find($imdb);
            $own = $found[$tv ? 'tv_results' : 'movie_results'][0] ?? null;
            $other = $found[$tv ? 'movie_results' : 'tv_results'][0] ?? null;

            if ($own) {
                return $this->sameKind($type, $own);
            }

            return $other ? $this->hint($type, $tv ? 'movie' : 'tv', $other) : null;
        }

        if (preg_match('~themoviedb\.org/(movie|tv)/(\d+)~', (string) ($in['url'] ?? ''), $m)) {
            $kind = $m[1];
            $row = $kind === 'tv' ? $this->tmdb->tvDetails((int) $m[2]) : $this->tmdb->details((int) $m[2]);

            return ($kind === 'tv') === $tv ? $this->sameKind($type, $row) : $this->hint($type, $kind, $row);
        }

        $query = trim((string) ($in['query'] ?? ''));

        if ($query === '') {
            return null;
        }

        foreach ($this->tmdb->searchMulti($query) as $row) {
            $kind = $row['media_type'] ?? null;

            // ⚠️ ადამიანი (`person`) გამოტოვდება — პირველი ფილმი ან სერიალი წყვეტს
            if ($kind === 'movie' || $kind === 'tv') {
                return ($kind === 'tv') === $tv ? $this->sameKind($type, $row) : $this->hint($type, $kind, $row);
            }
        }

        return null;
    }

    /** ტიპი ემთხვევა — სხვა მხოლოდ სერიალი ↔ ანიმე შეიძლება იყოს */
    private function sameKind(string $type, array $row): ?array
    {
        return $type === 'movie' ? null : $this->hint($type, 'tv', $row);
    }

    /** ნაპოვნის სწორი ტიპი; ფორმისას თუ ემთხვევა — მინიშნება არ არის */
    private function hint(string $type, string $kind, array $row): ?array
    {
        $target = $kind === 'movie' ? 'movie' : (self::japaneseAnimation($row) ? 'anime' : 'series');

        /* ⚠️ ანიმეს ფორმაში ნაპოვნი არა-იაპონური სერიალი მინიშნებას არ იძლევა —
           ანიმე სხვა ქვეყნისაც შეიძლება იყოს, ფორმა კი ისედაც სერიალის წყაროთი ეძებს */
        if ($target === $type || ($type === 'anime' && $target === 'series')) {
            return null;
        }

        $date = (string) ($row[$kind === 'movie' ? 'release_date' : 'first_air_date'] ?? '');
        $title = $kind === 'movie'
            ? ($row['title'] ?? $row['original_title'] ?? '')
            : ($row['name'] ?? $row['original_name'] ?? '');

        return [
            'type' => $target,
            'tmdb_id' => (int) $row['id'],
            'title' => (string) $title,
            'year' => strlen($date) >= 4 ? (int) substr($date, 0, 4) : null,
            'poster' => ! empty($row['poster_path']) ? $this->img.'/w185'.$row['poster_path'] : null,
        ];
    }

    /** ძებნის შედეგს `genre_ids` აქვს, დეტალებს — `genres` */
    private static function japaneseAnimation(array $row): bool
    {
        $genres = $row['genre_ids'] ?? array_column($row['genres'] ?? [], 'id');

        return in_array(self::ANIMATION, $genres, true) && in_array('JP', $row['origin_country'] ?? [], true);
    }

    /** IMDb id — ცალკე ველიდან ან ბმულიდან (`MovieEnricher::imdbFrom()`-ის წესი) */
    private static function imdb(array $in): ?string
    {
        $imdb = $in['imdb'] ?? null;

        if (! $imdb && ! empty($in['url']) && preg_match('/tt\d+/', (string) $in['url'], $m)) {
            $imdb = $m[0];
        }

        return $imdb && preg_match('/^tt\d+$/', (string) $imdb) ? (string) $imdb : null;
    }
}
