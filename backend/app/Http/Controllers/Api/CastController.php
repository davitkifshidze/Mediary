<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\MovieListResource;
use App\Http\Resources\SeriesListResource;
use App\Models\CastMember;
use App\Models\Genre;
use App\Services\Tmdb\TmdbClient;
use App\Support\Lang;
use Throwable;

class CastController extends Controller
{
    /** მსახიობის გვერდი: ფილმოგრაფია + სერიალოგრაფია (ჩემი კოლექცია + TMDB შემოთავაზება) */
    public function show(CastMember $castMember, TmdbClient $tmdb)
    {
        $movies = $castMember->movies()->with('genres')->orderByDesc('year')->get();
        $series = $castMember->series()->with('genres')->orderByDesc('year')->get();

        $suggestions = [];
        $seriesSuggestions = [];

        if ($castMember->tmdb_person_id && $tmdb->configured()) {
            $genreMap = Genre::whereNotNull('tmdb_id')->get()->keyBy('tmdb_id');

            // --- ფილმების შემოთავაზება ---
            try {
                // უკვე დამატებული → tmdb_id ⇒ ლოკალური id. სიიდან **არ** ვშლით —
                // დამატების შემდეგ ჩანაწერი უნდა დარჩეს და „დამატებულია"-დ მოინიშნოს
                $ownIds = $movies->whereNotNull('tmdb_id')->pluck('id', 'tmdb_id');
                $cast = $tmdb->personCredits($castMember->tmdb_person_id)['cast'] ?? [];
                usort($cast, fn ($a, $b) => ($b['popularity'] ?? 0) <=> ($a['popularity'] ?? 0));
                $kaTitles = $this->localizedTitles(
                    fn () => $tmdb->personCredits($castMember->tmdb_person_id, 'ka')['cast'] ?? [],
                    'title',
                );

                // TMDB თითო როლზე აბრუნებს ჩანაწერს — ერთი და იგივე ტაიტლი მეორდება;
                // ვტოვებთ პირველს (სია პოპულარობით არის დალაგებული)
                $seen = [];

                foreach ($cast as $c) {
                    if (empty($c['poster_path']) || isset($seen[$c['id']])) {
                        continue;
                    }
                    $seen[$c['id']] = true;
                    $oid = $ownIds[$c['id']] ?? null;
                    $suggestions[] = [
                        'tmdb_id' => $c['id'],
                        'title' => $c['title'] ?? ($c['original_title'] ?? ''),
                        'title_ka' => Lang::georgian($kaTitles[$c['id']] ?? null),
                        'year' => ! empty($c['release_date']) ? (int) substr($c['release_date'], 0, 4) : null,
                        'rating' => isset($c['vote_average']) ? round((float) $c['vote_average'], 1) : null,
                        'poster' => 'https://image.tmdb.org/t/p/w342'.$c['poster_path'],
                        'overview' => $c['overview'] ?? null,
                        'genres' => $this->mapGenres($c['genre_ids'] ?? [], $genreMap),
                        'owned' => $oid !== null,
                        'movie_id' => $oid,
                    ];
                }
            } catch (Throwable $e) {
                $suggestions = [];
            }

            // --- სერიალების შემოთავაზება ---
            try {
                $ownSeriesIds = $series->whereNotNull('tmdb_id')->pluck('id', 'tmdb_id');
                $tvCast = $tmdb->personTvCredits($castMember->tmdb_person_id)['cast'] ?? [];
                usort($tvCast, fn ($a, $b) => ($b['popularity'] ?? 0) <=> ($a['popularity'] ?? 0));
                $kaNames = $this->localizedTitles(
                    fn () => $tmdb->personTvCredits($castMember->tmdb_person_id, 'ka')['cast'] ?? [],
                    'name',
                );

                // სერიალებში დუბლიკატი განსაკუთრებით ხშირია (თითო სეზონი/როლი ცალკე ჩანაწერია)
                $seenSeries = [];

                foreach ($tvCast as $c) {
                    if (empty($c['poster_path']) || isset($seenSeries[$c['id']])) {
                        continue;
                    }
                    $seenSeries[$c['id']] = true;
                    $oid = $ownSeriesIds[$c['id']] ?? null;
                    $seriesSuggestions[] = [
                        'tmdb_id' => $c['id'],
                        'title' => $c['name'] ?? ($c['original_name'] ?? ''),
                        'title_ka' => Lang::georgian($kaNames[$c['id']] ?? null),
                        'year' => ! empty($c['first_air_date']) ? (int) substr($c['first_air_date'], 0, 4) : null,
                        'rating' => isset($c['vote_average']) ? round((float) $c['vote_average'], 1) : null,
                        'poster' => 'https://image.tmdb.org/t/p/w342'.$c['poster_path'],
                        'overview' => $c['overview'] ?? null,
                        'genres' => $this->mapGenres($c['genre_ids'] ?? [], $genreMap),
                        'owned' => $oid !== null,
                        'movie_id' => $oid,
                    ];
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

    /**
     * TMDB-ის ლოკალიზებული (ka) სახელები: tmdb_id ⇒ სახელი.
     * არასავალდებულოა — ჩავარდნაზე ცარიელი მასივი ბრუნდება და მხოლოდ ინგლისური რჩება.
     * Translator-ს (EN→KA) აქ აღარ ვიყენებთ — იხ. DiscoverController-ის კომენტარი.
     */
    private function localizedTitles(callable $fetch, string $key): array
    {
        try {
            $out = [];
            foreach ($fetch() as $c) {
                $out[$c['id']] = $c[$key] ?? null;
            }

            return $out;
        } catch (Throwable $e) {
            return [];
        }
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
