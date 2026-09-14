<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoTypeResource;
use App\Models\Video;
use App\Models\VideoType;
use App\Support\DictionaryRecords;
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
        ])->save();

        return new VideoTypeResource($videoType);
    }

    /**
     * წაშლა. `move_to` — რომელ ტიპზე გადავიდეს ეს ვიდეოები;
     * მითითების გარეშე ვიდეოები ტიპის გარეშე რჩება (`type_id = null`).
     */
    public function destroy(Request $request, VideoType $videoType)
    {
        $data = $request->validate(DictionaryRecords::rules(
            $request,
            Rule::exists('video_types', 'id')->where('user_id', $request->user()->id),
        ));

        // ეტაპი 8 — ჩანაწერებიც იშლება, **მოდელის გავლით** (ფაილი, კვოტა, აუდიტი)
        if ($request->boolean('delete_records')) {
            $deleted = DictionaryRecords::delete(Video::where('type_id', $videoType->id));
            $videoType->delete();

            return response()->json(['moved' => 0, 'deleted' => $deleted]);
        }

        $moveTo = DictionaryRecords::moveTarget($data, $videoType->id);

        $moved = Video::where('type_id', $videoType->id)->update(['type_id' => $moveTo]);

        $videoType->delete();

        return response()->json(['moved' => $moved, 'deleted' => 0]);
    }

    /** გადალაგება — მოწოდებული id-ების რიგი ხდება `sort_order` */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => [
                'integer',
                Rule::exists('video_types', 'id')->where('user_id', $request->user()->id),
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
        ]);
    }
}
