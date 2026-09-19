<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CourseCategoryResource;
use App\Models\Course;
use App\Models\CourseCategory;
use App\Support\DictionaryRecords;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * კურსის კატეგორიების მართვა — per-user CRUD + თანმიმდევრობა.
 * სტრუქტურა `BookmarkCategoryController`-ის იდენტურია (ერთი და იგივე
 * ლექსიკონის შაბლონი); წაშლისას კურსები **არ იკარგება**: `move_to`,
 * „კატეგორიის გარეშე" ან ცხადი `delete_records`.
 *
 * ⚠️ კავშირი **სვეტია** (`courses.category_id`) და არა pivot, ე.ი. „გადატანა"
 * მართლა სვეტის შეცვლაა — განსხვავებით სიმღერისა/თამაშისგან, სადაც
 * `syncWithoutDetaching` სჭირდება, რომ დანარჩენი ჟანრები გადარჩეს.
 */
class CourseCategoryController extends Controller
{
    public function index(Request $request)
    {
        // ლენივი დეფაულტები: ახალი ანგარიშიც და მოგვიანებით ჩართული მოდულიც
        CourseCategory::ensureDefaults($request->user()->id);

        return CourseCategoryResource::collection($this->ordered()->get());
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $category = CourseCategory::create([
            'key' => CourseCategory::makeKey($request->user()->id, $data['name_en'] ?: $data['name_ka']),
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? null,
            'sort_order' => (int) CourseCategory::max('sort_order') + 1,
        ]);

        return (new CourseCategoryResource($category))->response()->setStatusCode(201);
    }

    public function update(Request $request, CourseCategory $courseCategory)
    {
        $data = $this->validated($request);

        $courseCategory->fill([
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? $courseCategory->icon,
        ])->save();

        return new CourseCategoryResource($courseCategory);
    }

    /** წაშლა; `move_to` — რომელ კატეგორიაზე გადავიდნენ ეს კურსები */
    public function destroy(Request $request, CourseCategory $courseCategory)
    {
        $data = $request->validate(
            DictionaryRecords::rules(
                $request,
                Rule::exists('course_categories', 'id')->where('user_id', $request->user()->id),
                $courseCategory->id,
            ),
            DictionaryRecords::messages(),
        );

        // ჩანაწერებიც იშლება, **მოდელის გავლით** (ფაილი, კვოტა, აუდიტი)
        if ($request->boolean('delete_records')) {
            $deleted = DictionaryRecords::delete(Course::where('category_id', $courseCategory->id));
            $courseCategory->delete();

            return response()->json(['moved' => 0, 'deleted' => $deleted]);
        }

        $moveTo = DictionaryRecords::moveTarget($data);

        $moved = DictionaryRecords::move(
            Course::where('category_id', $courseCategory->id),
            fn ($course) => $course->category_id = $moveTo,
        );

        $courseCategory->delete();

        return response()->json(['moved' => $moved, 'deleted' => 0]);
    }

    /** გადალაგება — მოწოდებული id-ების რიგი ხდება `sort_order` */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => [
                'integer',
                Rule::exists('course_categories', 'id')->where('user_id', $request->user()->id),
            ],
        ]);

        foreach ($data['ids'] as $i => $id) {
            CourseCategory::whereKey($id)->update(['sort_order' => $i + 1]);
        }

        return CourseCategoryResource::collection($this->ordered()->get());
    }

    /* ---------- დამხმარეები ---------- */

    private function ordered()
    {
        return CourseCategory::query()->withCount('courses')->orderBy('sort_order')->orderBy('id');
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
