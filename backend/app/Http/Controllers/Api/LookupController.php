<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Enrichment\MovieEnricher;
use App\Services\Enrichment\SeriesEnricher;
use Illuminate\Http\Request;
use Throwable;

class LookupController extends Controller
{
    public function __construct(
        private MovieEnricher $movieEnricher,
        private SeriesEnricher $seriesEnricher,
    ) {}

    /** type=movie|series → შესაბამისი enricher */
    private function enricher(Request $request): MovieEnricher|SeriesEnricher
    {
        return $request->string('type')->toString() === 'series'
            ? $this->seriesEnricher
            : $this->movieEnricher;
    }

    /** ლინკი/IMDb/სახელი → კანდიდატების სია (ასარჩევად) */
    public function candidates(Request $request)
    {
        $data = $request->validate([
            'type' => ['nullable', 'in:movie,series'],
            'url' => ['nullable', 'string'],
            'imdb' => ['nullable', 'string'],
            'query' => ['nullable', 'string'],
        ]);
        unset($data['type']);

        if (! array_filter($data)) {
            return response()->json(['message' => 'მიუთითე ლინკი, IMDb ID ან სახელი.'], 422);
        }

        $enricher = $this->enricher($request);
        if (! $enricher->configured()) {
            return response()->json(['message' => 'TMDB_API_KEY არ არის კონფიგურირებული backend/.env-ში.'], 503);
        }

        try {
            $list = $enricher->candidates($data);
        } catch (Throwable $e) {
            return response()->json(['message' => 'TMDB შეცდომა: '.$e->getMessage()], 502);
        }

        return response()->json(['data' => $list]);
    }

    /** კონკრეტული ერთეულის სრული დრაფტი (tmdb_id ან ლინკი/IMDb/სახელი) */
    public function lookup(Request $request)
    {
        $data = $request->validate([
            'type' => ['nullable', 'in:movie,series'],
            'tmdb_id' => ['nullable', 'integer'],
            'url' => ['nullable', 'string'],
            'imdb' => ['nullable', 'string'],
            'query' => ['nullable', 'string'],
            'year' => ['nullable', 'integer'],
        ]);
        unset($data['type']);

        if (! array_filter($data)) {
            return response()->json(['message' => 'მიუთითე ლინკი, IMDb ID ან სახელი.'], 422);
        }

        $enricher = $this->enricher($request);
        if (! $enricher->configured()) {
            return response()->json(['message' => 'TMDB_API_KEY არ არის კონფიგურირებული backend/.env-ში.'], 503);
        }

        try {
            $draft = ! empty($data['tmdb_id'])
                ? $enricher->draftFromId((int) $data['tmdb_id'])
                : $enricher->lookupDraft($data);
        } catch (Throwable $e) {
            return response()->json(['message' => 'TMDB შეცდომა: '.$e->getMessage()], 502);
        }

        if (! $draft) {
            return response()->json(['message' => 'ვერ მოიძებნა TMDB-ზე.'], 404);
        }

        return response()->json(['data' => $draft]);
    }
}
