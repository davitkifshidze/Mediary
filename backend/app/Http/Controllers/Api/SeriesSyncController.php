<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SeriesResource;
use App\Models\Series;
use App\Services\Enrichment\SeriesEnricher;
use App\Support\SourceLog;
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
            // SEC-14 — გამონაკლისის ტექსტი კლიენტს არასდრობ პასუხში: Guzzle მას სრულ URL-ს
            // (`?api_key=…`) უწერს. მიზეზი `sources.log`-ში რ჉ება, პასუხში — მანქანური კოდი.
            SourceLog::threw('tmdb', $e);

            return response()->json(['message' => 'tmdb_error'], 502);
        }

        if (! $ok) {
            return response()->json(['message' => 'სერიალი ვერ მოიძებნა TMDB-ზე.'], 404);
        }

        $series->load(['genres', 'cast']);

        return new SeriesResource($series);
    }
}
