<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BoardGameGenreResource;
use App\Models\BoardGame;
use App\Models\BoardGameGenre;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * ბორდგეიმის ჟანრების მართვა — per-user CRUD + თანმიმდევრობა.
 * სტრუქტურა `BookGenreController`-ის იდენტურია; წაშლისას თამაშები
 * **არ იკარგება**: `move_to` ან „ჟანრის გარეშე".
 */
class BoardGameGenreController extends Controller
{
    public function index(Request $request)
    {
        // ლენივი დეფაულტები: ახალი ანგარიშიც და მოგვიანებით ჩართული მოდულიც
        BoardGameGenre::ensureDefaults($request->user()->id);

        return BoardGameGenreResource::collection($this->ordered()->get());
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $genre = BoardGameGenre::create([
            'key' => BoardGameGenre::makeKey($request->user()->id, $data['name_en'] ?: $data['name_ka']),
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? null,
            'sort_order' => (int) BoardGameGenre::max('sort_order') + 1,
        ]);

        return (new BoardGameGenreResource($genre))->response()->setStatusCode(201);
    }

    public function update(Request $request, BoardGameGenre $boardGameGenre)
    {
        $data = $this->validated($request);

        $boardGameGenre->fill([
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? $boardGameGenre->icon,
        ])->save();

        return new BoardGameGenreResource($boardGameGenre);
    }

    /** წაშლა; `move_to` — რომელ ჟანრზე გადავიდეს ეს თამაშები */
    public function destroy(Request $request, BoardGameGenre $boardGameGenre)
    {
        $data = $request->validate([
            'move_to' => [
                'nullable',
                'integer',
                Rule::exists('board_game_genres', 'id')->where('user_id', $request->user()->id),
            ],
        ]);

        $moveTo = isset($data['move_to']) && (int) $data['move_to'] !== $boardGameGenre->id
            ? (int) $data['move_to']
            : null;

        $moved = BoardGame::where('genre_id', $boardGameGenre->id)->update(['genre_id' => $moveTo]);

        $boardGameGenre->delete();

        return response()->json(['moved' => $moved]);
    }

    /** გადალაგება — მოწოდებული id-ების რიგი ხდება `sort_order` */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => [
                'integer',
                Rule::exists('board_game_genres', 'id')->where('user_id', $request->user()->id),
            ],
        ]);

        foreach ($data['ids'] as $i => $id) {
            BoardGameGenre::whereKey($id)->update(['sort_order' => $i + 1]);
        }

        return BoardGameGenreResource::collection($this->ordered()->get());
    }

    /* ---------- დამხმარეები ---------- */

    private function ordered()
    {
        return BoardGameGenre::query()->withCount('boardGames')->orderBy('sort_order')->orderBy('id');
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
