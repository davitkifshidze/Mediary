<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\GenreResource;
use App\Http\Resources\MovieListResource;
use App\Http\Resources\SeriesListResource;
use App\Models\Genre;
use App\Models\Movie;
use App\Models\Series;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * ჟანრზე მიბმული ჩანაწერების მართვა (Tasks C1/C2).
 * ჟანრები გაზიარებულია დომენებს შორის (polymorphic `genreables`), ამიტომ
 * ყველა ოპერაცია `type=movie|series`-ით პარამეტრიზებულია.
 */
class GenreItemController extends Controller
{
    /** ჟანრზე მიბმული ჩანაწერები — ორივე დომენი ერთ პასუხში */
    public function index(Genre $genre)
    {
        $movies = $genre->movies()->with('genres')->orderByDesc('year')->get();
        $series = $genre->series()->with('genres')->orderByDesc('year')->get();

        return response()->json([
            'movies' => MovieListResource::collection($movies),
            'series' => SeriesListResource::collection($series),
            'movies_count' => $movies->count(),
            'series_count' => $series->count(),
        ]);
    }

    /**
     * მიბმის ცვლილება არჩეულ (ან ყველა) ჩანაწერზე:
     *   attach  — ჟანრის მიბმა (C2: ერთი/რამდენიმე/ყველა);
     *   detach  — ჟანრის ჩახსნა;
     *   move    — ჟანრი მოეხსნება და დაემატება `target_genre_id` (სხვა ჟანრები რჩება);
     *   replace — ჩანაწერის **ყველა** ჟანრი ჩაანაცვლდება `target_genre_id`-ით.
     */
    public function update(Request $request, Genre $genre)
    {
        $data = $request->validate([
            'type' => ['required', 'in:movie,series'],
            'action' => ['required', 'in:attach,detach,move,replace'],
            'ids' => ['nullable', 'array'],
            'ids.*' => ['integer'],
            'all' => ['nullable', 'boolean'],
            'target_genre_id' => ['nullable', 'integer'],
        ]);

        $isSeries = $data['type'] === 'series';
        $model = $isSeries ? Series::class : Movie::class;
        $table = (new $model)->getTable();
        $rel = fn (Genre $g) => $isSeries ? $g->series() : $g->movies();

        $ids = $this->resolveIds($request, $data, $genre, $model, $table, $rel);

        $target = null;
        if (in_array($data['action'], ['move', 'replace'], true)) {
            $target = Genre::where('id', $data['target_genre_id'] ?? 0)
                ->where('id', '!=', $genre->id)
                ->first();
            if (! $target) {
                return response()->json(['message' => 'invalid_target_genre'], 422);
            }
        }

        if ($ids) {
            DB::transaction(function () use ($data, $genre, $target, $ids, $model, $rel) {
                if ($data['action'] === 'attach') {
                    $rel($genre)->syncWithoutDetaching($ids);
                } elseif ($data['action'] === 'detach') {
                    $rel($genre)->detach($ids);
                } elseif ($data['action'] === 'move') {
                    $rel($target)->syncWithoutDetaching($ids);
                    $rel($genre)->detach($ids);
                } else {
                    // replace — sync() ჩანაწერის დანარჩენ ჟანრებსაც ხსნის, ეს განზრახაა
                    $model::whereIn('id', $ids)->get()
                        ->each(fn ($item) => $item->genres()->sync([$target->id]));
                }
            });
        }

        return response()->json([
            'affected' => count($ids),
            'genre' => new GenreResource($genre->loadCount(['movies', 'series'])),
        ]);
    }

    /**
     * დასამუშავებელი id-ები. `all=1`:
     *   attach-ზე — ბიბლიოთეკის ყველა ჩანაწერი, დანარჩენზე — ჟანრზე მიბმული ყველა.
     * არსებულ id-ებზე ვფილტრავთ, რომ არარსებულმა ჩანაწერმა pivot არ დატოვოს.
     */
    private function resolveIds(Request $request, array $data, Genre $genre, string $model, string $table, callable $rel): array
    {
        if ($request->boolean('all')) {
            return $data['action'] === 'attach'
                ? $model::query()->pluck('id')->all()
                : $rel($genre)->pluck($table.'.id')->all();
        }

        $ids = array_map('intval', $data['ids'] ?? []);

        return $ids ? $model::whereIn('id', $ids)->pluck('id')->all() : [];
    }
}
