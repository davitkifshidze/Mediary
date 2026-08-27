<?php

namespace App\Services\Enrichment;

use App\Models\CastMember;
use App\Models\Genre;
use App\Models\Series;
use App\Services\Media\MediaDownloader;
use App\Services\Tmdb\TmdbClient;
use App\Services\Translation\Translator;
use Illuminate\Support\Str;

/**
 * MovieEnricher-ის TV-ეკვივალენტი — TMDB /tv/* endpoint-ებით.
 * TV-ს field-ები განსხვავებულია: name / first_air_date / number_of_seasons / external_ids.imdb_id.
 */
class SeriesEnricher
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
        if (! $query && ! empty($in['url']) && preg_match('~/(?:movie|tv|series)/\d+/([^/?#]+)~', $in['url'], $m)) {
            $slug = preg_replace('/-?qartulad-?.*$/', '', $m[1]);
            $query = trim(str_replace('-', ' ', $slug));
        }

        return $query ?: null;
    }

    /** input → TMDB tv id */
    public function resolveTmdbId(array $in): ?int
    {
        if ($imdb = $this->imdbFrom($in)) {
            if ($id = $this->tmdb->findTvByImdb($imdb)) {
                return $id;
            }
        }

        $query = $this->queryFrom($in);

        return $query ? $this->tmdb->searchTv($query, $in['year'] ?? null) : null;
    }

    /** კანდიდატების სია (ასარჩევად) */
    public function candidates(array $in): array
    {
        // IMDb → ზუსტი ერთი
        if ($imdb = $this->imdbFrom($in)) {
            if ($id = $this->tmdb->findTvByImdb($imdb)) {
                return [$this->normalizeCandidate($this->tmdb->tvDetails($id))];
            }
        }

        $query = $this->queryFrom($in);
        if (! $query) {
            return [];
        }

        $results = array_slice($this->tmdb->searchAllTv($query), 0, 8);

        return array_map(fn ($r) => $this->normalizeCandidate($r), $results);
    }

    private function normalizeCandidate(array $r): array
    {
        return [
            'tmdb_id' => $r['id'],
            'title_en' => $r['name'] ?? ($r['original_name'] ?? ''),
            'year' => ! empty($r['first_air_date']) ? (int) substr($r['first_air_date'], 0, 4) : null,
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

    /** კონკრეტული TMDB tv id-ის დრაფტი */
    public function draftFromId(int $id): array
    {
        $d = $this->tmdb->tvDetails($id);
        $credits = $this->tmdb->tvCredits($id);

        return [
            'tmdb_id' => $id,
            'imdb_id' => $d['external_ids']['imdb_id'] ?? null,
            'title_en' => $d['name'] ?? null,
            'title_ka' => $this->translator->toGeorgian($d['name'] ?? null),
            'year' => $this->year($d),
            'rating' => isset($d['vote_average']) ? round((float) $d['vote_average'], 1) : null,
            'runtime' => $this->runtime($d),
            'seasons' => $d['number_of_seasons'] ?? null,
            'episodes' => $d['number_of_episodes'] ?? null,
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

    /** არსებული სერიალის გამდიდრება — ჩამოტვირთვა + შევსება + genres/cast */
    public function enrichSeries(Series $series): bool
    {
        $id = $series->tmdb_id ?: $this->resolveTmdbId([
            'imdb' => $series->imdb_id,
            'url' => $series->ge_url,
            'query' => $series->title_en ?: $series->title_ka,
            'year' => $series->year,
        ]);

        if (! $id) {
            $series->sync_status = 'failed';
            $series->save();

            return false;
        }

        $d = $this->tmdb->tvDetails($id);
        $credits = $this->tmdb->tvCredits($id);

        // არსებული თარგმანები (მხოლოდ ცარიელს ვავსებთ — user-ის მონაცემი არ იშლება)
        $curTitleEn = $series->title_en;
        $curTitleKa = $series->title_ka;
        $curDescEn = $series->description_en;
        $curDescKa = $series->description_ka;
        $curDescEnSrc = $series->description_en_source;
        $curDescKaSrc = $series->description_ka_source;

        // --- არა-translation ველები ---
        $series->tmdb_id = $id;
        $series->year = $series->year ?: $this->year($d);
        $series->imdb_id = $series->imdb_id ?: ($d['external_ids']['imdb_id'] ?? null);
        if ($series->imdb_id) {
            $series->imdb_url = "https://www.imdb.com/title/{$series->imdb_id}/";
        }
        $series->rating = $series->rating ?: (isset($d['vote_average']) ? round((float) $d['vote_average'], 1) : null);
        $series->runtime = $series->runtime ?: $this->runtime($d);
        $series->seasons = $series->seasons ?: ($d['number_of_seasons'] ?? null);
        $series->episodes = $series->episodes ?: ($d['number_of_episodes'] ?? null);
        $series->sync_status = 'synced';
        $series->save();

        // --- EN translation ---
        $titleEn = $curTitleEn ?: ($d['name'] ?? null);
        $descEn = $curDescEn;
        $descEnSrc = $curDescEnSrc;
        if (! $curDescEn && ! empty($d['overview'])) {
            $descEn = $d['overview'];
            $descEnSrc = 'tmdb';
        }
        $series->setTranslation('en', ['title' => $titleEn, 'description' => $descEn, 'source' => $descEnSrc]);

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
        $series->setTranslation('ka', ['title' => $titleKa, 'description' => $descKa, 'source' => $descKaSrc]);

        // --- პოსტერი (title_en უკვე ხელმისაწვდომია slug-ისთვის) ---
        if (! empty($d['poster_path'])) {
            $path = $this->media->poster($d['poster_path'], $series->slugForFile());
            if ($path) {
                $series->poster_path = $path;
                $series->poster_source = 'tmdb';
                $series->save();
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
            $series->genres()->sync($genreIds);
        }

        // მსახიობები + ფოტოები
        $sync = [];
        foreach (array_slice($credits['cast'] ?? [], 0, 12) as $i => $c) {
            $member = CastMember::firstOrNew(['tmdb_person_id' => $c['id']]);
            $member->name = $c['name'];
            if (! empty($c['profile_path'])) {
                if ($photo = $this->media->profile($c['profile_path'], $c['id'])) {
                    $member->photo_path = $photo;
                }
            }
            $member->save();
            $sync[$member->id] = ['character' => $c['character'] ?? '', 'billing_order' => $i];
        }
        if ($sync) {
            $series->cast()->sync($sync);
        }

        return true;
    }

    /**
     * მხოლოდ მედია — პოსტერი + მსახიობთა ფოტოები TMDB-დან ხელახლა ჩამოტვირთვა.
     * თარგმანს/ჟანრებს/cast-ის ბმულებს არ ცვლის. საჭიროა tmdb_id.
     * გამოიყენება „მედიის ხელახლა ჩამოტვირთვის" ღილაკიდან ახალ მანქანაზე კლონის შემდეგ.
     */
    public function redownloadMedia(Series $series): bool
    {
        if (! $series->tmdb_id) {
            return false;
        }

        $d = $this->tmdb->tvDetails($series->tmdb_id);
        if (! empty($d['poster_path'])) {
            if ($path = $this->media->poster($d['poster_path'], $series->slugForFile())) {
                $series->poster_path = $path;
                $series->poster_source = 'tmdb';
                $series->save();
            }
        }

        $credits = $this->tmdb->tvCredits($series->tmdb_id);
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
        return ! empty($details['first_air_date']) ? (int) substr($details['first_air_date'], 0, 4) : null;
    }

    /** ეპიზოდის საშ. ხანგრძლივობა (episode_run_time მასივის პირველი) */
    private function runtime(array $details): ?int
    {
        return ! empty($details['episode_run_time'][0]) ? (int) $details['episode_run_time'][0] : null;
    }
}
