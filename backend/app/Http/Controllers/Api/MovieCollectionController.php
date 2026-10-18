<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Movie;
use App\Services\Tmdb\TmdbClient;
use Throwable;

class MovieCollectionController extends Controller
{
    /** ფილმის ფრანჩაიზის ნაწილები (ყურების თანმიმდევრობით) */
    public function show(Movie $movie, TmdbClient $tmdb)
    {
        if (! $movie->tmdb_id || ! $tmdb->configured()) {
            return response()->json(['name' => null, 'parts' => []]);
        }

        try {
            $details = $tmdb->details($movie->tmdb_id);
            $col = $details['belongs_to_collection'] ?? null;
            if (! $col) {
                return response()->json(['name' => null, 'parts' => []]);
            }

            $data = $tmdb->collection($col['id']);
            $parts = $data['parts'] ?? [];
            usort($parts, fn ($a, $b) => strcmp($a['release_date'] ?? '9999', $b['release_date'] ?? '9999'));

            /* `is_favorite`-იც: უკვე რჩეული ნაწილი ფანჯარაში ჩაკეტილია
               (რჩეულიდან მოხსნა აქედან არ ხდება — მხოლოდ ფილმის გვერდიდან ან ბარათიდან) */
            $ownedByTmdb = Movie::whereNotNull('tmdb_id')->get(['id', 'tmdb_id', 'is_favorite'])->keyBy('tmdb_id');

            $out = [];
            foreach ($parts as $p) {
                if (empty($p['poster_path'])) {
                    continue;
                }
                $own = $ownedByTmdb[$p['id']] ?? null;
                $out[] = [
                    'tmdb_id' => $p['id'],
                    'title' => $p['title'] ?? ($p['original_title'] ?? ''),
                    'year' => ! empty($p['release_date']) ? (int) substr($p['release_date'], 0, 4) : null,
                    'rating' => isset($p['vote_average']) ? round((float) $p['vote_average'], 1) : null,
                    // პოპაპის ორხაზიანი აღწერა
                    'overview' => $p['overview'] ?? null,
                    'poster' => 'https://image.tmdb.org/t/p/w342'.$p['poster_path'],
                    'owned' => $own !== null,
                    'movie_id' => $own?->id,
                    'is_favorite' => (bool) ($own?->is_favorite ?? false),
                ];
            }

            return response()->json(['name' => $data['name'] ?? ($col['name'] ?? null), 'parts' => $out]);
        } catch (Throwable $e) {
            return response()->json(['name' => null, 'parts' => []]);
        }
    }
}
