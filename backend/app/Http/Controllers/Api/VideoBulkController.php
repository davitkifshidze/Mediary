<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Video;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * ვიდეოების მასობრივი ოპერაცია (Tasks 4).
 *
 * ვიდეოს **სტატუსი არ აქვს**, ამიტომ ფილმის/სერიალის `bulk-status`-ის
 * ანალოგი აქ სამი მოქმედებაა (გადაწყდა 19.9-ში): ტიპის შეცვლა და
 * ტეგის დამატება/მოხსნა. რჩეული ბადეზე ერთი დაჭერითაა, ე.ი. აქ არ ჩანს.
 *
 * მფლობელობა — `BelongsToUser` global scope, ე.ი. სხვისი id ჩუმად ამოვარდება.
 */
class VideoBulkController extends Controller
{
    public function update(Request $request)
    {
        $data = $request->validate([
            'action' => ['required', Rule::in(['type', 'tags_add', 'tags_remove'])],
            // ან კონკრეტული ids, ან „ამ ტიპის ყველა ვიდეო"
            'ids' => ['array'],
            'ids.*' => ['integer'],
            // 0 = „ტიპის გარეშე" (null type_id) — query string-ში null ვერ გადმოიცემა
            'from_type_id' => ['nullable', 'integer'],
            /* ⚠️ `action=type`-ზე ტიპი **სავალდებულია**. აქამდე აქ `null` იყო
               დაშვებული და „ტიპის მოხსნას" ნიშნავდა — ე.ი. ერთი მასობრივი
               ცვლილებით შეიძლებოდა ზუსტად ის მდგომარეობა გამოგვენა, რომელსაც
               ფორმა აღარ უშვებს (ეს იქნებოდა ვალიდაციის გვერდიყან შემოსვლა). */
            'type_id' => [
                Rule::requiredIf(fn () => $request->input('action') === 'type'),
                'integer',
                Rule::exists('video_types', 'id')->where('user_id', $request->user()->id),
            ],
            'tags' => ['array', 'max:20'],
            'tags.*' => ['string', 'max:40'],
        ]);

        $query = Video::query();
        if (! empty($data['ids'])) {
            $query->whereIn('id', $data['ids']);
        } elseif ($request->has('from_type_id')) {
            $from = (int) ($data['from_type_id'] ?? 0);
            $from === 0 ? $query->whereNull('type_id') : $query->where('type_id', $from);
        } else {
            return response()->json(['message' => 'აირჩიე ვიდეოები ან საწყისი ტიპი.'], 422);
        }

        $tags = Video::normalizeTags($data['tags'] ?? []);
        if ($data['action'] !== 'type' && $tags === []) {
            return response()->json(['message' => 'მიუთითე ერთი ტეგი მაინც.'], 422);
        }

        $updated = 0;
        foreach ($query->get() as $video) {
            $changed = match ($data['action']) {
                'type' => $this->setType($video, (int) $data['type_id']),
                'tags_add' => $this->addTags($video, $tags),
                'tags_remove' => $this->removeTags($video, $tags),
            };

            // მხოლოდ ნამდვილად შეცვლილს ვთვლით — „0 ჩანაწერი შეიცვალა" სწორი პასუხია
            if ($changed) {
                $video->save();
                $updated++;
            }
        }

        return response()->json(['updated' => $updated]);
    }

    private function setType(Video $video, ?int $typeId): bool
    {
        if ($video->type_id === $typeId) {
            return false;
        }

        $video->type_id = $typeId;

        return true;
    }

    /** @param  list<string>  $tags */
    private function addTags(Video $video, array $tags): bool
    {
        $before = $video->tags ?? [];
        // ჯერ არსებული, მერე ახალი — `normalizeTags` დუბლს თვითონ ჭრის (ძველი რჩება)
        $after = Video::normalizeTags([...$before, ...$tags]);

        if ($after === $before) {
            return false;
        }

        $video->tags = $after;

        return true;
    }

    /** @param  list<string>  $tags */
    private function removeTags(Video $video, array $tags): bool
    {
        $before = $video->tags ?? [];
        $drop = array_map(Video::tagKey(...), $tags);

        $after = array_values(array_filter(
            $before,
            fn ($tag) => ! in_array(Video::tagKey((string) $tag), $drop, true),
        ));

        if ($after === $before) {
            return false;
        }

        $video->tags = $after;

        return true;
    }
}
