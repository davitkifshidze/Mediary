<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\MovieResource;
use App\Models\Movie;
use Illuminate\Http\Request;

class MovieFavoriteController extends Controller
{
    /** რჩეულის ტოგლი (ან პირდაპირ დაყენება is_favorite-ით) */
    public function update(Request $request, Movie $movie)
    {
        $movie->is_favorite = $request->has('is_favorite')
            ? $request->boolean('is_favorite')
            : ! $movie->is_favorite;
        $movie->save();

        // ფრანჩაიზის propagation: მხოლოდ რჩეულში დამატებისას — ნანახ ნაწილებს არ ეხება.
        if ($movie->is_favorite && $movie->tmdb_collection_id) {
            Movie::where('tmdb_collection_id', $movie->tmdb_collection_id)
                ->where('id', '!=', $movie->id)
                // §6.4 — „ნანახი" per-user სახელია; მნიშვნელობას მხოლოდ `role` ატარებს
                ->whereDoesntHave('status', fn ($q) => $q->where('role', 'done'))
                ->update(['is_favorite' => true]);
        }

        $movie->load(['genres', 'cast']);
        Movie::annotateFranchise([$movie]);

        return new MovieResource($movie);
    }
}
