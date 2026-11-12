<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AnimeResource;
use App\Http\Resources\MovieResource;
use App\Http\Resources\SeriesResource;
use App\Models\Anime;
use App\Models\Movie;
use App\Models\Series;
use App\Support\Rating;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * **ჩემი ქულა პირდაპირ სიიდან** — `PATCH /{movies|series|anime}/{id}/rating`.
 *
 * ⚠️ ქულა აქამდე მხოლოდ რედაქტირების ფორმიდან იცვლებოდა: ნანახი ფილმის შესაფასებლად
 * მთელი ფორმა იხსნებოდა. ეს ერთი ველის ჩაწერაა — ისეთივე, როგორიც სტატუსისა და
 * რჩეულის გადართვა; სამივე მოდულს ერთი წესი აქვს (`rate()`), ცალკეა მხოლოდ
 * მარშრუტზე მიბმული მოდელი და პასუხის რესურსი.
 *
 * ⚠️ `my_rating` **სავალდებულოდ მოდის**: `null` ქულის წაშლაა, გასაღების გარეშე
 * მოთხოვნა კი შეცდომა — თორემ ცარიელი PATCH ქულას ჩუმად წაშლიდა.
 */
class MediaRatingController extends Controller
{
    public function movie(Request $request, Movie $movie)
    {
        $this->rate($request, $movie);
        Movie::annotateFranchise([$movie]);

        return new MovieResource($movie);
    }

    public function series(Request $request, Series $series)
    {
        $this->rate($request, $series);

        return new SeriesResource($series);
    }

    public function anime(Request $request, Anime $anime)
    {
        $this->rate($request, $anime);

        return new AnimeResource($anime);
    }

    /** ქულის ჩაწერა; მეათედამდე დამრგვალებასა და 0-ის `null`-ად ქცევას `RatingCast` აკეთებს */
    private function rate(Request $request, Model $record): void
    {
        $data = $request->validate([
            'my_rating' => ['present', ...Rating::rules()],
        ]);

        $record->my_rating = $data['my_rating'];
        $record->save();

        $record->load(['genres', 'cast']);
    }
}
