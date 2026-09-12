<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\NoteEntryResource;
use App\Models\NoteEntry;
use App\Models\Status;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * ჩანაწერების მოდული (`note`, Tasks §13).
 *
 * მფლობელობა — `BelongsToUser` global scope (სხვისი ჩანაწერი 404), უფლებები —
 * `permission:note` middleware. გარე წყარო **არ არსებობს**: ეს user-ის
 * საკუთარი ინფორმაციაა, ე.ი. არც lookup-ი და არც enrichment არაა.
 */
class NoteEntryController extends Controller
{
    public function index(Request $request)
    {
        $query = NoteEntry::query()->with('category')->withCount(['files', 'reminders']);

        // §6.4 — სტატუსი per-user ლექსიკონია; ფილტრი გასაღებით რჩება
        foreach ($this->slugList($request->string('status')->toString()) as $key) {
            $query->statusKey($key);
        }
        if ($request->boolean('favorite')) {
            $query->where('is_favorite', true);
        }
        // კატეგორიები/ტეგები — მძიმით გამოყოფილი სია (5.2-ის წესი)
        if ($categories = $this->slugList($request->string('category_id')->toString())) {
            $query->whereIn('category_id', array_map('intval', $categories));
        }
        foreach ($this->slugList($request->string('tag')->toString()) as $tag) {
            $query->whereJsonContains('tags', $tag);
        }

        // „რა მელოდება" — ვადიანი ჩანაწერები (§13.1-ის deadline)
        if ($request->boolean('due')) {
            $query->whereNotNull('due_at');
        }
        if ($request->boolean('overdue')) {
            /* ⚠️ „ვადაგადაცილებული" **როლით** იჭრება და არა `open` სახელით
               (§6.4): სტატუსი გადაერქმევა, მნიშვნელობა კი `role`-შია. */
            $query->whereNotNull('due_at')->where('due_at', '<', now())->statusRole('todo');
        }

        if ($q = $request->string('q')->toString()) {
            $query->where(fn ($inner) => $inner
                ->where('title', 'like', "%{$q}%")
                ->orWhere('description', 'like', "%{$q}%")
                ->orWhere('tags', 'like', "%{$q}%")
                ->orWhere('links', 'like', "%{$q}%"));
        }

        match ($request->string('sort')->toString()) {
            'title' => $query->orderBy('title'),
            // ⚠️ ვადის გარეშე ჩანაწერები **ბოლოში** — თორემ NULL-ები წინ ამოვიდოდა
            'due' => $query->orderByRaw('due_at is null')->orderBy('due_at'),
            'updated' => $query->orderByDesc('updated_at'),
            'oldest' => $query->orderBy('id'),
            default => $query->orderByDesc('id'),
        };

        return NoteEntryResource::collection($query->get());
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

    public function destroy(NoteEntry $note)
    {
        // ფაილებს `NoteEntry::booted()` შლის — კვოტაც იქვე თავისუფლდება
        $note->delete();

        return response()->noContent();
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

        return $request->validate([
            'title' => [$entry ? 'sometimes' : 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:20000'],
            'category_id' => [
                'nullable', 'integer',
                Rule::exists('note_categories', 'id')->where('user_id', $userId),
            ],
            'tags' => ['nullable', 'array', 'max:20'],
            'tags.*' => ['string', 'max:60'],

            // რამდენიმე ბმული (§13.1)
            'links' => ['nullable', 'array', 'max:20'],
            'links.*.label' => ['nullable', 'string', 'max:60'],
            'links.*.url' => ['required_with:links', 'string', 'max:1000', 'url'],

            'due_at' => ['nullable', 'date'],
            'status' => ['nullable', 'string', Status::rule('note')],
            'is_favorite' => ['nullable', 'boolean'],
            // ⚠️ `public` აქაც დაშვებულია სქემის დონეზე, მაგრამ 16.1-ის მიხედვით
            // ეს მოდული საჯარო პროფილზე მაინც არ ჩანს — ეს განზრახაა
            'visibility' => ['nullable', Rule::in(['private', 'public'])],
        ]);
    }

    private function apply(NoteEntry $entry, Request $request, array $data): void
    {
        foreach (['title', 'description', 'due_at'] as $field) {
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
    }
}
