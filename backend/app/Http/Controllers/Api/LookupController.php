<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\MediaDomain;
use App\Support\SourceLog;
use Illuminate\Http\Request;
use Throwable;

class LookupController extends Controller
{
    /**
     * `type=movie|series|anime` → შესაბამისი enricher.
     *
     * ⚠️ **რუკა `MediaDomain`-შია** და აქ აღარაა `if`: მესამე დომენის (§7.1)
     * დამატებისას ეს მეთოდი ჩუმად ფილმს დააბრუნებდა და ანიმეს ძებნა
     * ფილმებში წავიდოდა.
     */
    private function enricher(Request $request): object
    {
        return MediaDomain::enricher($request->string('type')->toString());
    }

    /** ლინკი/IMDb/სახელი → კანდიდატების სია (ასარჩევად) */
    public function candidates(Request $request)
    {
        $data = $request->validate([
            'type' => ['nullable', MediaDomain::rule()],
            'url' => ['nullable', 'string'],
            'imdb' => ['nullable', 'string'],
            'query' => ['nullable', 'string'],
        ]);
        unset($data['type']);

        if (! array_filter($data)) {
            return response()->json(['message' => 'lookup_query_required'], 422);
        }

        $enricher = $this->enricher($request);
        if (! $enricher->configured()) {
            return response()->json(['message' => 'tmdb_not_configured'], 503);
        }

        try {
            $list = $enricher->candidates($data);
        } catch (Throwable $e) {
            // SEC-14 — გამონაკლისის ტექსტი კლიენტს არასდრობ პასუხში: Guzzle მას სრულ URL-ს
            // (`?api_key=…`) უწერს. მიზეზი `sources.log`-ში რ჉ება, პასუხში — მანქანური კოდი.
            SourceLog::threw('tmdb', $e);

            return response()->json(['message' => 'tmdb_error'], 502);
        }

        return response()->json(['data' => $list]);
    }

    /** კონკრეტული ერთეულის სრული დრაფტი (tmdb_id ან ლინკი/IMDb/სახელი) */
    public function lookup(Request $request)
    {
        $data = $request->validate([
            'type' => ['nullable', MediaDomain::rule()],
            'tmdb_id' => ['nullable', 'integer'],
            'url' => ['nullable', 'string'],
            'imdb' => ['nullable', 'string'],
            'query' => ['nullable', 'string'],
            'year' => ['nullable', 'integer'],
        ]);
        unset($data['type']);

        if (! array_filter($data)) {
            return response()->json(['message' => 'lookup_query_required'], 422);
        }

        $enricher = $this->enricher($request);
        if (! $enricher->configured()) {
            return response()->json(['message' => 'tmdb_not_configured'], 503);
        }

        try {
            $draft = ! empty($data['tmdb_id'])
                ? $enricher->draftFromId((int) $data['tmdb_id'])
                : $enricher->lookupDraft($data);
        } catch (Throwable $e) {
            // SEC-14 — გამონაკლისის ტექსტი კლიენტს არასდრობ პასუხში: Guzzle მას სრულ URL-ს
            // (`?api_key=…`) უწერს. მიზეზი `sources.log`-ში რ჉ება, პასუხში — მანქანური კოდი.
            SourceLog::threw('tmdb', $e);

            return response()->json(['message' => 'tmdb_error'], 502);
        }

        if (! $draft) {
            return response()->json(['message' => 'tmdb_not_found'], 404);
        }

        return response()->json(['data' => $draft]);
    }
}
