<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AnimeResource;
use App\Models\Anime;
use Illuminate\Http\Request;

class AnimeFavoriteController extends Controller
{
    /** რჩეულის ტოგლი (ან პირდაპირ დაყენება is_favorite-ით) */
    public function update(Request $request, Anime $anime)
    {
        $anime->is_favorite = $request->has('is_favorite')
            ? $request->boolean('is_favorite')
            : ! $anime->is_favorite;
        $anime->save();

        $anime->load(['genres', 'cast']);

        return new AnimeResource($anime);
    }
}
