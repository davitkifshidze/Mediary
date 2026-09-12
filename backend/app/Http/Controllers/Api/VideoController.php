<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoResource;
use App\Models\Status;
use App\Models\Video;
use App\Services\Storage\StorageMeter;
use App\Services\Video\VideoMetadata;
use App\Services\Video\VideoSearch;
use App\Support\StorageFolder;
use App\Support\VideoUrl;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * ვიდეოს მოდული (I5).
 *
 * მფლობელობა — `BelongsToUser` global scope (სხვისი ჩანაწერი 404).
 */
class VideoController extends Controller
{
    public function __construct(private StorageMeter $meter) {}

    public function index(Request $request, VideoSearch $search)
    {
        $query = Video::query()
            ->with('type')
            ->withCount(['images', 'documents', 'notes']);

        if ($platform = $request->string('platform')->toString()) {
            $query->where('platform', $platform);
        }
        if ($request->boolean('favorite')) {
            $query->where('is_favorite', true);
        }
        /* §7.1 — „ჩამოწერილები" ცალკე სექციაა.
           ⚠️ პირობა `download_status`-ზეა და არა `download_path`-ზე: მიმდინარე
           ჩამოწერას ჯერ გზა არ აქვს, სექციაში კი უნდა ჩანდეს — თორემ ღილაკზე
           დაჭერის შემდეგ ვიდეო სიიდან ქრებოდა და „სად წავიდა" ისმებოდა. */
        if ($request->boolean('downloaded')) {
            $query->whereIn('download_status', [Video::DOWNLOAD_READY, Video::DOWNLOAD_RUNNING]);
        }
        // ტეგები — მძიმით გამოყოფილი სია; თითოეული ცალკე პირობაა, ე.ი. ფილტრი ვიწროვდება (5.2)
        foreach ($this->slugList($request->string('tag')->toString()) as $tag) {
            $query->whereJsonContains('tags', $tag);
        }
        // ტიპი — საიდბარის სექციები მართვადი ლექსიკონიდან (Tasks 5.1);
        // მძიმით გამოყოფილი სია ფილტრების პანელს ემსახურება (5.2)
        if ($types = $this->slugList($request->string('type_id')->toString())) {
            $query->whereIn('type_id', array_map('intval', $types));
        }
        /* §6.4 — სტატუსი: ამ მოდულს ის ახლა გაუჩნდა. საიდბარის სექციაც
           `?status=<key>`-ით მოდის, ე.ი. ფილმის/სერიალის იგივე ნიმუშია. */
        foreach ($this->slugList($request->string('status')->toString()) as $key) {
            $query->statusKey($key);
        }
        match ($request->string('sort')->toString()) {
            'title' => $query->orderBy('title'),
            'oldest' => $query->orderBy('id'),
            'watched' => $query->orderByDesc('watched_at'),
            default => $query->orderByDesc('id'),
        };

        // ძებნა ბოლოს: ყველა ველზე + „ახლო სიტყვებზე", relevance-ით დალაგებული (K4).
        // თანაბარ relevance-ზე არჩეული სორტირება რჩება ძალაში.
        $q = $request->string('q')->toString();

        return VideoResource::collection($this->paginated(
            $request,
            $q === '' ? $query : $search->search($query, $q),
        ));
    }

    /**
     * „მსგავსი ვიდეოები" (K4) — მხოლოდ **ჩემი ბიბლიოთეკიდან**: საერთო ტეგები,
     * სათაურის მსგავსება, იგივე პლატფორმა/ტიპი. (YouTube-ის related API გაუქმებულია.)
     */
    public function similar(Video $video, VideoSearch $search)
    {
        $base = Video::query()
            ->whereKeyNot($video->getKey())
            ->with('type')
            ->withCount(['images', 'documents', 'notes']);

        return VideoResource::collection($search->similar($base, $video));
    }

    public function show(Video $video)
    {
        return new VideoResource($video->load('type'));
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

        // ბაზის default-ები (is_favorite/watch_count) მოდელზე ჯერ არ ასახულა
        return (new VideoResource($video->refresh()->load('type')))->response()->setStatusCode(201);
    }

    public function update(Request $request, Video $video)
    {
        $data = $this->validated($request, $video);

        $this->apply($video, $request, $data);
        $video->save();

        return new VideoResource($video->load('type'));
    }

    public function destroy(Video $video)
    {
        // ⚠️ თამბნეილს `Video::booted()` შლის — ერთი წყარო, რომელიც
        // მასობრივ წაშლაზეც (Tasks 20) მუშაობს
        $video->delete();

        return response()->noContent();
    }

    /** რჩეულის გადართვა */
    public function toggleFavorite(Video $video)
    {
        $video->is_favorite = ! $video->is_favorite;
        $video->save();

        return new VideoResource($video->load('type'));
    }

    /** „ვნახე" — მთვლელი + თარიღი */
    public function markWatched(Video $video)
    {
        $video->forceFill([
            'watch_count' => $video->watch_count + 1,
            'watched_at' => now(),
        ])->save();

        return new VideoResource($video->load('type'));
    }

    /* ---------- დამხმარეები ---------- */

    private function validated(Request $request, ?Video $video = null): array
    {
        return $request->validate([
            // სათაური არასავალდებულოა — ცარიელზე ბმულიდან წამოვა (K2)
            'title' => ['nullable', 'string', 'max:255'],
            'url' => [$video ? 'sometimes' : 'required', 'string', 'max:1000', 'url'],
            'description' => ['nullable', 'string', 'max:5000'],
            // ტიპი მხოლოდ **საკუთარი** ლექსიკონიდან (5.1)
            'type_id' => [
                'nullable',
                'integer',
                Rule::exists('video_types', 'id')->where('user_id', $request->user()->id),
            ],
            // §6.4 — სტატუსი **საკუთარი** ლექსიკონიდან, ტიპის ზუსტი ანალოგი
            'status' => ['nullable', 'string', Status::rule('video')],
            'visibility' => ['nullable', Rule::in(['private', 'public'])],
            'duration' => ['nullable', 'integer', 'min:0', 'max:864000'],
            'tags' => ['nullable', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],
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
        if (array_key_exists('type_id', $data)) {
            $video->type_id = $data['type_id'] ?: null;
        }
        if (! empty($data['status'])) {
            $video->applyStatusKey($data['status']);
        }
        if (! empty($data['visibility'])) {
            $video->visibility = $data['visibility'];
        }
        if (array_key_exists('tags', $data)) {
            // დუბლის მოჭრა (Tasks 5.3) — ერთი წყარო მოდელზეა, bulk-იც იმას იყენებს
            $video->tags = Video::normalizeTags($data['tags'] ?? []);
        }
        if ($request->has('is_favorite')) {
            $video->is_favorite = $request->boolean('is_favorite');
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
        }

        if ($request->hasFile('thumbnail')) {
            // 17.3 — `storeUpload()` ატვირთვამდე ამოწმებს კვოტას (ამოწურვაზე 413)
            $video->deleteThumbnail();
            $video->thumbnail_path = $this->meter
                ->storeUpload($request->user(), $request->file('thumbnail'), StorageFolder::VIDEO_THUMBNAILS);
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
}
