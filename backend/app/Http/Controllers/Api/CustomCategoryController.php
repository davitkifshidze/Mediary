<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CustomCategoryResource;
use App\Models\CustomCategory;
use App\Models\CustomRecord;
use App\Support\CustomModules;
use App\Support\DictionaryRecords;
use App\Support\DictionaryTrash;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * **პირადი მოდულის კლასიფიკატორი — CRUD + რიგი (Tasks §37).**
 *
 * `BookmarkCategoryController`-ის ზუსტი ფორმა, ერთი განსხვავებით: ცხრილი
 * საერთოა ყველა პირად მოდულზე, ე.ი. ყოველი query **მოდულით** იჭრება
 * (`forModule()`) და ყოველი რიგი მოდულზეც მოწმდება (`category()`).
 *
 * ⚠️ **კლასიფიკაციის გარეშე მოდულზე 404** — ლექსიკონი, რომლის ველიც
 * ფორმაზე არ ჩანს, ცარიელ, გამოუყენებელ სიას დაიწყებდა.
 */
class CustomCategoryController extends Controller
{
    public function index(Request $request, string $type)
    {
        $this->classifies($type);

        return CustomCategoryResource::collection($this->ordered($type)->get());
    }

    public function store(Request $request, string $type)
    {
        $this->classifies($type);
        $data = $this->validated($request);
        $userId = (int) $request->user()->getKey();

        $category = CustomCategory::create([
            'module' => $type,
            'key' => CustomCategory::makeKey($userId, $type, $data['name_en'] ?: $data['name_ka']),
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? null,
            'sort_order' => (int) CustomCategory::query()->forModule($type)->max('sort_order') + 1,
        ]);

        return (new CustomCategoryResource($category))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $type, CustomCategory $category)
    {
        $category = $this->category($type, $category);
        $data = $this->validated($request);

        $category->fill([
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? $category->icon,
        ])->save();

        return new CustomCategoryResource($category);
    }

    /** წაშლა — `move_to` · `clear_records` · `delete_records` (`DictionaryRecords`-ის სამი ცხადი არჩევანი) */
    public function destroy(Request $request, string $type, CustomCategory $category)
    {
        $category = $this->category($type, $category);

        $data = $request->validate(
            DictionaryRecords::rules($request, $this->target($request, $type), $category->id),
            DictionaryRecords::messages(),
        );

        $records = CustomRecord::query()->forModule($type)->where('category_id', $category->id);

        // ჩანაწერებიც „იშლება“ — Tasks §29.8-ის შემდეგ **მფლობელის ურნაში**
        if ($request->boolean('delete_records')) {
            $deleted = DictionaryRecords::trash($records);
            DictionaryTrash::trash($category, 'custom_category');

            return response()->json(['moved' => 0, 'deleted' => $deleted]);
        }

        $moveTo = DictionaryRecords::moveTarget($data);

        // ⚠️ ids **გადატანამდე** — აღდგენამ მათი დაბრუნება შემოგთავაზოს (`DictionaryTrash`)
        $ids = (clone $records)->pluck('id')->all();
        $moved = DictionaryRecords::move($records, fn ($record) => $record->category_id = $moveTo);

        DictionaryTrash::trash($category, 'custom_category', $ids, $moveTo);

        return response()->json(['moved' => $moved, 'deleted' => 0]);
    }

    /** გადალაგება — მოწოდებული id-ების რიგი ხდება `sort_order` */
    public function reorder(Request $request, string $type)
    {
        $this->classifies($type);

        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => ['integer', $this->target($request, $type)],
        ]);

        foreach ($data['ids'] as $i => $id) {
            CustomCategory::query()->forModule($type)->whereKey($id)->update(['sort_order' => $i + 1]);
        }

        return CustomCategoryResource::collection($this->ordered($type)->get());
    }

    /* ---------- დამხმარეები ---------- */

    private function classifies(string $type): void
    {
        abort_unless(CustomModules::classifies($type), 404);
    }

    /** რიგი **ამ მოდულისაა** — ან 404 (`CustomRecordController::record()`-ის წესი) */
    private function category(string $type, CustomCategory $category): CustomCategory
    {
        abort_unless($category->module === $type, 404);

        return $category;
    }

    private function target(Request $request, string $type)
    {
        return Rule::exists('custom_categories', 'id')
            ->whereNull('trashed_at')
            ->where('user_id', $request->user()->getKey())
            ->where('module', $type);
    }

    private function ordered(string $type)
    {
        return CustomCategory::query()->forModule($type)->withCount('records')->orderBy('sort_order')->orderBy('id');
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
