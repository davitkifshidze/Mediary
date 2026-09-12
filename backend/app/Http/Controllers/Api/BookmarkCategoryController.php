<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookmarkCategoryResource;
use App\Models\Bookmark;
use App\Models\BookmarkCategory;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * ბუკმარკის კატეგორიების მართვა — per-user CRUD + თანმიმდევრობა.
 * სტრუქტურა `NoteCategoryController`-ის იდენტურია (ერთი და იგივე ლექსიკონის
 * შაბლონი), წაშლისას ბუკმარკები **არ იკარგება**: `move_to` ან „კატეგორიის გარეშე".
 *
 * ⚠️ კავშირი **სვეტია** (`bookmarks.category_id`) და არა pivot, ე.ი. „გადატანა"
 * მართლა სვეტის შეცვლაა — განსხვავებით სიმღერისა/თამაშისგან, სადაც
 * `syncWithoutDetaching` სჭირდება, რომ დანარჩენი ჟანრები გადარჩეს.
 */
class BookmarkCategoryController extends Controller
{
    public function index(Request $request)
    {
        // ლენივი დეფაულტები: ახალი ანგარიშიც და მოგვიანებით ჩართული მოდულიც
        BookmarkCategory::ensureDefaults($request->user()->id);

        return BookmarkCategoryResource::collection($this->ordered()->get());
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $category = BookmarkCategory::create([
            'key' => BookmarkCategory::makeKey($request->user()->id, $data['name_en'] ?: $data['name_ka']),
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? null,
            'sort_order' => (int) BookmarkCategory::max('sort_order') + 1,
        ]);

        return (new BookmarkCategoryResource($category))->response()->setStatusCode(201);
    }

    public function update(Request $request, BookmarkCategory $bookmarkCategory)
    {
        $data = $this->validated($request);

        $bookmarkCategory->fill([
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? $bookmarkCategory->icon,
        ])->save();

        return new BookmarkCategoryResource($bookmarkCategory);
    }

    /** წაშლა; `move_to` — რომელ კატეგორიაზე გადავიდნენ ეს ბუკმარკები */
    public function destroy(Request $request, BookmarkCategory $bookmarkCategory)
    {
        $data = $request->validate([
            'move_to' => [
                'nullable',
                'integer',
                Rule::exists('bookmark_categories', 'id')->where('user_id', $request->user()->id),
            ],
        ]);

        $moveTo = isset($data['move_to']) && (int) $data['move_to'] !== $bookmarkCategory->id
            ? (int) $data['move_to']
            : null;

        $moved = Bookmark::where('category_id', $bookmarkCategory->id)
            ->update(['category_id' => $moveTo]);

        $bookmarkCategory->delete();

        return response()->json(['moved' => $moved]);
    }

    /** გადალაგება — მოწოდებული id-ების რიგი ხდება `sort_order` */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => [
                'integer',
                Rule::exists('bookmark_categories', 'id')->where('user_id', $request->user()->id),
            ],
        ]);

        foreach ($data['ids'] as $i => $id) {
            BookmarkCategory::whereKey($id)->update(['sort_order' => $i + 1]);
        }

        return BookmarkCategoryResource::collection($this->ordered()->get());
    }

    /* ---------- დამხმარეები ---------- */

    private function ordered()
    {
        return BookmarkCategory::query()->withCount('bookmarks')->orderBy('sort_order')->orderBy('id');
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
