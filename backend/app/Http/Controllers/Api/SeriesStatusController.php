<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SeriesResource;
use App\Models\Series;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SeriesStatusController extends Controller
{
    public function update(Request $request, Series $series)
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['undecided', 'to_watch', 'watching', 'watched'])],
        ]);

        $series->status = $data['status'];
        $series->watched_at = $data['status'] === 'watched' ? ($series->watched_at ?? now()) : null;
        $series->save();

        $series->load(['genres', 'cast']);

        return new SeriesResource($series);
    }

    /** მასობრივი სტატუსის შეცვლა — ან კონკრეტული ids, ან from_status-ის მქონე ყველა სერიალი. */
    public function bulkUpdate(Request $request)
    {
        $statuses = ['undecided', 'to_watch', 'watching', 'watched'];

        $data = $request->validate([
            'status' => ['required', Rule::in($statuses)],
            'ids' => ['array'],
            'ids.*' => ['integer'],
            'from_status' => [Rule::in($statuses)],
        ]);

        $query = Series::query();
        if (! empty($data['ids'])) {
            $query->whereIn('id', $data['ids']);
        } elseif (! empty($data['from_status'])) {
            $query->where('status', $data['from_status']);
        } else {
            return response()->json(['message' => 'აირჩიე სერიალები ან საწყისი სტატუსი.'], 422);
        }

        $target = $data['status'];
        $updated = 0;
        foreach ($query->get() as $series) {
            $series->status = $target;
            $series->watched_at = $target === 'watched' ? ($series->watched_at ?? now()) : null;
            $series->save();
            $updated++;
        }

        return response()->json(['updated' => $updated]);
    }
}
