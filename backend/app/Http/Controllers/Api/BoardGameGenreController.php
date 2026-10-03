<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BoardGameGenreResource;
use App\Models\BoardGame;
use App\Models\BoardGameGenre;
use App\Support\DictionaryColor;
use App\Support\DictionaryRecords;
use App\Support\DictionaryTrash;
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
            'color' => $data['color'] ?? null,
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
            // Tasks §24.3 — ⚠️ `array_key_exists`: ფერის მოხსნა (`null`) ცხადი არჩევანია
            'color' => array_key_exists('color', $data) ? $data['color'] : $boardGameGenre->color,
        ])->save();

        return new BoardGameGenreResource($boardGameGenre);
    }

    /** წაშლა; `move_to` — რომელ ჟანრზე გადავიდეს ეს თამაშები */
    public function destroy(Request $request, BoardGameGenre $boardGameGenre)
    {
        $data = $request->validate(
            DictionaryRecords::rules(
                $request,
                Rule::exists('board_game_genres', 'id')->whereNull('trashed_at')->where('user_id', $request->user()->id),
                $boardGameGenre->id,
            ),
            DictionaryRecords::messages(),
        );

        // ეტაპი 8 — ჩანაწერებიც „იშლება“ — Tasks §29.8-ის შემდეგ **მფლობელის ურნაში**, მოდელის გავლით
        if ($request->boolean('delete_records')) {
            $deleted = DictionaryRecords::trash(BoardGame::where('genre_id', $boardGameGenre->id));
            DictionaryTrash::trash($boardGameGenre, 'board_game_genre');

            return response()->json(['moved' => 0, 'deleted' => $deleted]);
        }

        $moveTo = DictionaryRecords::moveTarget($data);

        /* ⚠️ **ურნა (Tasks §29, ეტაპი 3)** — რიგი ურნაში გადადის და იმახსოვრებს,
           რომელი ჩანაწერები გადაიტანა ამ წაშლამ: აღდგენა მათ დაბრუნებას
           შემოგთავაზებს (`DictionaryTrash`). ids **გადატანამდე** იკითხება. */
        $records = BoardGame::where('genre_id', $boardGameGenre->id);
        $ids = (clone $records)->pluck('id')->all();

        $moved = DictionaryRecords::move($records, fn ($game) => $game->genre_id = $moveTo);

        DictionaryTrash::trash($boardGameGenre, 'board_game_genre', $ids, $moveTo);

        return response()->json(['moved' => $moved, 'deleted' => 0]);
    }

    /** გადალაგება — მოწოდებული id-ების რიგი ხდება `sort_order` */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => [
                'integer',
                Rule::exists('board_game_genres', 'id')->whereNull('trashed_at')->where('user_id', $request->user()->id),
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
            'color' => DictionaryColor::RULE,
        ]);
    }
}
