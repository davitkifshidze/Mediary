<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlaceCategoryResource;
use App\Models\Place;
use App\Models\PlaceCategory;
use App\Support\DictionaryRecords;
use App\Support\DictionaryTrash;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * ადგილის კატეგორიების მართვა — per-user CRUD + თანმიმდევრობა (FEAT-26).
 * სტრუქტურა `BookmarkCategoryController`-ის იდენტურია (ერთი და იგივე
 * ლექსიკონის შაბლონი); წაშლისას ადგილები **არ იკარგება**: `move_to`,
 * „კატეგორიის გარეშე" ან ცხადი `delete_records`.
 *
 * ⚠️ კავშირი **სვეტია** (`places.category_id`) და არა pivot, ე.ი. „გადატანა"
 * მართლა სვეტის შეცვლაა — განსხვავებით სიმღერისა/თამაშისგან, სადაც
 * `syncWithoutDetaching` სჭირდება, რომ დანარჩენი ჟანრები გადარჩეს.
 */
class PlaceCategoryController extends Controller
{
    public function index(Request $request)
    {
        // ლენივი დეფაულტები: ახალი ანგარიშიც და მოგვიანებით ჩართული მოდულიც
        PlaceCategory::ensureDefaults($request->user()->id);

        return PlaceCategoryResource::collection($this->ordered()->get());
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $category = PlaceCategory::create([
            'key' => PlaceCategory::makeKey($request->user()->id, $data['name_en'] ?: $data['name_ka']),
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? null,
            'sort_order' => (int) PlaceCategory::max('sort_order') + 1,
        ]);

        return (new PlaceCategoryResource($category))->response()->setStatusCode(201);
    }

    public function update(Request $request, PlaceCategory $placeCategory)
    {
        $data = $this->validated($request);

        $placeCategory->fill([
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? $placeCategory->icon,
        ])->save();

        return new PlaceCategoryResource($placeCategory);
    }

    /** წაშლა; `move_to` — რომელ კატეგორიაზე გადავიდნენ ეს კურსები */
    public function destroy(Request $request, PlaceCategory $placeCategory)
    {
        $data = $request->validate(
            DictionaryRecords::rules(
                $request,
                Rule::exists('place_categories', 'id')->whereNull('trashed_at')->where('user_id', $request->user()->id),
                $placeCategory->id,
            ),
            DictionaryRecords::messages(),
        );

        // ჩანაწერებიც იშლება, **მოდელის გავლით** (ფაილი, კვოტა, აუდიტი)
        if ($request->boolean('delete_records')) {
            $deleted = DictionaryRecords::delete(Place::where('category_id', $placeCategory->id));
            DictionaryTrash::trash($placeCategory, 'place_category');

            return response()->json(['moved' => 0, 'deleted' => $deleted]);
        }

        $moveTo = DictionaryRecords::moveTarget($data);

        /* ⚠️ **ურნა (Tasks §29, ეტაპი 3)** — რიგი ურნაში გადადის და იმახსოვრებს,
           რომელი ჩანაწერები გადაიტანა ამ წაშლამ: აღდგენა მათ დაბრუნებას
           შემოგთავაზებს (`DictionaryTrash`). ids **გადატანამდე** იკითხება. */
        $records = Place::where('category_id', $placeCategory->id);
        $ids = (clone $records)->pluck('id')->all();

        $moved = DictionaryRecords::move($records, fn ($place) => $place->category_id = $moveTo);

        DictionaryTrash::trash($placeCategory, 'place_category', $ids, $moveTo);

        return response()->json(['moved' => $moved, 'deleted' => 0]);
    }

    /** გადალაგება — მოწოდებული id-ების რიგი ხდება `sort_order` */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => [
                'integer',
                Rule::exists('place_categories', 'id')->whereNull('trashed_at')->where('user_id', $request->user()->id),
            ],
        ]);

        foreach ($data['ids'] as $i => $id) {
            PlaceCategory::whereKey($id)->update(['sort_order' => $i + 1]);
        }

        return PlaceCategoryResource::collection($this->ordered()->get());
    }

    /* ---------- დამხმარეები ---------- */

    private function ordered()
    {
        return PlaceCategory::query()->withCount('places')->orderBy('sort_order')->orderBy('id');
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
