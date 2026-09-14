<?php

namespace App\Services\Enrichment;

use App\Models\CastMember;
use App\Models\Genre;
use App\Models\Movie;
use App\Services\Media\MediaDownloader;
use App\Services\Tmdb\TmdbClient;
use App\Services\Translation\Translator;
use App\Support\CastSync;
use App\Support\Trailer;
use Illuminate\Support\Str;

class MovieEnricher
{
    private string $img = 'https://image.tmdb.org/t/p';

    public function __construct(
        private TmdbClient $tmdb,
        private MediaDownloader $media,
        private Translator $translator,
    ) {}

    public function configured(): bool
    {
        return $this->tmdb->configured();
    }

    /** input-იდან IMDb ID (url-შიც ეძებს) */
    private function imdbFrom(array $in): ?string
    {
        $imdb = $in['imdb'] ?? null;
        if (! $imdb && ! empty($in['url']) && preg_match('/tt\d+/', $in['url'], $m)) {
            $imdb = $m[0];
        }

        return ($imdb && preg_match('/^tt\d+$/', $imdb)) ? $imdb : null;
    }

    /** input-იდან საძებნი ტექსტი (query ან ge.movie slug-იდან) */
    private function queryFrom(array $in): ?string
    {
        $query = $in['query'] ?? null;
        if (! $query && ! empty($in['url']) && preg_match('~/movie/\d+/([^/?#]+)~', $in['url'], $m)) {
            $slug = preg_replace('/-?qartulad-?.*$/', '', $m[1]);
            $query = trim(str_replace('-', ' ', $slug));
        }

        return $query ?: null;
    }

    /** input → TMDB movie id */
    public function resolveTmdbId(array $in): ?int
    {
        if ($imdb = $this->imdbFrom($in)) {
            if ($id = $this->tmdb->findByImdb($imdb)) {
                return $id;
            }
        }

        $query = $this->queryFrom($in);

        return $query ? $this->tmdb->search($query, $in['year'] ?? null) : null;
    }

    /** კანდიდატების სია (ასარჩევად) */
    public function candidates(array $in): array
    {
        // IMDb → ზუსტი ერთი
        if ($imdb = $this->imdbFrom($in)) {
            if ($id = $this->tmdb->findByImdb($imdb)) {
                return [$this->normalizeCandidate($this->tmdb->details($id))];
            }
        }

        $query = $this->queryFrom($in);
        if (! $query) {
            return [];
        }

        $results = array_slice($this->tmdb->searchAll($query), 0, 8);

        return array_map(fn ($r) => $this->normalizeCandidate($r), $results);
    }

    private function normalizeCandidate(array $r): array
    {
        return [
            'tmdb_id' => $r['id'],
            'title_en' => $r['title'] ?? ($r['original_title'] ?? ''),
            'year' => ! empty($r['release_date']) ? (int) substr($r['release_date'], 0, 4) : null,
            'rating' => isset($r['vote_average']) ? round((float) $r['vote_average'], 1) : null,
            'poster' => ! empty($r['poster_path']) ? $this->img.'/w185'.$r['poster_path'] : null,
        ];
    }

    /** ფორმის prefill-ისთვის — არ ინახავს, remote სურათებით */
    public function lookupDraft(array $in): ?array
    {
        $id = $this->resolveTmdbId($in);

        return $id ? $this->draftFromId($id) : null;
    }

    /** კონკრეტული TMDB id-ის დრაფტი */
    public function draftFromId(int $id): array
    {
        $d = $this->tmdb->details($id);
        $credits = $this->tmdb->credits($id);

        return [
            'tmdb_id' => $id,
            'imdb_id' => $d['imdb_id'] ?? null,
            'title_en' => $d['title'] ?? null,
            'title_ka' => $this->translator->toGeorgian($d['title'] ?? null),
            'year' => $this->year($d),
            'rating' => isset($d['vote_average']) ? round((float) $d['vote_average'], 1) : null,
            'description_en' => $d['overview'] ?? null,
            'description_ka' => $this->translator->toGeorgian($d['overview'] ?? null),
            'genres' => array_map(fn ($g) => $g['name'], $d['genres'] ?? []),
            'poster' => ! empty($d['poster_path']) ? $this->img.'/w500'.$d['poster_path'] : null,
            'cast' => array_map(fn ($c) => [
                'name' => $c['name'],
                'character' => $c['character'] ?? '',
                'photo' => ! empty($c['profile_path']) ? $this->img.'/w185'.$c['profile_path'] : null,
            ], array_slice($credits['cast'] ?? [], 0, 12)),
        ];
    }

    /**
     * ოფიციალური ტრეილერი TMDB-დან, ka→en კასკადით (Tasks 9).
     * ჩავარდნაზე `null` — ტრეილერის უქონლობა გამდიდრებას არ უნდა შეაჩეროს.
     */
    private function trailer(int $id): ?string
    {
        try {
            return Trailer::pick($this->tmdb->videos($id, 'ka'), $this->tmdb->videos($id));
        } catch (\Throwable) {
            return null;
        }
    }

    /** არსებული ფილმის გამდიდრება — ჩამოტვირთვა + შევსება + genres/cast */
    public function enrichMovie(Movie $movie): bool
    {
        $id = $movie->tmdb_id ?: $this->resolveTmdbId([
            'imdb' => $movie->imdb_id,
            'url' => $movie->ge_url,
            'query' => $movie->title_en ?: $movie->title_ka,
            'year' => $movie->year,
        ]);

        if (! $id) {
            $movie->sync_status = 'failed';
            $movie->save();

            return false;
        }

        $d = $this->tmdb->details($id);
        $credits = $this->tmdb->credits($id);

        // არსებული თარგმანები (მხოლოდ ცარიელს ვავსებთ — user-ის მონაცემი არ იშლება)
        $curTitleEn = $movie->title_en;
        $curTitleKa = $movie->title_ka;
        $curDescEn = $movie->description_en;
        $curDescKa = $movie->description_ka;
        $curDescEnSrc = $movie->description_en_source;
        $curDescKaSrc = $movie->description_ka_source;

        // --- არა-translation ველები ---
        $movie->tmdb_id = $id;
        $movie->year = $movie->year ?: $this->year($d);
        $movie->imdb_id = $movie->imdb_id ?: ($d['imdb_id'] ?? null);
        if ($movie->imdb_id) {
            $movie->imdb_url = "https://www.imdb.com/title/{$movie->imdb_id}/";
        }
        $movie->rating = $movie->rating ?: (isset($d['vote_average']) ? round((float) $d['vote_average'], 1) : null);
        // ტრეილერი (Tasks 9) — მხოლოდ ცარიელზე, ე.ი. ხელით ჩასმულს არ ვაბათილებთ
        $movie->trailer_url = $movie->trailer_url ?: $this->trailer($id);
        if (! empty($d['belongs_to_collection'])) {
            $movie->tmdb_collection_id = $d['belongs_to_collection']['id'] ?? null;
            $movie->collection_name = $d['belongs_to_collection']['name'] ?? null;
        }
        $movie->sync_status = 'synced';
        $movie->save();

        // --- EN translation ---
        $titleEn = $curTitleEn ?: ($d['title'] ?? null);
        $descEn = $curDescEn;
        $descEnSrc = $curDescEnSrc;
        if (! $curDescEn && ! empty($d['overview'])) {
            $descEn = $d['overview'];
            $descEnSrc = 'tmdb';
        }
        $movie->setTranslation('en', ['title' => $titleEn, 'description' => $descEn, 'source' => $descEnSrc]);

        // --- KA translation (ავტომატური თარგმანი, თუ ცარიელია) ---
        $titleKa = $curTitleKa ?: ($titleEn ? $this->translator->toGeorgian($titleEn) : null);
        $descKa = $curDescKa;
        $descKaSrc = $curDescKaSrc;
        if (! $curDescKa && $descEn) {
            $descKa = $this->translator->toGeorgian($descEn);
            if ($descKa) {
                $descKaSrc = 'translated';
            }
        }
        $movie->setTranslation('ka', ['title' => $titleKa, 'description' => $descKa, 'source' => $descKaSrc]);

        // --- პოსტერი (title_en უკვე ხელმისაწვდომია slug-ისთვის) ---
        if (! empty($d['poster_path'])) {
            $path = $this->media->poster($d['poster_path'], $movie->slugForFile(), 'movie');
            if ($path) {
                $movie->poster_path = $path;
                $movie->poster_source = 'tmdb';
                $movie->save();
            }
        }

        // ჟანრები — slug-ით ვამთხვევთ
        $genreIds = [];
        foreach ($d['genres'] ?? [] as $g) {
            $slug = Str::slug($g['name']) ?: 'g-'.$g['id'];
            $genre = Genre::firstOrCreate(['slug' => $slug], ['tmdb_id' => $g['id']]);
            $isNew = $genre->wasRecentlyCreated;
            if (! $genre->tmdb_id) {
                $genre->tmdb_id = $g['id'];
                $genre->save();
            }
            if ($isNew) {
                $genre->setTranslation('en', $g['name']);
                $genre->setTranslation('ka', $g['name']);
            }
            $genreIds[] = $genre->id;
        }
        if ($genreIds) {
            $movie->genres()->sync($genreIds);
        }

        // მსახიობები + ფოტოები
        $sync = [];
        foreach (array_slice($credits['cast'] ?? [], 0, 12) as $i => $c) {
            $member = CastMember::firstOrNew(['tmdb_person_id' => $c['id']]);
            $member->name = $c['name'];
            // Tasks 10 — სქესი გალერეის „ქალი/კაცი მსახიობები" ფილტრს სჭირდება
            if (isset($c['gender'])) {
                $member->gender = (int) $c['gender'];
            }
            if (! empty($c['profile_path'])) {
                if ($photo = $this->media->profile($c['profile_path'], $c['id'])) {
                    $member->photo_path = $photo;
                }
            }
            $member->save();
            $sync[$member->id] = ['character' => $c['character'] ?? '', 'billing_order' => $i];
        }
        if ($sync) {
            // ⚠️ ხელით დამატებული მსახიობი `sync()`-ს ჩუმად წაეშლებოდა — იხ. `CastSync`
            CastSync::fromSource($movie, $sync);
        }

        return true;
    }

    /**
     * მხოლოდ მედია — პოსტერი + მსახიობთა ფოტოები TMDB-დან ხელახლა ჩამოტვირთვა.
     * თარგმანს/ჟანრებს/cast-ის ბმულებს არ ცვლის. საჭიროა tmdb_id.
     * გამოიყენება „მედიის ხელახლა ჩამოტვირთვის" ღილაკიდან ახალ მანქანაზე კლონის შემდეგ.
     */
    public function redownloadMedia(Movie $movie): bool
    {
        if (! $movie->tmdb_id) {
            return false;
        }

        $d = $this->tmdb->details($movie->tmdb_id);
        if (! empty($d['poster_path'])) {
            if ($path = $this->media->poster($d['poster_path'], $movie->slugForFile(), 'movie')) {
                $movie->poster_path = $path;
                $movie->poster_source = 'tmdb';
                $movie->save();
            }
        }

        $credits = $this->tmdb->credits($movie->tmdb_id);
        foreach (array_slice($credits['cast'] ?? [], 0, 12) as $c) {
            if (empty($c['profile_path'])) {
                continue;
            }
            $member = CastMember::where('tmdb_person_id', $c['id'])->first();
            if (! $member) {
                continue;
            }
            if ($photo = $this->media->profile($c['profile_path'], $c['id'])) {
                $member->photo_path = $photo;
                $member->save();
            }
        }

        return true;
    }

    private function year(array $details): ?int
    {
        return ! empty($details['release_date']) ? (int) substr($details['release_date'], 0, 4) : null;
    }
}
