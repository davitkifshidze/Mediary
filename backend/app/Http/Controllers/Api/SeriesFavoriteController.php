<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SeriesResource;
use App\Models\Series;
use Illuminate\Http\Request;

class SeriesFavoriteController extends Controller
{
    /** რჩეულის ტოგლი (ან პირდაპირ დაყენება is_favorite-ით) */
    public function update(Request $request, Series $series)
    {
        $series->is_favorite = $request->has('is_favorite')
            ? $request->boolean('is_favorite')
            : ! $series->is_favorite;
        $series->save();

        $series->load(['genres', 'cast']);

        return new SeriesResource($series);
    }
}
