<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoTypeResource;
use App\Models\Video;
use App\Models\VideoType;
use App\Support\DictionaryColor;
use App\Support\DictionaryRecords;
use App\Support\DictionaryTrash;
use App\Support\ModuleList;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * ვიდეოს ტიპების მართვა — per-user CRUD + თანმიმდევრობა.
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
        /* ⚠️ **ამ ტიპის ვიდეოები ორ ნაწილად იყოფა** — სიაში მყოფი და კურსში
           მცხოვრები. ფანჯარა პირველს ითვლის და არჩევანიც მას ეხება; მეორე
           არასდროს იშლება და ყოველთვის სხვა ტიპზე გადადის (`DictionaryRecords::rules()`).
           შიშველი `Video::where('type_id', …)` ორივეს ერთად იღებდა: „ჩანაწერებიანად"
           წაშლა კურსის ვიდეოებსაც ურნაში აგზავნიდა, ფანჯარა კი მათ არ ითვლიდა. */
        $owned = Video::where('type_id', $videoType->id);
        $lessons = ModuleList::outside($owned);
        $lessonIds = (clone $lessons)->pluck('id')->all();

        $data = $request->validate(
            DictionaryRecords::rules(
                $request,
                Rule::exists('video_types', 'id')->whereNull('trashed_at')->where('user_id', $request->user()->id),
                $videoType->id,
                count($lessonIds),
            ),
            DictionaryRecords::messages(),
        );

        $lessonsTo = DictionaryRecords::lessonTarget($data);
        $records = ModuleList::narrow(clone $owned);

        // ჩანაწერებიც „იშლება“ — **მფლობელის ურნაში**, მოდელის გავლით
        if ($request->boolean('delete_records')) {
            $deleted = DictionaryRecords::trash($records);
            $kept = DictionaryRecords::move($lessons, fn ($video) => $video->type_id = $lessonsTo);
            DictionaryTrash::trash($videoType, 'video_type', [], null, $lessonIds, $lessonsTo);

            return response()->json(['moved' => 0, 'deleted' => $deleted, 'lessons' => $kept]);
        }

        $moveTo = DictionaryRecords::moveTarget($data);

        /* ⚠️ **ურნა** — რიგი ურნაში გადადის და იმახსოვრებს,
           რომელი ჩანაწერები გადაიტანა ამ წაშლამ: აღდგენა მათ დაბრუნებას
           შემოგთავაზებს (`DictionaryTrash`). ids **გადატანამდე** იკითხება. */
        $ids = (clone $records)->pluck('id')->all();

        $moved = DictionaryRecords::move($records, fn ($video) => $video->type_id = $moveTo);
        $kept = DictionaryRecords::move($lessons, fn ($video) => $video->type_id = $lessonsTo);

        DictionaryTrash::trash($videoType, 'video_type', $ids, $moveTo, $lessonIds, $lessonsTo);

        return response()->json(['moved' => $moved, 'deleted' => 0, 'lessons' => $kept]);
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
        // რიცხვი — მხოლოდ ვიდეოების სიაში მყოფი (კურსში მცხოვრები ფილტრში არ გამოჩნდება);
        // კურსის ვიდეოები ცალკე ითვლება — წაშლის ფანჯარა მათ ცალკე ხაზად აჩვენებს
        return VideoType::query()
            ->withCount([
                'videos' => fn ($q) => $q->listed(),
                'videos as lessons_count' => fn ($q) => $q->where('listed', false),
            ])
            ->orderBy('sort_order')
            ->orderBy('id');
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name_ka' => ['required', 'string', 'max:80'],
            'name_en' => ['required', 'string', 'max:80'],
            'icon' => ['nullable', 'string', 'max:60'],
            // ლექსიკონის ფერის ერთი წესი
            'color' => DictionaryColor::RULE,
        ]);
    }
}
