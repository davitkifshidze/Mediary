<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AnimeResource;
use App\Models\Anime;
use App\Services\Enrichment\AnimeEnricher;
use Throwable;

class AnimeSyncController extends Controller
{
    /** არსებული ანიმეს TMDB-დან ხელახლა სინქრონი */
    public function resync(Anime $anime, AnimeEnricher $enricher)
    {
        if (! $enricher->configured()) {
            return response()->json(['message' => 'TMDB_API_KEY არ არის კონფიგურირებული backend/.env-ში.'], 503);
        }

        try {
            $ok = $enricher->enrichAnime($anime);
        } catch (Throwable $e) {
            return response()->json(['message' => 'TMDB შეცდომა: '.$e->getMessage()], 502);
        }

        if (! $ok) {
            return response()->json(['message' => 'ანიმე ვერ მოიძებნა TMDB-ზე.'], 404);
        }

        $anime->load(['genres', 'cast']);

        return new AnimeResource($anime);
    }
}
