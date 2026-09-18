<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\MovieResource;
use App\Models\Movie;
use App\Services\Enrichment\MovieEnricher;
use App\Support\SourceLog;
use Throwable;

class MovieSyncController extends Controller
{
    /** არსებული ფილმის TMDB-დან ხელახლა სინქრონი */
    public function resync(Movie $movie, MovieEnricher $enricher)
    {
        if (! $enricher->configured()) {
            return response()->json(['message' => 'TMDB_API_KEY არ არის კონფიგურირებული backend/.env-ში.'], 503);
        }

        try {
            $ok = $enricher->enrichMovie($movie);
        } catch (Throwable $e) {
            // SEC-14 — გამონაკლისის ტექსტი კლიენტს არასდრობ პასუხში: Guzzle მას სრულ URL-ს
            // (`?api_key=…`) უწერს. მიზეზი `sources.log`-ში რ჉ება, პასუხში — მანქანური კოდი.
            SourceLog::threw('tmdb', $e);

            return response()->json(['message' => 'tmdb_error'], 502);
        }

        if (! $ok) {
            return response()->json(['message' => 'ფილმი ვერ მოიძებნა TMDB-ზე.'], 404);
        }

        $movie->load(['genres', 'cast']);

        return new MovieResource($movie);
    }
}
