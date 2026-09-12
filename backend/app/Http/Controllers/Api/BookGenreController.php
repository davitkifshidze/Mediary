<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookGenreResource;
use App\Models\Book;
use App\Models\BookGenre;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * წიგნის ჟანრების მართვა — per-user CRUD + თანმიმდევრობა.
 * სტრუქტურა `SongGenreController`-ის იდენტურია (ერთი და იგივე ლექსიკონის
 * შაბლონი); წაშლისას წიგნები **არ იკარგება**: `move_to` ან „ჟანრის გარეშე".
 */
class BookGenreController extends Controller
{
    public function index(Request $request)
    {
        // ლენივი დეფაულტები: ახალი ანგარიშიც და მოგვიანებით ჩართული მოდულიც
        BookGenre::ensureDefaults($request->user()->id);

        return BookGenreResource::collection($this->ordered()->get());
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $genre = BookGenre::create([
            'key' => BookGenre::makeKey($request->user()->id, $data['name_en'] ?: $data['name_ka']),
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? null,
            'sort_order' => (int) BookGenre::max('sort_order') + 1,
        ]);

        return (new BookGenreResource($genre))->response()->setStatusCode(201);
    }

    public function update(Request $request, BookGenre $bookGenre)
    {
        $data = $this->validated($request);

        $bookGenre->fill([
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? $bookGenre->icon,
        ])->save();

        return new BookGenreResource($bookGenre);
    }

    /** წაშლა; `move_to` — რომელ ჟანრზე გადავიდეს ეს წიგნები */
    public function destroy(Request $request, BookGenre $bookGenre)
    {
        $data = $request->validate([
            'move_to' => [
                'nullable',
                'integer',
                Rule::exists('book_genres', 'id')->where('user_id', $request->user()->id),
            ],
        ]);

        $moveTo = isset($data['move_to']) && (int) $data['move_to'] !== $bookGenre->id
            ? (int) $data['move_to']
            : null;

        $moved = Book::where('genre_id', $bookGenre->id)->update(['genre_id' => $moveTo]);

        $bookGenre->delete();

        return response()->json(['moved' => $moved]);
    }

    /** გადალაგება — მოწოდებული id-ების რიგი ხდება `sort_order` */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => [
                'integer',
                Rule::exists('book_genres', 'id')->where('user_id', $request->user()->id),
            ],
        ]);

        foreach ($data['ids'] as $i => $id) {
            BookGenre::whereKey($id)->update(['sort_order' => $i + 1]);
        }

        return BookGenreResource::collection($this->ordered()->get());
    }

    /* ---------- დამხმარეები ---------- */

    private function ordered()
    {
        return BookGenre::query()->withCount('books')->orderBy('sort_order')->orderBy('id');
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
