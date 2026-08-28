<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoResource;
use App\Models\Video;
use App\Services\Video\VideoMetadata;
use App\Support\VideoUrl;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * ვიდეოს მოდული (I5).
 *
 * მფლობელობა — `BelongsToUser` global scope (სხვისი ჩანაწერი 404).
 * adult ჩანაწერი დამატებით `video_adult` მოდულს მოითხოვს: მისი გარეშე
 * არც ჩანს (scopeVisibleTo) და არც იქმნება.
 */
class VideoController extends Controller
{
    public function index(Request $request)
    {
        $query = Video::query()
            ->visibleTo($request->user())
            ->withCount(['images', 'documents', 'notes']);

        if ($q = $request->string('q')->toString()) {
            $query->where(fn ($w) => $w->where('title', 'like', "%{$q}%")
                ->orWhere('description', 'like', "%{$q}%"));
        }
        if ($platform = $request->string('platform')->toString()) {
            $query->where('platform', $platform);
        }
        if ($request->boolean('favorite')) {
            $query->where('is_favorite', true);
        }
        if ($tag = $request->string('tag')->toString()) {
            $query->whereJsonContains('tags', $tag);
        }
        // ტიპი — საიდბარის სექციები „მედია" / „ინფორმაციული" (K7)
        if ($kind = $request->string('kind')->toString()) {
            $query->where('kind', $kind);
        }
        // „მხოლოდ 18+" — ცალკე ჩვენება იმისთვის, ვისაც მოდული აქვს
        if ($request->boolean('adult_only')) {
            $query->where('is_adult', true);
        }

        match ($request->string('sort')->toString()) {
            'title' => $query->orderBy('title'),
            'oldest' => $query->orderBy('id'),
            'watched' => $query->orderByDesc('watched_at'),
            default => $query->orderByDesc('id'),
        };

        return VideoResource::collection($query->get());
    }

    public function show(Request $request, Video $video)
    {
        $this->assertVisible($request, $video);

        return new VideoResource($video);
    }

    /**
     * ბმულის მეტამონაცემი — ფორმა ამით ივსება ჩასმისთანავე (Tasks K2).
     * ჩანაწერს არ ქმნის.
     */
    public function metadata(Request $request, VideoMetadata $meta)
    {
        $data = $request->validate(['url' => ['required', 'string', 'max:1000', 'url']]);

        return response()->json($meta->fetch($data['url']) + [
            'youtube_key' => $meta->hasYoutubeKey(),
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $video = new Video;
        $this->apply($video, $request, $data);
        $video->save();

        // ბაზის default-ები (is_adult/is_favorite/watch_count) მოდელზე ჯერ არ ასახულა
        return (new VideoResource($video->refresh()))->response()->setStatusCode(201);
    }

    public function update(Request $request, Video $video)
    {
        $this->assertVisible($request, $video);
        $data = $this->validated($request, $video);

        $this->apply($video, $request, $data);
        $video->save();

        return new VideoResource($video);
    }

    public function destroy(Request $request, Video $video)
    {
        $this->assertVisible($request, $video);
        $video->deleteThumbnail();
        $video->delete();

        return response()->noContent();
    }

    /** რჩეულის გადართვა */
    public function toggleFavorite(Request $request, Video $video)
    {
        $this->assertVisible($request, $video);
        $video->is_favorite = ! $video->is_favorite;
        $video->save();

        return new VideoResource($video);
    }

    /** „ვნახე" — მთვლელი + თარიღი */
    public function markWatched(Request $request, Video $video)
    {
        $this->assertVisible($request, $video);
        $video->forceFill([
            'watch_count' => $video->watch_count + 1,
            'watched_at' => now(),
        ])->save();

        return new VideoResource($video);
    }

    /**
     * private thumbnail-ის გაცემა (adult) — `/storage/*` ავტორიზაციას არ ამოწმებს,
     * ამიტომ sensitive ფაილი მხოლოდ ამ route-იდან გადის.
     */
    public function thumb(Request $request, Video $video)
    {
        $this->assertVisible($request, $video);

        abort_unless($video->thumbnail_path, 404);

        $disk = Storage::disk($video->thumbnailDisk());
        abort_unless($disk->exists($video->thumbnail_path), 404);

        return $disk->response($video->thumbnail_path);
    }

    /* ---------- დამხმარეები ---------- */

    private function validated(Request $request, ?Video $video = null): array
    {
        return $request->validate([
            // სათაური არასავალდებულოა — ცარიელზე ბმულიდან წამოვა (K2)
            'title' => ['nullable', 'string', 'max:255'],
            'url' => [$video ? 'sometimes' : 'required', 'string', 'max:1000', 'url'],
            'description' => ['nullable', 'string', 'max:5000'],
            'kind' => ['nullable', 'in:media,info'],
            'duration' => ['nullable', 'integer', 'min:0', 'max:864000'],
            'tags' => ['nullable', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],
            'is_adult' => ['nullable', 'boolean'],
            'is_favorite' => ['nullable', 'boolean'],
            'thumbnail' => ['nullable', 'image', 'max:4096'],
            'remove_thumbnail' => ['nullable', 'boolean'],
        ]);
    }

    private function apply(Video $video, Request $request, array $data): void
    {
        foreach (['title', 'description', 'duration'] as $field) {
            if (array_key_exists($field, $data)) {
                $video->{$field} = $data[$field] ?: null;
            }
        }
        if (! empty($data['kind'])) {
            $video->kind = $data['kind'];
        }
        if (array_key_exists('tags', $data)) {
            $video->tags = array_values(array_filter(array_map('trim', $data['tags'] ?? [])));
        }
        if ($request->has('is_favorite')) {
            $video->is_favorite = $request->boolean('is_favorite');
        }

        if ($request->has('is_adult')) {
            $adult = $request->boolean('is_adult');
            // adult ჩანაწერს მხოლოდ `video_adult` მოდულის მქონე ქმნის/ნიშნავს
            abort_if($adult && ! $request->user()->hasModule('video_adult'), 403, 'adult_module_required');
            $video->is_adult = $adult;
        }

        if (array_key_exists('url', $data)) {
            $urlChanged = $video->url !== $data['url'];
            $video->url = $data['url'];

            // ბმულიდან რაც მოდის: ჯერ ლოკალური ამოცნობა (მყისიერი), მერე —
            // მხოლოდ ცარიელი ველებისთვის — oEmbed/API (K2)
            $parsed = VideoUrl::parse($data['url']);
            $video->platform = $parsed['platform'];
            $video->external_id = $parsed['external_id'];
            $video->embed_url = $parsed['embed_url'];
            if (! $video->thumbnail_path) {
                $video->thumbnail_url = $parsed['thumbnail_url'];
            }

            if ($urlChanged) {
                $this->autofill($video, $request);
            }
        }

        if ($request->boolean('remove_thumbnail')) {
            $video->deleteThumbnail();
            $video->thumbnail_path = null;
            $video->thumbnail_disk = null;
        }

        if ($request->hasFile('thumbnail')) {
            $video->deleteThumbnail();
            // sensitive ჩანაწერის ფაილი private დისკზე (storage/app/private)
            $disk = $video->is_adult ? 'local' : 'public';
            $video->thumbnail_path = $request->file('thumbnail')->store('videos', $disk);
            $video->thumbnail_disk = $disk;
            $video->thumbnail_url = null;
        }
    }

    /**
     * ცარიელი ველების შევსება ბმულიდან (K2). არასდროს გადააწერს იმას, რაც
     * მომხმარებელმა შეავსო; ჩავარდნაზე ჩუმად გადის (`VideoMetadata` თვითონ ლოგავს).
     * `autofill=0`-ით გამორთვადია.
     */
    private function autofill(Video $video, Request $request): void
    {
        if (! $request->boolean('autofill', true)) {
            return;
        }

        $needsTitle = ! $video->title;
        $needsRest = ! $video->description || ! $video->duration || ! $video->tags || ! $video->thumbnail_url;
        if (! $needsTitle && ! $needsRest) {
            return;
        }

        $meta = app(VideoMetadata::class)->fetch($video->url);

        if ($needsTitle) {
            $video->title = $meta['title'] ?: parse_url($video->url, PHP_URL_HOST) ?: $video->url;
        }
        if (! $video->description && $meta['description']) {
            $video->description = $meta['description'];
        }
        if (! $video->duration && $meta['duration']) {
            $video->duration = $meta['duration'];
        }
        if (! $video->tags && $meta['tags']) {
            $video->tags = $meta['tags'];
        }
        if (! $video->thumbnail_path && ! $video->thumbnail_url && $meta['thumbnail_url']) {
            $video->thumbnail_url = $meta['thumbnail_url'];
        }
    }

    /** adult ჩანაწერი მოდულის გარეშე — 404 (არსებობაც არ უნდა გამჟღავნდეს) */
    private function assertVisible(Request $request, Video $video): void
    {
        abort_if($video->is_adult && ! $request->user()->hasModule('video_adult'), 404);
    }
}
