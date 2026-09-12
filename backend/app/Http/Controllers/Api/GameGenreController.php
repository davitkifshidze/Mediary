<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\GameGenreResource;
use App\Models\GameGenre;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * თამაშის ჟანრების მართვა — per-user CRUD + თანმიმდევრობა.
 *
 * ⚠️ განსხვავება წიგნის/ბორდგეიმის ლექსიკონისგან: კავშირი **pivot-ია**
 * (`game_genre_game`), ე.ი. წაშლაზე `move_to` ჟანრს **ამატებს** თამაშებს და
 * არა ცვლის სვეტს — თამაშს სხვა ჟანრებიც აქვს და ისინი უნდა შენარჩუნდეს.
 */
class GameGenreController extends Controller
{
    public function index(Request $request)
    {
        // ლენივი დეფაულტები: ახალი ანგარიშიც და მოგვიანებით ჩართული მოდულიც
        GameGenre::ensureDefaults($request->user()->id);

        return GameGenreResource::collection($this->ordered()->get());
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $genre = GameGenre::create([
            'key' => GameGenre::makeKey($request->user()->id, $data['name_en'] ?: $data['name_ka']),
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? null,
            'sort_order' => (int) GameGenre::max('sort_order') + 1,
        ]);

        return (new GameGenreResource($genre))->response()->setStatusCode(201);
    }

    public function update(Request $request, GameGenre $gameGenre)
    {
        $data = $this->validated($request);

        $gameGenre->fill([
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? $gameGenre->icon,
        ])->save();

        return new GameGenreResource($gameGenre);
    }

    /**
     * წაშლა; `move_to` — რომელ ჟანრზე გადავიდნენ ეს თამაშები.
     *
     * ⚠️ pivot-ზე „გადატანა" = **მიმაგრება** (`syncWithoutDetaching`), თორემ
     * თამაშის დანარჩენი ჟანრები ჩუმად წაიშლებოდა. თვითონ ძველი კავშირი
     * `game_genre_game`-ის cascade-ით ქრება.
     */
    public function destroy(Request $request, GameGenre $gameGenre)
    {
        $data = $request->validate([
            'move_to' => [
                'nullable',
                'integer',
                Rule::exists('game_genres', 'id')->where('user_id', $request->user()->id),
            ],
        ]);

        $moveTo = isset($data['move_to']) && (int) $data['move_to'] !== $gameGenre->id
            ? (int) $data['move_to']
            : null;

        $gameIds = $gameGenre->games()->pluck('games.id')->all();
        $moved = 0;

        if ($moveTo && $gameIds) {
            GameGenre::whereKey($moveTo)->first()?->games()->syncWithoutDetaching($gameIds);
            $moved = count($gameIds);
        }

        $gameGenre->delete();

        return response()->json(['moved' => $moved]);
    }

    /** გადალაგება — მოწოდებული id-ების რიგი ხდება `sort_order` */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => [
                'integer',
                Rule::exists('game_genres', 'id')->where('user_id', $request->user()->id),
            ],
        ]);

        foreach ($data['ids'] as $i => $id) {
            GameGenre::whereKey($id)->update(['sort_order' => $i + 1]);
        }

        return GameGenreResource::collection($this->ordered()->get());
    }

    /* ---------- დამხმარეები ---------- */

    private function ordered()
    {
        return GameGenre::query()->withCount('games')->orderBy('sort_order')->orderBy('id');
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name_ka' => ['required', 'string', 'max:80'],
            'name_en' => ['required', 'string', 'max:80'],
            'icon' => ['nullable', 'string', 'max:60'],
        ]);
    }
}
