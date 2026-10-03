<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoTypeResource;
use App\Models\Video;
use App\Models\VideoType;
use App\Support\DictionaryRecords;
use App\Support\DictionaryTrash;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * ვიდეოს ტიპების მართვა (Tasks 5.1) — per-user CRUD + თანმიმდევრობა.
 *
 * წაშლისას მიბმული ვიდეოები **არ იკარგება**: ან სხვა ტიპზე გადადის
 * (`move_to`), ან ტიპის გარეშე რჩება — იგივე წესი, რაც `GenreRemover`-შია.
 */
class VideoTypeController extends Controller
{
    public function index(Request $request)
    {
        // ლენივი დეფაულტები: ახალი ანგარიშიც და მოგვიანებით ჩართული მოდულიც
        VideoType::ensureDefaults($request->user()->id);

        return VideoTypeResource::collection($this->ordered()->get());
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $type = VideoType::create([
            'key' => VideoType::makeKey($request->user()->id, $data['name_en'] ?: $data['name_ka']),
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? null,
            'color' => $data['color'] ?? null,
            // ახალი ტიპი ბოლოში მიდგება
            'sort_order' => (int) VideoType::max('sort_order') + 1,
        ]);

        return (new VideoTypeResource($type))->response()->setStatusCode(201);
    }

    public function update(Request $request, VideoType $videoType)
    {
        $data = $this->validated($request);

        $videoType->fill([
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? $videoType->icon,
            // ⚠️ `array_key_exists` და არა `??`: ფერის **მოხსნა** (`null`) ცხადი არჩევანია
            'color' => array_key_exists('color', $data) ? $data['color'] : $videoType->color,
        ])->save();

        return new VideoTypeResource($videoType);
    }

    /**
     * წაშლა. `move_to` — რომელ ტიპზე გადავიდეს ეს ვიდეოები;
     * მითითების გარეშე ვიდეოები ტიპის გარეშე რჩება (`type_id = null`).
     */
    public function destroy(Request $request, VideoType $videoType)
    {
        $data = $request->validate(
            DictionaryRecords::rules(
                $request,
                Rule::exists('video_types', 'id')->whereNull('trashed_at')->where('user_id', $request->user()->id),
                $videoType->id,
            ),
            DictionaryRecords::messages(),
        );

        // ეტაპი 8 — ჩანაწერებიც „იშლება“ — Tasks §29.8-ის შემდეგ **მფლობელის ურნაში**, მოდელის გავლით
        if ($request->boolean('delete_records')) {
            $deleted = DictionaryRecords::trash(Video::where('type_id', $videoType->id));
            DictionaryTrash::trash($videoType, 'video_type');

            return response()->json(['moved' => 0, 'deleted' => $deleted]);
        }

        $moveTo = DictionaryRecords::moveTarget($data);

        /* ⚠️ **ურნა (Tasks §29, ეტაპი 3)** — რიგი ურნაში გადადის და იმახსოვრებს,
           რომელი ჩანაწერები გადაიტანა ამ წაშლამ: აღდგენა მათ დაბრუნებას
           შემოგთავაზებს (`DictionaryTrash`). ids **გადატანამდე** იკითხება. */
        $records = Video::where('type_id', $videoType->id);
        $ids = (clone $records)->pluck('id')->all();

        $moved = DictionaryRecords::move($records, fn ($video) => $video->type_id = $moveTo);

        DictionaryTrash::trash($videoType, 'video_type', $ids, $moveTo);

        return response()->json(['moved' => $moved, 'deleted' => 0]);
    }

    /** გადალაგება — მოწოდებული id-ების რიგი ხდება `sort_order` */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => [
                'integer',
                Rule::exists('video_types', 'id')->whereNull('trashed_at')->where('user_id', $request->user()->id),
            ],
        ]);

        foreach ($data['ids'] as $i => $id) {
            VideoType::whereKey($id)->update(['sort_order' => $i + 1]);
        }

        return VideoTypeResource::collection($this->ordered()->get());
    }

    /* ---------- დამხმარეები ---------- */

    private function ordered()
    {
        return VideoType::query()->withCount('videos')->orderBy('sort_order')->orderBy('id');
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name_ka' => ['required', 'string', 'max:80'],
            'name_en' => ['required', 'string', 'max:80'],
            'icon' => ['nullable', 'string', 'max:60'],
            // Tasks §19.2 — სტატუსის ფერის იგივე წესი (`StatusController`)
            'color' => ['nullable', 'string', 'max:20', 'regex:/^(c([1-9]|1[0-2])|#[0-9a-fA-F]{6})$/'],
        ]);
    }
}
