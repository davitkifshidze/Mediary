<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CustomRecordResource;
use App\Models\CustomCategory;
use App\Models\CustomRecord;
use App\Models\Status;
use App\Services\Bookmarks\LinkMetadata;
use App\Services\Storage\StorageMeter;
use App\Support\ColumnTrash;
use App\Support\CustomModules;
use App\Support\Like;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * **ინტერფეისიდან შექმნილი მოდულის ჩანაწერები (Tasks §37.1/§37.3).**
 *
 * ერთი კონტროლერი ყველა პირად მოდულზე — მარშრუტი `/custom/{type}/…`,
 * სადაც `{type}` მოდულის გასაღებია (`module:@type` + `permission:@type`).
 *
 * ⚠️ **ორი ფენა და ორივე სავალდებულოა.** `module:` middleware სხვის მოდულს
 * 404-ით ჭრის, `owner` scope — სხვის ჩანაწერს; მაგრამ **იმავე ანგარიშის
 * მეორე პირადი მოდულის** ჩანაწერს არც ერთი არ ჭრის — ამიტომ ყოველი
 * ჩანაწერი მოდულზეც მოწმდება (`record()`), და სია `forModule()`-ით იგება.
 *
 * ⚠️ **გამამდიდრებელი წყარო არ არსებობს** (ბუკმარკის წესი): ერთადერთი
 * დახმარება ბმულის გვერდის `<head>`-ია (`LinkMetadata`).
 */
class CustomRecordController extends Controller
{
    public function __construct(private StorageMeter $meter) {}

    public function index(Request $request, string $type)
    {
        $query = CustomRecord::query()->forModule($type)->with('category');

        foreach ($this->slugList($request->string('status')->toString()) as $key) {
            $query->statusKey($key);
        }
        if ($request->boolean('favorite')) {
            $query->where('is_favorite', true);
        }

        // ⚠️ კლასიფიკაცია **სვეტია** (ერთი ჩანაწერზე) — `whereIn` (OR) და არა
        // `whereHas`: AND-ით კვეთა ყოველთვის ცარიელ სიას მოგვცემდა (ბუკმარკის წესი)
        if ($categories = $this->slugList($request->string('category_id')->toString())) {
            $query->whereIn('category_id', array_map('intval', $categories));
        }
        foreach ($this->slugList($request->string('tag')->toString()) as $tag) {
            $query->whereJsonContains('tags', $tag);
        }

        if ($q = $request->string('q')->toString()) {
            $query->where(fn (Builder $inner) => $inner
                ->where('title', 'like', Like::contains($q))
                ->orWhere('description', 'like', Like::contains($q))
                ->orWhere('url', 'like', Like::contains($q))
                ->orWhere('tags', 'like', Like::contains($q)));
        }

        match ($request->string('sort')->toString()) {
            'title' => $query->orderBy('title'),
            'oldest' => $query->orderBy('id'),
            'updated' => $query->orderByDesc('updated_at')->orderByDesc('id'),
            'finished' => $query->orderByDesc('finished_at')->orderByDesc('id'),
            default => $query->orderByDesc('id'),
        };

        return CustomRecordResource::collection($this->paginated($request, $query));
    }

    public function show(string $type, CustomRecord $record)
    {
        return new CustomRecordResource($this->record($type, $record)->load('category'));
    }

    /**
     * ბმულის გვერდის მეტამონაცემი ფორმის შესავსებად — ჩანაწერს არ ქმნის.
     * ⚠️ ჩავარდნა 200-ია ცარიელი ველებით (ბუკმარკის წესი): დახურული
     * გვერდი ჩვეულებრივი ამბავია და ხელით შევსებას არ უნდა უშლიდეს.
     */
    public function metadata(Request $request, string $type, LinkMetadata $meta)
    {
        $data = $request->validate(['url' => ['required', 'string', 'max:1000', 'url']]);

        return response()->json($meta->fetch($data['url']));
    }

    public function store(Request $request, string $type)
    {
        $record = new CustomRecord(['module' => $type]);
        $this->apply($record, $request, $type, $this->validated($request, $type));
        $record->save();

        return (new CustomRecordResource($record->refresh()->load('category')))
            ->response()->setStatusCode(201);
    }

    public function update(Request $request, string $type, CustomRecord $record)
    {
        $this->record($type, $record);

        $this->apply($record, $request, $type, $this->validated($request, $type, $record));
        $record->save();

        return new CustomRecordResource($record->load('category'));
    }

    /** ⚠️ ურნაში (FEAT-11 → Tasks §29) — ფაილები, ველები და კვოტა ადგილზე რჩება */
    public function destroy(string $type, CustomRecord $record)
    {
        $this->record($type, $record)->moveToTrash();

        return response()->noContent();
    }

    public function toggleFavorite(string $type, CustomRecord $record)
    {
        $record = $this->record($type, $record);
        $record->is_favorite = ! $record->is_favorite;
        $record->save();

        return new CustomRecordResource($record->load('category'));
    }

    /** სტატუსი ცალკე endpoint-ია — ბარათიდან ერთი კლიკია (ბუკმარკის ანალოგი) */
    public function setStatus(Request $request, string $type, CustomRecord $record)
    {
        $record = $this->record($type, $record);

        $data = $request->validate([
            'status' => ['required', 'string', Status::rule($type)],
        ]);

        $record->applyStatusKey($data['status']);
        $record->save();

        return new CustomRecordResource($record->load('category'));
    }

    /**
     * **მასობრივი სტატუსი (Tasks §37.5)** — `POST /custom/{key}/bulk-status`,
     * `RecordStatusController::bulkUpdate()`-ის ფორმა: ან კონკრეტული `ids`, ან
     * `from_status`-ის მქონე ყველა; ცარიელი სკოუპი 422-ია და არასდროს „ყველა".
     *
     * ⚠️ **ციკლი მოდელით და არა `update()` query-ზე**: `finished_at`-ის ერთადერთი
     * მწერალი `applyStatus()`-ია (BUG-05-ის გაკვეთილი), აუდიტ-ლოგიც მოდელის
     * ივენთზე დგას. ⚠️ **მოდულით ჭრილი** — სხვა პირადი მოდულის id `ids`-ში
     * ჩუმად გამოტოვდება (`queryFor()`).
     */
    public function bulkStatus(Request $request, string $type)
    {
        $data = $request->validate([
            'status' => ['required', 'string', Status::rule($type)],
            'ids' => ['array', 'max:2000'],
            'ids.*' => ['integer'],
            'from_status' => ['nullable', 'string', Status::rule($type)],
        ]);

        $query = CustomRecord::queryFor($type);

        if (! empty($data['ids'])) {
            $query->whereIn('id', $data['ids']);
        } elseif (! empty($data['from_status'])) {
            $query->statusKey($data['from_status']);
        } else {
            return response()->json(['message' => 'scope_required'], 422);
        }

        // სამიზნე ერთხელ იკითხება — თითო ჩანაწერზე ერთი query იქნებოდა
        $target = Status::forDomain($type)->where('key', $data['status'])->firstOrFail();

        $updated = 0;
        foreach ($query->get() as $record) {
            $record->applyStatus($target);
            $record->save();
            $updated++;
        }

        return response()->json(['updated' => $updated]);
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * ჩანაწერი **ამ მოდულისაა** — ან 404.
     *
     * ⚠️ route-model-binding მხოლოდ `owner`-ით ჭრის; ერთი ანგარიშის ორი
     * პირადი მოდულის ჩანაწერი ერთ ცხრილშია, ე.ი. `/custom/A/{B-ს ჩანაწერი}`
     * სხვაგვარად B-ს ჩანაწერს A-ს ველებითა და სტატუსებით დაამუშავებდა.
     */
    private function record(string $type, CustomRecord $record): CustomRecord
    {
        abort_unless($record->module === $type, 404);

        return $record;
    }

    private function validated(Request $request, string $type, ?CustomRecord $record = null): array
    {
        $userId = (int) $request->user()->getKey();

        /* ⚠️ **სტატუსი და კლასიფიკაცია სავალდებულოა — როცა არსებობს** (2026-09-16-ის
           წესი: ჩანაწერი სტატუსისა და ტიპის გარეშე არ ინახება). პირადი მოდული
           შეიძლება **ცარიელი სტატუსებით** შეიქმნა (37.2) ან კლასიფიკაციის
           გარეშე — მაშინ სავალდებულო ველი ვერასდროს შეივსებოდა და შენახვა
           სამუდამოდ ჩაიკეტებოდა. რედაქტირებისას `sometimes` (`$must`-ის წესი). */
        $hasStatuses = Status::keysFor($userId, $type) !== [];
        $classifies = CustomModules::classifies($type);
        $hasCategories = $classifies && CustomCategory::query()->forModule($type)->exists();

        $must = $record ? ['sometimes', 'required'] : ['required'];

        return $request->validate([
            // სათაური — ბმულის გვერდიდანაც ივსება, ე.ი. ბმულთან ერთად არჩევითია
            'title' => [...($record ? ['sometimes'] : []), 'required_without:url', 'nullable', 'string', 'max:255'],
            'url' => ['nullable', 'string', 'max:1000', 'url'],
            'description' => ['nullable', 'string', 'max:10000'],
            'status' => [
                ...($hasStatuses ? $must : ['nullable']),
                'string',
                Status::rule($type, $userId),
            ],
            'category_id' => [
                ...($hasCategories ? $must : ['nullable']),
                // ⚠️ კლასიფიკაციის გარეშე მოდულზე ველი საერთოდ არ მიიღება
                Rule::prohibitedIf(! $classifies),
                'integer',
                Rule::exists('custom_categories', 'id')
                    ->whereNull('trashed_at')
                    ->where('user_id', $userId)
                    ->where('module', $type),
            ],
            'tags' => ['nullable', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],
            'is_favorite' => ['nullable', 'boolean'],
            'visibility' => ['nullable', Rule::in(['private', 'public'])],
            'image_url' => ['nullable', 'string', 'max:1000', 'url'],
            'photo' => ['nullable', ...UploadLimits::rule('primary', $request->user())],
            'remove_photo' => ['nullable', 'boolean'],
        ]);
    }

    private function apply(CustomRecord $record, Request $request, string $type, array $data): void
    {
        foreach (['title', 'description', 'image_url'] as $field) {
            if (array_key_exists($field, $data)) {
                $record->{$field} = $data[$field] ?: null;
            }
        }
        if (array_key_exists('category_id', $data)) {
            $record->category_id = $data['category_id'] ?: null;
        }
        if (! empty($data['status'])) {
            $record->applyStatusKey($data['status']);
        }
        if (! empty($data['visibility'])) {
            $record->visibility = $data['visibility'];
        }
        if (array_key_exists('tags', $data)) {
            $record->tags = CustomRecord::normalizeTags($data['tags'] ?? []);
        }
        if ($request->has('is_favorite')) {
            $record->is_favorite = $request->boolean('is_favorite');
        }

        if (array_key_exists('url', $data)) {
            $changed = $record->url !== ($data['url'] ?: null);
            // ⚠️ `platform`/`embed_url` მხოლოდ აქედან იწერება (`applyUrl()`)
            $record->applyUrl($data['url'] ?? null);

            if ($changed && $record->url) {
                $this->autofill($record, $request);
            }
        }

        // ⚠️ `required_without:url` ცარიელ სათაურს ბმულთან ერთად უშვებს — თუ
        // გვერდმაც ვერაფერი თქვა, ბმულის ჰოსტი მაინც სჯობს უსახელო ჩანაწერს
        if (! $record->title) {
            $record->title = $record->domain() ?: (string) $record->url;
        }

        if ($request->boolean('remove_photo')) {
            // Tasks §29, ეტაპი 4 — ძველი ატვირთული ფაილი ურნაში
            ColumnTrash::capture($record, 'photo_path');
            $record->photo_path = null;
        }

        if ($request->hasFile('photo')) {
            // 17.3 — `storeUpload()` ატვირთვამდე ამოწმებს კვოტას (ამოწურვაზე 413)
            ColumnTrash::capture($record, 'photo_path');
            $record->photo_path = $this->meter
                ->storeUpload($request->user(), $request->file('photo'), StorageFolder::customPhotos($type));
        }
    }

    /**
     * ცარიელი ველების შევსება ბმულის გვერდიდან. **არასდროს გადააწერს** იმას,
     * რაც user-მა შეავსო; ჩავარდნაზე ჩუმად გადის. `autofill=0`-ით გამორთვადია.
     */
    private function autofill(CustomRecord $record, Request $request): void
    {
        if (! $request->boolean('autofill', true)) {
            return;
        }

        if ($record->title && $record->description && ($record->photo_path || $record->image_url)) {
            return;
        }

        $meta = app(LinkMetadata::class)->fetch((string) $record->url);

        if (! $record->title && $meta['title']) {
            $record->title = $meta['title'];
        }
        if (! $record->description && $meta['description']) {
            $record->description = $meta['description'];
        }
        if (! $record->photo_path && ! $record->image_url && $meta['image_url']) {
            $record->image_url = $meta['image_url'];
        }
    }
}
