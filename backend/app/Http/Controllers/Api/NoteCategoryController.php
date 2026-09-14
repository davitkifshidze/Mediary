<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\NoteCategoryResource;
use App\Models\NoteCategory;
use App\Models\NoteEntry;
use App\Support\DictionaryRecords;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * ჩანაწერების კატეგორიები — per-user CRUD + თანმიმდევრობა (Tasks §13.1).
 * სტრუქტურა `BoardGameGenreController`-ის იდენტურია; წაშლისას ჩანაწერები
 * **არ იკარგება**: `move_to` ან „კატეგორიის გარეშე".
 */
class NoteCategoryController extends Controller
{
    public function index(Request $request)
    {
        // ლენივი დეფაულტები: ახალი ანგარიშიც და მოგვიანებით ჩართული მოდულიც
        NoteCategory::ensureDefaults($request->user()->id);

        return NoteCategoryResource::collection($this->ordered()->get());
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $category = NoteCategory::create([
            'key' => NoteCategory::makeKey($request->user()->id, $data['name_en'] ?: $data['name_ka']),
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? null,
            'sort_order' => (int) NoteCategory::max('sort_order') + 1,
        ]);

        return (new NoteCategoryResource($category))->response()->setStatusCode(201);
    }

    public function update(Request $request, NoteCategory $noteCategory)
    {
        $data = $this->validated($request);

        $noteCategory->fill([
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? $noteCategory->icon,
        ])->save();

        return new NoteCategoryResource($noteCategory);
    }

    /** წაშლა; `move_to` — რომელ კატეგორიაზე გადავიდნენ ეს ჩანაწერები */
    public function destroy(Request $request, NoteCategory $noteCategory)
    {
        $data = $request->validate(DictionaryRecords::rules(
            $request,
            Rule::exists('note_categories', 'id')->where('user_id', $request->user()->id),
        ));

        // ეტაპი 8 — ჩანაწერებიც იშლება, **მოდელის გავლით** (ფაილი, კვოტა, აუდიტი)
        if ($request->boolean('delete_records')) {
            $deleted = DictionaryRecords::delete(NoteEntry::where('category_id', $noteCategory->id));
            $noteCategory->delete();

            return response()->json(['moved' => 0, 'deleted' => $deleted]);
        }

        $moveTo = DictionaryRecords::moveTarget($data, $noteCategory->id);

        $moved = NoteEntry::where('category_id', $noteCategory->id)->update(['category_id' => $moveTo]);

        $noteCategory->delete();

        return response()->json(['moved' => $moved, 'deleted' => 0]);
    }

    /** გადალაგება — მოწოდებული id-ების რიგი ხდება `sort_order` */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => [
                'integer',
                Rule::exists('note_categories', 'id')->where('user_id', $request->user()->id),
            ],
        ]);

        foreach ($data['ids'] as $i => $id) {
            NoteCategory::whereKey($id)->update(['sort_order' => $i + 1]);
        }

        return NoteCategoryResource::collection($this->ordered()->get());
    }

    /* ---------- დამხმარეები ---------- */

    private function ordered()
    {
        return NoteCategory::query()->withCount('noteEntries')->orderBy('sort_order')->orderBy('id');
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
