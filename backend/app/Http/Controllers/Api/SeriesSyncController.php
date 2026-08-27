<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SeriesResource;
use App\Models\Series;
use App\Services\Enrichment\SeriesEnricher;
use Throwable;

class SeriesSyncController extends Controller
{
    /** არსებული სერიალის TMDB-დან ხელახლა სინქრონი */
    public function resync(Series $series, SeriesEnricher $enricher)
    {
        if (! $enricher->configured()) {
            return response()->json(['message' => 'TMDB_API_KEY არ არის კონფიგურირებული backend/.env-ში.'], 503);
        }

        try {
            $ok = $enricher->enrichSeries($series);
        } catch (Throwable $e) {
            return response()->json(['message' => 'TMDB შეცდომა: '.$e->getMessage()], 502);
        }

        if (! $ok) {
            return response()->json(['message' => 'სერიალი ვერ მოიძებნა TMDB-ზე.'], 404);
        }

        $series->load(['genres', 'cast']);

        return new SeriesResource($series);
    }
}
