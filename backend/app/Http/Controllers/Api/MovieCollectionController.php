<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FranchisePart;
use App\Models\FranchiseReminder;
use App\Models\Movie;
use App\Services\Media\FranchiseTracker;
use App\Services\Tmdb\TmdbClient;
use App\Support\AppTime;
use App\Support\SourceLog;
use Illuminate\Http\Request;
use Throwable;

/**
 * **ფილმის ფრანჩაიზი** — ნაწილები ყურების რიგით და შეხსენების გადამრთველი.
 *
 * ⚠️ ნაწილებს `franchise_parts` ცხრილი აწვდის (`FranchiseTracker`) და არა ყოველ
 * გახსნაზე TMDB: გვერდი გასაღების გარეშეც იხატება, გამოუსვლელი (უპოსტერო) ნაწილიც
 * ჩანს — ადრე ის იჭრებოდა და „გამოცხადდა მესამე ნაწილი" ვერსად ჩანდა. TMDB-ს მხოლოდ
 * მაშინ ვეკითხებით, როცა ცხრილი ცარიელია ან მონაცემი დღეზე ძველია.
 */
class MovieCollectionController extends Controller
{
    /** გვერდის გახსნა ფრანჩაიზს დღეში ერთხელ ამოწმებს — დანარჩენს ღამის ბრძანება აკეთებს */
    private const FRESH_MINUTES = 60 * 24;

    private const EMPTY = ['collection_id' => null, 'name' => null, 'muted' => false, 'parts' => []];

    /** ფილმის ფრანჩაიზის ნაწილები (ყურების თანმიმდევრობით) */
    public function show(Request $request, Movie $movie, TmdbClient $tmdb, FranchiseTracker $tracker)
    {
        $collection = $this->collectionOf($movie, $tmdb);

        if (! $collection) {
            return response()->json(self::EMPTY);
        }

        try {
            $tracker->refresh($collection, self::FRESH_MINUTES);
        } catch (Throwable $e) {
            // TMDB მიუწვდომელია — რაც ცხრილშია, იმას ვაჩვენებთ
            SourceLog::threw('tmdb', $e, ['step' => 'franchise', 'collection' => $collection]);
        }

        $parts = $tracker->parts($collection);

        if ($parts->isEmpty()) {
            return response()->json(self::EMPTY);
        }

        $user = $request->user();
        /* `is_favorite`-იც: უკვე რჩეული ნაწილი ფანჯარაში ჩაკეტილია
           (რჩეულიდან მოხსნა აქედან არ ხდება — მხოლოდ ფილმის გვერდიდან ან ბარათიდან) */
        $owned = Movie::whereNotNull('tmdb_id')->get(['id', 'tmdb_id', 'is_favorite'])->keyBy('tmdb_id');
        $mutedParts = FranchiseReminder::where('user_id', $user->id)
            ->where('tmdb_collection_id', $collection)
            ->whereNotNull('muted_at')
            ->pluck('tmdb_id')
            ->flip();
        $today = AppTime::now()->format('Y-m-d');

        return response()->json([
            'collection_id' => $collection,
            'name' => $parts->first()->collection_name ?? $movie->collection_name,
            // მთელი ფრანჩაიზი გაჩუმებულია — ახალ ნაწილზე შეტყობინება არ მოდის
            'muted' => $mutedParts->has(FranchiseReminder::WHOLE),
            'parts' => $parts->map(function (FranchisePart $part) use ($owned, $mutedParts, $today) {
                $own = $owned[$part->tmdb_id] ?? null;
                $date = $part->release_date?->format('Y-m-d');

                return [
                    'tmdb_id' => $part->tmdb_id,
                    'title' => $part->title,
                    'year' => $part->year(),
                    'date' => $date,
                    // ჯერ არ გამოსულა (ან თარიღი საერთოდ არ არის — მხოლოდ გამოცხადდა)
                    'released' => $date !== null && $date <= $today,
                    'rating' => $part->rating !== null ? (float) $part->rating : null,
                    // პოპაპის ორხაზიანი აღწერა
                    'overview' => $part->overview,
                    'poster' => $part->posterUrl(),
                    'owned' => $own !== null,
                    'movie_id' => $own?->id,
                    'is_favorite' => (bool) ($own?->is_favorite ?? false),
                    'muted' => $mutedParts->has($part->tmdb_id),
                ];
            })->values(),
        ]);
    }

    /**
     * „აღარ შემახსენო" / „ისევ შემახსენე" — მთელ ფრანჩაიზზე ან ერთ ნაწილზე (`tmdb_id`).
     *
     * ⚠️ ფრანჩაიზი მისამართში TMDB-ის id-ია და არა ჩანაწერი: შეხსენება ფრანჩაიზზეა,
     * რომლის ნაწილი შეიძლება ჯერ არც მქონდეს. რიგი ყოველთვის ჩემია (`user_id`).
     */
    public function remind(Request $request, int $collection, FranchiseTracker $tracker)
    {
        $data = $request->validate([
            'muted' => ['required', 'boolean'],
            'tmdb_id' => ['nullable', 'integer', 'min:1'],
        ]);

        $tracker->mute(
            $request->user(),
            $collection,
            (int) ($data['tmdb_id'] ?? FranchiseReminder::WHOLE),
            (bool) $data['muted'],
        );

        return response()->json(['muted' => (bool) $data['muted']]);
    }

    /**
     * ფილმის ფრანჩაიზის id. ჩანაწერზე ის დამატებისას და სინქრონიზაციისას იწერება; ძველ,
     * ჯერ დაუსინქრონებელ ჩანაწერზე TMDB-ს ერთხელ ვეკითხებით და ვიმახსოვრებთ.
     */
    private function collectionOf(Movie $movie, TmdbClient $tmdb): ?int
    {
        if ($movie->tmdb_collection_id) {
            return (int) $movie->tmdb_collection_id;
        }

        if (! $movie->tmdb_id || ! $tmdb->configured()) {
            return null;
        }

        try {
            $collection = $tmdb->details($movie->tmdb_id)['belongs_to_collection'] ?? null;
        } catch (Throwable $e) {
            SourceLog::threw('tmdb', $e, ['step' => 'franchise', 'id' => $movie->tmdb_id]);

            return null;
        }

        if (empty($collection['id'])) {
            return null;
        }

        $movie->tmdb_collection_id = (int) $collection['id'];
        $movie->collection_name = $collection['name'] ?? null;
        // ⚠️ უხმოდ: ეს TMDB-ის ფაქტის დამახსოვრებაა და არა ჩანაწერის რედაქტირება
        $movie->saveQuietly();

        return (int) $collection['id'];
    }
}
