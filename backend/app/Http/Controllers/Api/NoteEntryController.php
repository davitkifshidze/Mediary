<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\ReordersRecords;
use App\Http\Controllers\Controller;
use App\Http\Resources\NoteEntryResource;
use App\Models\NoteEntry;
use App\Models\Status;
use App\Services\Stats\LibraryStats;
use App\Services\Storage\StorageMeter;
use App\Support\ColumnTrash;
use App\Support\Like;
use App\Support\RichText;
use App\Support\SafeMime;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * ჩანაწერების მოდული (`note`).
 *
 * მფლობელობა — `BelongsToUser` global scope (სხვისი ჩანაწერი 404), უფლებები —
 * `permission:note` middleware. გარე წყარო **არ არსებობს**: ეს user-ის
 * საკუთარი ინფორმაციაა, ე.ი. არც lookup-ი და არც enrichment არაა.
 */
class NoteEntryController extends Controller
{
    use ReordersRecords;

    public function __construct(private StorageMeter $meter) {}

    public function index(Request $request)
    {
        $query = NoteEntry::query()->with('category')->withCount(['files', 'reminders']);
        // სტატისტიკის ზოლიდან მოსული ჭრილი (თვე, წელი, შენი ქულა)
        LibraryStats::drill($query, 'note', $request);

        // სტატუსი per-user ლექსიკონია; ფილტრი გასაღებით რჩება
        foreach ($this->slugList($request->string('status')->toString()) as $key) {
            $query->statusKey($key);
        }
        if ($request->boolean('favorite')) {
            $query->where('is_favorite', true);
        }
        // კატეგორიები/ტეგები — მძიმით გამოყოფილი სია
        if ($categories = $this->slugList($request->string('category_id')->toString())) {
            $query->whereIn('category_id', array_map('intval', $categories));
        }
        foreach ($this->slugList($request->string('tag')->toString()) as $tag) {
            $query->whereJsonContains('tags', $tag);
        }

        if ($q = $request->string('q')->toString()) {
            $query->where(fn ($inner) => $inner
                ->where('title', 'like', Like::contains($q))
                ->orWhere(fn ($words) => RichText::whereWords($words, 'description', $q)) // ფორმატის გარეშე
                ->orWhere('tags', 'like', Like::contains($q))
                ->orWhere('links', 'like', Like::contains($q)));
        }

        match ($request->string('sort')->toString()) {
            'title' => $query->orderBy('title'),
            'updated' => $query->orderByDesc('updated_at'),
            'oldest' => $query->orderBy('id'),
            // ხელით დალაგებული რიგი (`HasManualOrder`) — სია მაშინ ერთ გვერდად იშლება
            'manual' => $query->manualOrder(),
            default => $query->orderByDesc('id'),
        };

        return NoteEntryResource::collection($this->paginated($request, $query));
    }

    public function show(NoteEntry $note)
    {
        return new NoteEntryResource(
            $note->load(['category', 'reminders'])->loadCount(['files', 'reminders']),
        );
    }

    public function store(Request $request)
    {
        $entry = new NoteEntry;
        $this->apply($entry, $request, $this->validated($request));
        $entry->save();

        return (new NoteEntryResource($entry->refresh()->load('category')))
            ->response()->setStatusCode(201);
    }

    public function update(Request $request, NoteEntry $note)
    {
        $this->apply($note, $request, $this->validated($request, $note));
        $note->save();

        return new NoteEntryResource(
            $note->load(['category', 'reminders'])->loadCount(['files', 'reminders']),
        );
    }

    /**
     * **მთავარი ფოტო.** ფაილი პრივატულ დისკზეა (`notes/photos`), ე.ი. `/storage/…`-ით
     * არ იხსნება: გაიცემა მხოლოდ აქედან, მფლობელს (`owner` scope → სხვისი 404),
     * `SafeMime`-ის სათაურებით.
     */
    public function photo(NoteEntry $note)
    {
        abort_unless(is_string($note->photo_path) && $note->photo_path !== '', 404);

        $disk = Storage::disk(StorageFolder::diskFor($note->photo_path));

        abort_unless($disk->fileExists($note->photo_path), 404);

        return SafeMime::response($disk, $note->photo_path, basename($note->photo_path));
    }

    public function destroy(NoteEntry $note)
    {
        /* ⚠️ **კალათა** — `delete()` კი არა, `moveToTrash()`.
           ჩანაწერი სიიდან ქრება, მაგრამ ბაზაში რჩება: ფაილები, ჩანიშვნები,
           გალერეა და კვოტა **არ** თავისუფლდება, ე.ი. აღდგენა უფასოა.
           ნამდვილი წაშლა სამ ადგილას ხდება — კალათიდან, `/purge`-იდან და
           ვადის (`UserSettings::trashDays()`) ამოწურვისას. */
        $note->moveToTrash();

        return response()->noContent();
    }

    /** ხელით გადალაგება: მოწოდებული ჩანაწერები ახალ რიგზე დგება (`ReordersRecords`) */
    public function reorder(Request $request)
    {
        return $this->reorderRecords($request, NoteEntry::class);
    }

    public function toggleFavorite(NoteEntry $note)
    {
        $note->is_favorite = ! $note->is_favorite;
        $note->save();

        return new NoteEntryResource($note->load('category'));
    }

    /** სტატუსი ცალკე endpoint-ია — ბარათიდან ერთი კლიკია (მედიის ანალოგი) */
    public function setStatus(Request $request, NoteEntry $note)
    {
        $data = $request->validate([
            'status' => ['required', 'string', Status::rule('note')],
        ]);

        $note->applyStatusKey($data['status']);
        $note->save();

        return new NoteEntryResource($note->load('category'));
    }

    /* ---------- დამხმარეები ---------- */

    private function validated(Request $request, ?NoteEntry $entry = null): array
    {
        $userId = $request->user()->id;

        // ⚠️ სტატუსი და ტიპი სავალდებულოა — ჩანაწერი ვერცერთის გარეშე ვერ შეინახება.
        // რედაქტირებისას `sometimes`: თუ ველი საერთოდ არ გამოიგზავნა, ძველი
        // მნიშვნელობა რჩება (შექმნისას სავალდებულო იყო) — მაგრამ ცარიელს ვეღარ გაგზავნი.
        $must = $entry ? ['sometimes', 'required'] : ['required'];

        return $request->validate([
            'title' => [$entry ? 'sometimes' : 'required', 'string', 'max:255'],
            'description' => RichText::rules(),
            'category_id' => [
                ...$must, 'integer',
                Rule::exists('note_categories', 'id')->whereNull('trashed_at')->where('user_id', $userId),
            ],
            'tags' => ['nullable', 'array', 'max:20'],
            'tags.*' => ['string', 'max:60'],

            // რამდენიმე ბმული
            'links' => ['nullable', 'array', 'max:20'],
            'links.*.label' => ['nullable', 'string', 'max:60'],
            'links.*.url' => ['required_with:links', 'string', 'max:1000', 'url'],

            'status' => [...$must, 'string', Status::rule('note')],
            'is_favorite' => ['nullable', 'boolean'],

            // იერი: აიქონი, ფონის ფერი (პალიტრის გასაღები ან `#rrggbb` — სტატუსის წესი) და მთავარი ფოტო
            'icon' => ['nullable', 'string', 'max:60'],
            'color' => ['nullable', 'string', 'max:20', 'regex:/^(c([1-9]|1[0-2])|#[0-9a-fA-F]{6})$/'],
            'photo' => ['nullable', ...UploadLimits::rule('primary', $request->user())],
            'remove_photo' => ['nullable', 'boolean'],
            // ⚠️ `public` აქაც დაშვებულია სქემის დონეზე, მაგრამ ეს მოდული
            // საჯარო პროფილზე მაინც არ ჩანს — ეს განზრახაა
            'visibility' => ['nullable', Rule::in(['private', 'public'])],
        ]);
    }

    private function apply(NoteEntry $entry, Request $request, array $data): void
    {
        foreach (['title', 'description'] as $field) {
            if (array_key_exists($field, $data)) {
                $entry->{$field} = $data[$field] ?: null;
            }
        }

        if (array_key_exists('category_id', $data)) {
            $entry->category_id = $data['category_id'] ?: null;
        }
        if (! empty($data['status'])) {
            $entry->applyStatusKey($data['status']);
        }
        if (! empty($data['visibility'])) {
            $entry->visibility = $data['visibility'];
        }
        if (array_key_exists('tags', $data)) {
            $entry->tags = NoteEntry::normalizeTags($data['tags'] ?? []);
        }
        if (array_key_exists('links', $data)) {
            $entry->links = array_values(array_map(fn (array $link) => [
                'label' => $link['label'] ?? null,
                'url' => $link['url'],
            ], $data['links'] ?? []));
        }
        if ($request->has('is_favorite')) {
            $entry->is_favorite = $request->boolean('is_favorite');
        }

        foreach (['icon', 'color'] as $field) {
            if (array_key_exists($field, $data)) {
                $entry->{$field} = $data[$field] ?: null;
            }
        }

        if ($request->boolean('remove_photo')) {
            // ⚠️ ურნა — ფაილი დისკზე და კვოტაში რჩება, სანამ ურნიდან საბოლოოდ არ წაიშლება
            ColumnTrash::capture($entry, 'photo_path');
            $entry->photo_path = null;
        }

        if ($request->hasFile('photo')) {
            // ⚠️ ჯერ ახალი ფაილი: 413-ზე (კვოტა) ძველი ხელუხლებელი რჩება და ურნაში არ ხვდება
            $stored = $this->meter->storeUpload($request->user(), $request->file('photo'), StorageFolder::NOTE_PHOTOS);
            ColumnTrash::capture($entry, 'photo_path');
            $entry->photo_path = $stored;
        }
    }
}
