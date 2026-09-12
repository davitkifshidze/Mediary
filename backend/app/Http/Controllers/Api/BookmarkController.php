<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookmarkResource;
use App\Models\Bookmark;
use App\Models\Status;
use App\Services\Bookmarks\LinkMetadata;
use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * ბუკმარკების მოდული (`bookmark`, Tasks §18).
 *
 * მფლობელობა — `BelongsToUser` global scope (სხვისი ჩანაწერი 404), უფლებები —
 * `permission:bookmark` middleware.
 *
 * ⚠️ **გამამდიდრებელი წყარო არ არსებობს.** კანდიდატების სია (TMDB/RAWG-ის
 * ნაკადი) აქ უაზროა — ბმული ერთია და ცნობილი. ერთადერთი probe
 * `POST /bookmarks/metadata`-ა, რომელიც თვითონ გვერდს კითხულობს.
 */
class BookmarkController extends Controller
{
    public function __construct(private StorageMeter $meter) {}

    public function index(Request $request)
    {
        $query = Bookmark::query()->with('category');

        // §6.4 — სტატუსი per-user ლექსიკონია; ფილტრი გასაღებით რჩება
        foreach ($this->slugList($request->string('status')->toString()) as $key) {
            $query->statusKey($key);
        }
        if ($request->boolean('favorite')) {
            $query->where('is_favorite', true);
        }

        // კატეგორიები/ტეგები — მძიმით გამოყოფილი სია (5.2-ის წესი).
        // ⚠️ კატეგორია **სვეტია** (ერთია ჩანაწერზე), ე.ი. `whereIn` და არა
        // `whereHas`: მრავალი კატეგორია ერთ ჩანაწერზე ვერ იქნება, ამიტომ
        // მათი AND-ით კვეთა ყოველთვის ცარიელ სიას მოგვცემდა.
        if ($categories = $this->slugList($request->string('category_id')->toString())) {
            $query->whereIn('category_id', array_map('intval', $categories));
        }
        foreach ($this->slugList($request->string('tag')->toString()) as $tag) {
            $query->whereJsonContains('tags', $tag);
        }
        if ($domain = $request->string('domain')->toString()) {
            $query->where('domain', $domain);
        }

        if ($q = $request->string('q')->toString()) {
            $query->where(fn (Builder $inner) => $inner
                ->where('title', 'like', "%{$q}%")
                ->orWhere('description', 'like', "%{$q}%")
                ->orWhere('url', 'like', "%{$q}%")
                ->orWhere('domain', 'like', "%{$q}%")
                ->orWhere('tags', 'like', "%{$q}%"));
        }

        match ($request->string('sort')->toString()) {
            'title' => $query->orderBy('title'),
            'domain' => $query->orderBy('domain')->orderBy('title'),
            'oldest' => $query->orderBy('id'),
            'visited' => $query->orderByDesc('visited_at'),
            'visits' => $query->orderByDesc('visit_count'),
            default => $query->orderByDesc('id'),
        };

        return BookmarkResource::collection($this->paginated($request, $query));
    }

    public function show(Bookmark $bookmark)
    {
        return new BookmarkResource($bookmark->load('category'));
    }

    /**
     * გვერდის მეტამონაცემი ფორმის შესავსებად — ჩანაწერს არ ქმნის.
     * ⚠️ ჩავარდნა 200-ია ცარიელი ველებით და არა 5xx: გვერდის დახურვა
     * (403/timeout) ჩვეულებრივი ამბავია და ხელით შევსებას არ უნდა უშლიდეს.
     */
    public function metadata(Request $request, LinkMetadata $meta)
    {
        $data = $request->validate(['url' => ['required', 'string', 'max:1000', 'url']]);

        return response()->json($meta->fetch($data['url']));
    }

    public function store(Request $request)
    {
        $bookmark = new Bookmark;
        $this->apply($bookmark, $request, $this->validated($request));
        $bookmark->save();

        // ბაზის default-ები (is_favorite/visit_count) მოდელზე ჯერ არ ასახულა
        return (new BookmarkResource($bookmark->refresh()->load('category')))
            ->response()->setStatusCode(201);
    }

    public function update(Request $request, Bookmark $bookmark)
    {
        $this->apply($bookmark, $request, $this->validated($request, $bookmark));
        $bookmark->save();

        return new BookmarkResource($bookmark->load('category'));
    }

    public function destroy(Bookmark $bookmark)
    {
        // ⚠️ თამბნეილს `Bookmark::booted()` შლის — იხ. `Song::booted()`
        $bookmark->delete();

        return response()->noContent();
    }

    public function toggleFavorite(Bookmark $bookmark)
    {
        $bookmark->is_favorite = ! $bookmark->is_favorite;
        $bookmark->save();

        return new BookmarkResource($bookmark->load('category'));
    }

    /** სტატუსი ცალკე endpoint-ია — ბარათიდან ერთი კლიკია (მედიის ანალოგი) */
    public function setStatus(Request $request, Bookmark $bookmark)
    {
        $data = $request->validate([
            'status' => ['required', 'string', Status::rule('bookmark')],
        ]);

        $bookmark->applyStatusKey($data['status']);
        $bookmark->save();

        return new BookmarkResource($bookmark->load('category'));
    }

    /** „გავხსენი" — მთვლელი + თარიღი (სიმღერის `played`-ის ანალოგი) */
    public function markVisited(Bookmark $bookmark)
    {
        $bookmark->forceFill([
            'visit_count' => $bookmark->visit_count + 1,
            'visited_at' => now(),
        ])->save();

        return new BookmarkResource($bookmark->load('category'));
    }

    /* ---------- დამხმარეები ---------- */

    private function validated(Request $request, ?Bookmark $bookmark = null): array
    {
        return $request->validate([
            // სათაური არასავალდებულოა — ცარიელზე გვერდიდან წამოვა
            'title' => ['nullable', 'string', 'max:255'],
            'url' => [$bookmark ? 'sometimes' : 'required', 'string', 'max:1000', 'url'],
            'description' => ['nullable', 'string', 'max:5000'],
            // კატეგორია მხოლოდ **საკუთარი** ლექსიკონიდან
            'category_id' => [
                'nullable',
                'integer',
                Rule::exists('bookmark_categories', 'id')->where('user_id', $request->user()->id),
            ],
            'tags' => ['nullable', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],
            'status' => ['nullable', 'string', Status::rule('bookmark')],
            'is_favorite' => ['nullable', 'boolean'],
            'visibility' => ['nullable', Rule::in(['private', 'public'])],
            'image_url' => ['nullable', 'string', 'max:1000', 'url'],
            'favicon_url' => ['nullable', 'string', 'max:500', 'url'],
            'thumbnail' => ['nullable', 'image', 'max:4096'],
            'remove_thumbnail' => ['nullable', 'boolean'],
        ]);
    }

    private function apply(Bookmark $bookmark, Request $request, array $data): void
    {
        foreach (['title', 'description', 'image_url', 'favicon_url'] as $field) {
            if (array_key_exists($field, $data)) {
                $bookmark->{$field} = $data[$field] ?: null;
            }
        }
        if (array_key_exists('category_id', $data)) {
            $bookmark->category_id = $data['category_id'] ?: null;
        }
        if (! empty($data['status'])) {
            $bookmark->applyStatusKey($data['status']);
        }
        if (! empty($data['visibility'])) {
            $bookmark->visibility = $data['visibility'];
        }
        if (array_key_exists('tags', $data)) {
            $bookmark->tags = Bookmark::normalizeTags($data['tags'] ?? []);
        }
        if ($request->has('is_favorite')) {
            $bookmark->is_favorite = $request->boolean('is_favorite');
        }

        if (array_key_exists('url', $data)) {
            $changed = $bookmark->url !== $data['url'];
            // ⚠️ `domain` მხოლოდ აქედან იწერება
            $bookmark->applyUrl($data['url']);

            if ($changed) {
                $this->autofill($bookmark, $request);
            }
        }

        if ($request->boolean('remove_thumbnail')) {
            $bookmark->deleteThumbnail();
            $bookmark->thumbnail_path = null;
        }

        if ($request->hasFile('thumbnail')) {
            // 17.3 — `storeUpload()` ატვირთვამდე ამოწმებს კვოტას (ამოწურვაზე 413)
            $bookmark->deleteThumbnail();
            $bookmark->thumbnail_path = $this->meter
                ->storeUpload($request->user(), $request->file('thumbnail'), StorageFolder::BOOKMARK_THUMBNAILS);
        }
    }

    /**
     * ცარიელი ველების შევსება გვერდიდან. არასდროს გადააწერს იმას, რაც
     * user-მა შეავსო; ჩავარდნაზე ჩუმად გადის. `autofill=0`-ით გამორთვადია.
     */
    private function autofill(Bookmark $bookmark, Request $request): void
    {
        if (! $request->boolean('autofill', true)) {
            return;
        }

        $needs = ! $bookmark->title || ! $bookmark->description || ! $bookmark->image_url;
        if (! $needs) {
            return;
        }

        $meta = app(LinkMetadata::class)->fetch($bookmark->url);

        if (! $bookmark->title) {
            $bookmark->title = $meta['title'] ?: $bookmark->domain ?: $bookmark->url;
        }
        if (! $bookmark->description && $meta['description']) {
            $bookmark->description = $meta['description'];
        }
        if (! $bookmark->thumbnail_path && ! $bookmark->image_url && $meta['image_url']) {
            $bookmark->image_url = $meta['image_url'];
        }
        if (! $bookmark->favicon_url && $meta['favicon_url']) {
            $bookmark->favicon_url = $meta['favicon_url'];
        }
    }
}
