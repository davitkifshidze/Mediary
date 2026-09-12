<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AnimeListResource;
use App\Http\Resources\GenreResource;
use App\Http\Resources\MovieListResource;
use App\Http\Resources\SeriesListResource;
use App\Models\Genre;
use App\Models\Series;
use App\Support\MediaDomain;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * ჟანრზე მიბმული ჩანაწერების მართვა (Tasks C1/C2).
 * ჟანრები გაზიარებულია დომენებს შორის (polymorphic `genreables`), ამიტომ
 * ყველა ოპერაცია `type`-ით პარამეტრიზებულია.
 *
 * ⚠️ **დომენების სია `MediaDomain`-შია** (§7.1) და აქ აღარაა ჩამოწერილი:
 * მესამე დომენის დამატებისას პასუხს ერთი bucket დააკლდებოდა და გვერდი
 * მას ჩუმად არ აჩვენებდა.
 */
class GenreItemController extends Controller
{
    /** დომენი → `Genre`-ის რელაციის სახელი (`series` მხოლობითი რჩება) */
    private const RELATIONS = [
        'movie' => 'movies',
        'series' => 'series',
        'anime' => 'animes',
    ];

    /** დომენი → პასუხის გასაღები. ⚠️ ფრონტი სწორედ ამ სახელებს კითხულობს */
    private const BUCKETS = [
        'movie' => 'movies',
        'series' => 'series',
        'anime' => 'animes',
    ];

    /** @var array<string, class-string> */
    private const RESOURCES = [
        'movie' => MovieListResource::class,
        'series' => SeriesListResource::class,
        'anime' => AnimeListResource::class,
    ];

    private function relation(Genre $genre, string $type)
    {
        return $genre->{self::RELATIONS[$type] ?? 'movies'}();
    }

    /** ჟანრზე მიბმული ჩანაწერები — ორივე დომენი ერთ პასუხში */
    public function index(Genre $genre)
    {
        $out = [];

        foreach (MediaDomain::TYPES as $type) {
            $rows = $this->relation($genre, $type)->with('genres')->orderByDesc('year')->get();
            $key = self::BUCKETS[$type];

            $out[$key] = self::RESOURCES[$type]::collection($rows);
            $out[$key.'_count'] = $rows->count();
        }

        return response()->json($out);
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
            'type' => ['required', MediaDomain::rule()],
            'action' => ['required', 'in:attach,detach,move,replace'],
            'ids' => ['nullable', 'array'],
            'ids.*' => ['integer'],
            'all' => ['nullable', 'boolean'],
            'target_genre_id' => ['nullable', 'integer'],
        ]);

        $type = $data['type'];
        $model = MediaDomain::model($type);
        $table = (new $model)->getTable();
        $rel = fn (Genre $g) => $this->relation($g, $type);

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
            'genre' => new GenreResource($genre->loadCount(array_values(self::RELATIONS))),
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
