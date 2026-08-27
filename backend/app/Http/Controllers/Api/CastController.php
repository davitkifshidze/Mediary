<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\MovieListResource;
use App\Http\Resources\SeriesListResource;
use App\Models\CastMember;
use App\Models\Genre;
use App\Services\Tmdb\TmdbClient;
use App\Services\Translation\Translator;
use Throwable;

class CastController extends Controller
{
    /** მსახიობის გვერდი: ფილმოგრაფია + სერიალოგრაფია (ჩემი კოლექცია + TMDB შემოთავაზება) */
    public function show(CastMember $castMember, TmdbClient $tmdb, Translator $translator)
    {
        $movies = $castMember->movies()->with('genres')->orderByDesc('year')->get();
        $series = $castMember->series()->with('genres')->orderByDesc('year')->get();

        $suggestions = [];
        $seriesSuggestions = [];

        if ($castMember->tmdb_person_id && $tmdb->configured()) {
            $genreMap = Genre::whereNotNull('tmdb_id')->get()->keyBy('tmdb_id');

            // --- ფილმების შემოთავაზება ---
            try {
                $ownTmdbIds = $movies->pluck('tmdb_id')->filter()->all();
                $cast = $tmdb->personCredits($castMember->tmdb_person_id)['cast'] ?? [];
                usort($cast, fn ($a, $b) => ($b['popularity'] ?? 0) <=> ($a['popularity'] ?? 0));

                foreach ($cast as $c) {
                    if (empty($c['poster_path']) || in_array($c['id'], $ownTmdbIds, true)) {
                        continue;
                    }
                    $suggestions[] = [
                        'tmdb_id' => $c['id'],
                        'title' => $c['title'] ?? ($c['original_title'] ?? ''),
                        'year' => ! empty($c['release_date']) ? (int) substr($c['release_date'], 0, 4) : null,
                        'rating' => isset($c['vote_average']) ? round((float) $c['vote_average'], 1) : null,
                        'poster' => 'https://image.tmdb.org/t/p/w342'.$c['poster_path'],
                        'overview' => $c['overview'] ?? null,
                        'genres' => $this->mapGenres($c['genre_ids'] ?? [], $genreMap),
                    ];
                }

                if ($suggestions) {
                    $ka = $translator->toGeorgianBatch(array_column($suggestions, 'title'));
                    foreach ($suggestions as $i => &$s) {
                        $s['title_ka'] = $ka[$i] ?? null;
                    }
                    unset($s);
                }
            } catch (Throwable $e) {
                $suggestions = [];
            }

            // --- სერიალების შემოთავაზება ---
            try {
                $ownSeriesTmdbIds = $series->pluck('tmdb_id')->filter()->all();
                $tvCast = $tmdb->personTvCredits($castMember->tmdb_person_id)['cast'] ?? [];
                usort($tvCast, fn ($a, $b) => ($b['popularity'] ?? 0) <=> ($a['popularity'] ?? 0));

                foreach ($tvCast as $c) {
                    if (empty($c['poster_path']) || in_array($c['id'], $ownSeriesTmdbIds, true)) {
                        continue;
                    }
                    $seriesSuggestions[] = [
                        'tmdb_id' => $c['id'],
                        'title' => $c['name'] ?? ($c['original_name'] ?? ''),
                        'year' => ! empty($c['first_air_date']) ? (int) substr($c['first_air_date'], 0, 4) : null,
                        'rating' => isset($c['vote_average']) ? round((float) $c['vote_average'], 1) : null,
                        'poster' => 'https://image.tmdb.org/t/p/w342'.$c['poster_path'],
                        'overview' => $c['overview'] ?? null,
                        'genres' => $this->mapGenres($c['genre_ids'] ?? [], $genreMap),
                    ];
                }

                if ($seriesSuggestions) {
                    $ka = $translator->toGeorgianBatch(array_column($seriesSuggestions, 'title'));
                    foreach ($seriesSuggestions as $i => &$s) {
                        $s['title_ka'] = $ka[$i] ?? null;
                    }
                    unset($s);
                }
            } catch (Throwable $e) {
                $seriesSuggestions = [];
            }
        }

        return response()->json([
            'actor' => [
                'id' => $castMember->id,
                'name' => $castMember->name,
                'name_ka' => $castMember->name_ka,
                'photo' => $castMember->photo_path ? asset('storage/'.$castMember->photo_path) : null,
            ],
            'movies' => MovieListResource::collection($movies),
            'series' => SeriesListResource::collection($series),
            'suggestions' => $suggestions,
            'series_suggestions' => $seriesSuggestions,
        ]);
    }

    /** TMDB genre_ids → ლოკალური ჟანრების ორენოვანი სახელები */
    private function mapGenres(array $ids, $genreMap): array
    {
        $out = [];
        foreach ($ids as $gid) {
            if ($g = $genreMap->get($gid)) {
                $out[] = ['name_en' => $g->name_en, 'name_ka' => $g->name_ka];
            }
        }

        return $out;
    }
}
