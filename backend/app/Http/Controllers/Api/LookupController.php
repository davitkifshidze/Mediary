<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Enrichment\MediaTypeHint;
use App\Support\CredentialProviders;
use App\Support\MediaDomain;
use App\Support\MissingCredential;
use App\Support\SourceLog;
use Illuminate\Http\Request;
use Throwable;

class LookupController extends Controller
{
    /**
     * `type=movie|series|anime` → შესაბამისი enricher.
     *
     * ⚠️ **რუკა `MediaDomain`-შია** და აქ აღარაა `if`: მესამე დომენის
     * დამატებისას ეს მეთოდი ჩუმად ფილმს დააბრუნებდა და ანიმეს ძებნა
     * ფილმებში წავიდოდა.
     */
    private function enricher(Request $request): object
    {
        return MediaDomain::enricher($request->string('type')->toString());
    }

    /**
     * ლინკი/IMDb/სახელი → კანდიდატების სია (ასარჩევად).
     *
     * `suggest`: ნაპოვნი სხვა ტიპისაა (სერიალი ფილმის ფორმაში,
     * ფილმი სერიალისაში, იაპონური ანიმაცია — ანიმე) → ფორმა გადასვლას
     * შესთავაზებს და იქ შევსებული დახვდება (`?tmdb=`).
     */
    public function candidates(Request $request, MediaTypeHint $hints)
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
            return MissingCredential::response(CredentialProviders::TMDB);
        }

        try {
            $list = $enricher->candidates($data);
        } catch (Throwable $e) {
            // გამონაკლისის ტექსტი კლიენტს არასდრობ პასუხში: Guzzle მას სრულ URL-ს
            // (`?api_key=…`) უწერს. მიზეზი `sources.log`-ში რ჉ება, პასუხში — მანქანური კოდი.
            SourceLog::threw('tmdb', $e);

            return response()->json(['message' => 'tmdb_error'], 502);
        }

        /* ⚠️ მინიშნების ჩავარდნა სიას არ აფუჭებს — ის დამატებითი ცოდნაა და
           არა ძებნის ნაწილი; მიზეზი `sources.log`-შია */
        $suggest = null;
        try {
            $suggest = $hints->suggest($request->string('type')->toString() ?: 'movie', $data);
        } catch (Throwable $e) {
            SourceLog::threw('tmdb', $e);
        }

        return response()->json(['data' => $list, 'suggest' => $suggest]);
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
            return MissingCredential::response(CredentialProviders::TMDB);
        }

        try {
            $draft = ! empty($data['tmdb_id'])
                ? $enricher->draftFromId((int) $data['tmdb_id'])
                : $enricher->lookupDraft($data);
        } catch (Throwable $e) {
            // გამონაკლისის ტექსტი კლიენტს არასდრობ პასუხში: Guzzle მას სრულ URL-ს
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
