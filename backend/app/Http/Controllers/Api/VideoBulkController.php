<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Status;
use App\Models\Video;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

/**
 * ვიდეოების მასობრივი ოპერაცია (Tasks 4 → §9).
 *
 * **წყაროს არჩევა ორვარიანტიანი იყო** — ან კონკრეტული `ids`, ან ერთი
 * `from_type_id` — და შენი მითითება სწორედ ამაზე იყო: „ტეგების დამატებაზე
 * უნდა ირჩევდე, რომელი ტეგის მქონეს დაუმატო ახალი ტეგი, ან რომელი ტიპის
 * მქონეს, ან კონკრეტულს, ან ყველას".
 *
 * ⚠️ **ლექსიკა უკვე არსებობდა და არ გამოგვიგონებია**: `PurgeService::TARGET_MODES`
 * ვიდეოზე ზუსტად `ids | type | tag | status | all`-ს იცნობს, ფრონტზე კი
 * მისი ტიპიზებული სარკე `PURGE_TARGET_MODES`. იგივე სიტყვები, იგივე
 * მნიშვნელობა — ორი ლექსიკონი ერთსა და იმავე ცნებაზე ერთ დღეს დაშორდებოდა.
 *
 * ⚠️ **სკოუპის პარამეტრებს `scope_` პრეფიქსი აქვს და ეს სავალდებულოა.**
 * `tags` და `type_id` **მოქმედების დატვირთვაა** („დაამატე ეს ტეგი",
 * „გახადე ეს ტიპი"), ე.ი. იმავე სახელით სკოუპი თავის თავზე მიუთითებდა:
 * „დაამატე ტეგი X ყველას, ვისაც X აქვს".
 *
 * ⚠️ **„დათვლილი" და „შეცვლილი" ერთი query-დან მოდის** (`records()`) —
 * `/purge`-ის `plan()`/`run()`-ის წესი. ორი განმარტება ნიშნავდა, რომ
 * ნაჩვენები რიცხვი და შეხებული რიგები ერთმანეთს აცდებოდა.
 *
 * ⚠️ **ტეგი PHP-ში დაედარება და არა `LIKE`-ით**: ქართული ტეგი JSON სვეტში
 * **escape-ულად** ზის (`["ინფ…"]`), ე.ი. `LIKE '%ინფ%'`
 * ვერასდროს დაემთხვეოდა. `Video::tagKey()` იგივე ფუნქციაა, რომელსაც
 * ფორმაც და `PurgeService`-იც იყენებს.
 *
 * ⚠️ **სტატუსიც აქაა და არა `POST /videos/bulk-status`-ში.** ვიდეოს
 * სტატუსი §6.4-ის შემდეგ აქვს და მისი მასობრივი ცვლილება იმავე სკოუპებს
 * უნდა ემორჩილებოდეს; `bulk-status` მხოლოდ `ids`/`from_status`-ს იცნობს,
 * ე.ი. სკოუპის მეორე განმარტება დაიბადებოდა. ის endpoint რჩება
 * (სკრიპტებისთვის და დანარჩენი დომენებისთვის), SPA კი აქ მოდის.
 *
 * მფლობელობა — `BelongsToUser` global scope, ე.ი. სხვისი id ჩუმად ამოვარდება.
 */
class VideoBulkController extends Controller
{
    /** რა მოქმედება — ტიპი · ტეგები · სტატუსი */
    private const ACTIONS = ['type', 'tags_add', 'tags_remove', 'status'];

    /** ვის შეეხება — `PurgeService::TARGET_MODES`-ის იგივე ლექსიკა */
    private const SCOPES = ['ids', 'type', 'tag', 'status', 'all'];

    /** პრევიუში რამდენი სათაური ჩანს */
    private const SAMPLE = 5;

    /**
     * **„რამდენს შეეხება" — `GET /api/videos/bulk-preview`.**
     *
     * ⚠️ **`GET` და არა `POST`**: `preview` `EnsureModulePermission::UPDATE_ENDPOINTS`-ში
     * არ არის, ე.ი. POST-ს შუამავალი `create`-ად წაიკითხავდა და view+update
     * როლი უსაფუძვლო 403-ს მიიღებდა.
     */
    public function preview(Request $request)
    {
        $data = $this->validated($request, scopeOnly: true);
        $records = $this->records($data);

        return response()->json([
            'count' => $records->count(),
            'sample' => $records->take(self::SAMPLE)
                ->map(fn (Video $v) => ['id' => $v->id, 'title' => $v->title])
                ->values()
                ->all(),
        ]);
    }

    public function update(Request $request)
    {
        $data = $this->validated($request);

        $tags = Video::normalizeTags($data['tags'] ?? []);
        if (in_array($data['action'], ['tags_add', 'tags_remove'], true) && $tags === []) {
            return response()->json(['message' => 'no_tags_given'], 422);
        }

        // სამიზნე სტატუსი ერთხელ იკითხება — თითო ჩანაწერზე ერთი query იქნებოდა
        $status = $data['action'] === 'status'
            ? Status::forDomain('video')->where('key', $data['status'])->firstOrFail()
            : null;

        $updated = 0;
        foreach ($this->records($data) as $video) {
            $changed = match ($data['action']) {
                'type' => $this->setType($video, (int) $data['type_id']),
                'tags_add' => $this->addTags($video, $tags),
                'tags_remove' => $this->removeTags($video, $tags),
                'status' => $this->setStatus($video, $status),
            };

            // მხოლოდ ნამდვილად შეცვლილს ვთვლით — „0 ჩანაწერი შეიცვალა" სწორი პასუხია
            if ($changed) {
                $video->save();
                $updated++;
            }
        }

        return response()->json(['updated' => $updated]);
    }

    /* ---------- სკოუპი ---------- */

    /**
     * @param  bool  $scopeOnly  პრევიუს მოქმედება არ აინტერესებს
     * @return array<string, mixed>
     */
    private function validated(Request $request, bool $scopeOnly = false): array
    {
        $scope = fn (string $value) => Rule::requiredIf(fn () => $request->input('scope') === $value);

        $rules = [
            'scope' => ['required', Rule::in(self::SCOPES)],
            'scope_ids' => [$scope('ids'), 'array', 'min:1'],
            'scope_ids.*' => ['integer'],
            // 0 = „ტიპის გარეშე" (`type_id IS NULL`) — query string-ში null ვერ გადმოიცემა
            'scope_type_id' => [$scope('type'), 'integer'],
            'scope_tag' => [$scope('tag'), 'string', 'max:40'],
            'scope_status' => [$scope('status'), 'string', Status::rule('video')],
        ];

        if (! $scopeOnly) {
            $rules += [
                'action' => ['required', Rule::in(self::ACTIONS)],
                /* ⚠️ `action=type`-ზე ტიპი **სავალდებულია**. აქამდე აქ `null` იყო
                   დაშვებული და „ტიპის მოხსნას" ნიშნავდა — ე.ი. ერთი მასობრივი
                   ცვლილებით შეიძლებოდა ზუსტად ის მდგომარეობა გამოგვენა,
                   რომელსაც ფორმა აღარ უშვებს. */
                'type_id' => [
                    Rule::requiredIf(fn () => $request->input('action') === 'type'),
                    'integer',
                    Rule::exists('video_types', 'id')->where('user_id', $request->user()->id),
                ],
                'status' => [
                    Rule::requiredIf(fn () => $request->input('action') === 'status'),
                    'string',
                    Status::rule('video'),
                ],
                'tags' => ['array', 'max:20'],
                'tags.*' => ['string', 'max:40'],
            ];
        }

        return $request->validate($rules);
    }

    /**
     * **ერთადერთი ადგილი, სადაც სკოუპი ჩანაწერებად იქცევა.**
     *
     * ⚠️ პასუხი კოლექციაა და არა query builder-ი, რადგან **ტეგი SQL-ით
     * ვერ იფილტრება** (იხ. კლასის docblock). ორივე — პრევიუც და ჩაწერაც —
     * აქედან იკვებება, ე.ი. რიცხვი და შედეგი ვერ დაშორდება.
     *
     * @param  array<string, mixed>  $data
     * @return Collection<int, Video>
     */
    private function records(array $data): Collection
    {
        $query = Video::query();

        match ($data['scope']) {
            'ids' => $query->whereIn('id', array_map('intval', $data['scope_ids'])),
            'type' => (int) $data['scope_type_id'] === 0
                ? $query->whereNull('type_id')
                : $query->where('type_id', (int) $data['scope_type_id']),
            'status' => $query->statusKey($data['scope_status']),
            // „ყველა" **ცხადი სკოუპია** და არა „ფილტრი არ მოსულა" (`/purge`-ის წესი)
            'all', 'tag' => null,
        };

        $records = $query->get();

        if ($data['scope'] === 'tag') {
            $needle = Video::tagKey((string) $data['scope_tag']);

            $records = $records->filter(
                fn (Video $v) => in_array($needle, array_map(Video::tagKey(...), $v->tags ?? []), true),
            );
        }

        return $records->values();
    }

    /* ---------- მოქმედებები ---------- */

    private function setType(Video $video, ?int $typeId): bool
    {
        if ($video->type_id === $typeId) {
            return false;
        }

        $video->type_id = $typeId;

        return true;
    }

    private function setStatus(Video $video, Status $status): bool
    {
        if ((int) $video->status_id === (int) $status->id) {
            return false;
        }

        // ⚠️ `applyStatus()` და არა ხელით `status_id` — `watched_at`-ის წესი
        // (როლიდან და არა სახელიდან) ერთ ადგილას წერია (`HasStatus`)
        $video->applyStatus($status);

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
