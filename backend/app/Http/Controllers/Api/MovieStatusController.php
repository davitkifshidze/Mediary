<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\MovieResource;
use App\Models\Movie;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MovieStatusController extends Controller
{
    public function update(Request $request, Movie $movie)
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['undecided', 'to_watch', 'watching', 'watched'])],
        ]);

        $movie->status = $data['status'];
        $movie->watched_at = $data['status'] === 'watched' ? ($movie->watched_at ?? now()) : null;
        $movie->save();

        // ფრანჩაიზის propagation: მხოლოდ „საყურებელში“ გადასვლისას — მიმდინარე/ნანახ ნაწილებს არ ეხება.
        // „ვუყურებ“/„ნანახი“ არ ვრცელდება (siblings badge-ს იღებენ, სტატუსი უცვლელი).
        if ($data['status'] === 'to_watch' && $movie->tmdb_collection_id) {
            Movie::where('tmdb_collection_id', $movie->tmdb_collection_id)
                ->where('id', '!=', $movie->id)
                ->whereNotIn('status', ['watching', 'watched'])
                ->update(['status' => 'to_watch', 'watched_at' => null]);
        }

        $movie->load(['genres', 'cast']);
        Movie::annotateFranchise([$movie]);

        return new MovieResource($movie);
    }

    /** მასობრივი სტატუსის შეცვლა — ან კონკრეტული ids, ან from_status-ის მქონე ყველა ფილმი. */
    public function bulkUpdate(Request $request)
    {
        $statuses = ['undecided', 'to_watch', 'watching', 'watched'];

        $data = $request->validate([
            'status' => ['required', Rule::in($statuses)],
            'ids' => ['array'],
            'ids.*' => ['integer'],
            'from_status' => [Rule::in($statuses)],
        ]);

        $query = Movie::query();
        if (! empty($data['ids'])) {
            $query->whereIn('id', $data['ids']);
        } elseif (! empty($data['from_status'])) {
            $query->where('status', $data['from_status']);
        } else {
            return response()->json(['message' => 'აირჩიე ფილმები ან საწყისი სტატუსი.'], 422);
        }

        $target = $data['status'];
        $updated = 0;
        foreach ($query->get() as $movie) {
            $movie->status = $target;
            $movie->watched_at = $target === 'watched' ? ($movie->watched_at ?? now()) : null;
            $movie->save();
            $updated++;
        }

        return response()->json(['updated' => $updated]);
    }
}
