<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\MovieResource;
use App\Models\Movie;
use Illuminate\Http\Request;

class MovieFavoriteController extends Controller
{
    /**
     * რჩეულის ტოგლი (ან პირდაპირ დაყენება `is_favorite`-ით).
     *
     * Tasks §18.2 — ⚠️ **ჩუმი გავრცელება ფრანჩაიზზე აღარ არის.** აქამდე ფილმის
     * რჩეულში ჩასმა იმავე კოლექციის ყველა ნანახ-არა ნაწილს უკითხავად აფერადებდა.
     * ახლა დანარჩენი ნაწილები მხოლოდ **ცხადად ჩამოთვლილი** `parts[]`-ით ხდება
     * რჩეული — ეს პოპაპის არჩევანია („მთელი ფრანჩაიზი", ჩექბოქსებით). უცხო id
     * (სხვა კოლექცია, სხვისი ჩანაწერი — მას `owner` scope ისედაც არ ხედავს)
     * ჩუმად ვარდება. **მოხსნა მხოლოდ ამ ფილმს ეხება** — `parts` მაშინ იგნორირდება.
     */
    public function update(Request $request, Movie $movie)
    {
        $data = $request->validate([
            'is_favorite' => ['nullable', 'boolean'],
            'parts' => ['nullable', 'array', 'max:50'],
            'parts.*' => ['integer'],
        ]);

        $movie->is_favorite = $request->has('is_favorite')
            ? $request->boolean('is_favorite')
            : ! $movie->is_favorite;
        $movie->save();

        $parts = array_values(array_unique(array_map('intval', $data['parts'] ?? [])));

        if ($movie->is_favorite && $parts && $movie->tmdb_collection_id) {
            Movie::where('tmdb_collection_id', $movie->tmdb_collection_id)
                ->whereKey($parts)
                ->whereKeyNot($movie->getKey())
                ->update(['is_favorite' => true]);
        }

        $movie->load(['genres', 'cast']);
        Movie::annotateFranchise([$movie]);

        return new MovieResource($movie);
    }
}
