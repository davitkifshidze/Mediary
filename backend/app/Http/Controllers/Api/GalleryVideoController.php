<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\GalleryVideoResource;
use App\Models\GalleryVideo;
use App\Services\Serp\SerpApiClient;
use App\Support\GalleryParent;
use App\Support\Like;
use App\Support\RecordTitle;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * **ვიდეო-ბმულები გალერეაში.**
 *
 * მოთხოვნა: „დაამატე მსახიობებზე ვიდეო სერჩი — ვიდეოს ლინკები, ან სადაც
 * ვიდეო დევს, იმის ლინკები და თამბნეილები".
 *
 * ⚠️ **ძებნა უკვე არსებობდა** (`GET /api/web/videos`, SerpApi-ის `youtube`
 * და `yandex_videos`), მაგრამ **ერთი გამომძახებელიც არ ჰყავდა**: ნაპოვნის
 * შენახვის ადგილი აკლდა. ეს კონტროლერი სწორედ ის ადგილია.
 *
 * ⚠️ **არაფერი ჩამოიწერება.** ვიდეო ბმულია და თამბნეილი დაშორებული URL —
 * ე.ი. კვოტა არ იხარჯება (ბუკმარკის `og:image`-ის წესი). სწორედ ამიტომ
 * აქ `StorageMeter` საერთოდ არ ერევა.
 *
 * ⚠️ **HTML/embed კოდი არასდროს ინახება**: ვწერთ URL-ს, `platform`/`embed_url`
 * კი `VideoUrl`-ის allowlist-იდან გამოითვლება (`GalleryVideo::applyUrl()`).
 *
 * ⚠️ **დუბლი `url`-ით იჭრება PHP-ში** და არა უნიკალური ინდექსით: 1000
 * სიმბოლო utf8mb4-ზე MySQL-ის 3072-ბაიტიან ჭერს სცდება (`bookmarks.url`-ის
 * პრეცედენტი).
 */
class GalleryVideoController extends Controller
{
    /** ერთ მშობელზე რამდენი ბმული — სია, და არა ვიდეოთეკა */
    private const MAX_PER_PARENT = 100;

    /**
     * სია — ან ერთი მშობლის, ან ყველა (`/gallery/videos` გვერდი).
     *
     * ⚠️ `owner` **იგივე ფორმისაა, რაც ფოტოებში** (`movie:12` · `actor:5`) —
     * ორი სხვადასხვა ფორმა ერთ გვერდზე ხაფანგი იქნებოდა.
     */
    public function index(Request $request): JsonResponse
    {
        $owners = implode('|', [...GalleryParent::recordKeys(), 'actor']);

        $data = $request->validate([
            'owner' => ['nullable', 'string', 'regex:/^('.$owners.'):\d+$/'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
            // ვიდეოების გვერდის ძებნა, მფლობელის სახე და დალაგება
            'q' => ['nullable', 'string', 'max:200'],
            'owner_type' => ['nullable', 'in:record,actor'],
            // მოდული (`movie` · `song` · … · `actor`) — ფოტოების `type`-ის იგივე სია
            'type' => ['nullable', 'string', 'regex:/^('.$owners.')$/'],
            'sort' => ['nullable', 'in:new,old,title'],
            /* დაჯგუფება: ჯერ მფლობელით (ჩანაწერით) ან მოდულით, მერე არჩეული რიგით —
               ⚠️ სერვერზე, თორემ ჯგუფი გვერდებზე გაიხლიჩებოდა */
            'group' => ['nullable', 'in:record,module'],
        ]);

        $query = GalleryVideo::query()->listed();

        match ($data['group'] ?? null) {
            'record' => $query->orderBy('videoable_type')->orderBy('videoable_id'),
            'module' => $query->orderBy('videoable_type'),
            default => null,
        };

        match ($data['sort'] ?? 'new') {
            'old' => $query->orderBy('id'),
            'title' => $query->orderBy('title')->orderByDesc('id'),
            default => $query->orderByDesc('id'),
        };

        if ($owner = $data['owner'] ?? null) {
            [$kind, $id] = explode(':', $owner);
            $query->where('videoable_type', $kind === 'actor' ? GalleryParent::ACTOR : $kind)
                ->where('videoable_id', (int) $id);
        }

        if ($ownerType = $data['owner_type'] ?? null) {
            $ownerType === 'actor'
                ? $query->where('videoable_type', GalleryParent::ACTOR)
                : $query->where('videoable_type', '!=', GalleryParent::ACTOR);
        }

        if ($q = trim((string) ($data['q'] ?? ''))) {
            $query->where(fn ($w) => $w->where('title', 'like', Like::contains($q))->orWhere('channel', 'like', Like::contains($q)));
        }

        /* მოდულის ტაბების რიცხვები — მოდულის ფილტრამდე (ძებნის შემდეგ), ერთი
           `GROUP BY`-ით; რიგის `ORDER BY` აქ ზედმეტია */
        $facets = (clone $query)->reorder()
            ->selectRaw('videoable_type, count(*) as total')
            ->groupBy('videoable_type')
            ->pluck('total', 'videoable_type')
            ->mapWithKeys(fn ($n, $kind) => [($kind === GalleryParent::ACTOR ? 'actor' : $kind) => (int) $n])
            ->all();
        $facets['all'] = array_sum($facets);

        if ($type = $data['type'] ?? null) {
            $query->where('videoable_type', $type === 'actor' ? GalleryParent::ACTOR : $type);
        }

        $page = $query->paginate($data['per_page'] ?? 24)->withQueryString();

        return response()->json([
            'data' => $this->withOwners(collect($page->items())),
            'meta' => [
                'page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'last_page' => $page->lastPage(),
            ],
            'facets' => ['types' => (object) $facets],
        ]);
    }

    /**
     * **სათაურისა და არხის შესწორება.** ვებძებნის მოტანილი სათაური ხშირად გრძელი ან
     * უცხო ენაზეა — შენახულ ბმულს საკუთარი სახელი ეწერება.
     *
     * ⚠️ ბმული, პლატფორმა და `embed_url` აქ **არ იცვლება**: სხვა ბმული სხვა ვიდეოა
     * (წაშლა + დამატება), `embed_url` კი მხოლოდ `applyUrl()`-ით იწერება.
     */
    public function update(Request $request, GalleryVideo $galleryVideo): JsonResponse
    {
        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:500'],
            'channel' => ['nullable', 'string', 'max:255'],
        ]);

        foreach (['title' => 500, 'channel' => 255] as $field => $max) {
            if (array_key_exists($field, $data)) {
                $galleryVideo->{$field} = $this->text($data[$field], $max);
            }
        }
        $galleryVideo->save();

        return response()->json(['data' => $this->withOwners(collect([$galleryVideo]))[0]]);
    }

    /**
     * **მოდულები, რომელთა ჩანაწერებსაც ვიდეო-ბმული აქვთ** — ჭრილის პირველი საფეხური:
     * თითოზე ვიდეოების და ჩანაწერების რაოდენობა და ბოლო ბმულების ესკიზები.
     */
    public function modules(): JsonResponse
    {
        $rows = GalleryVideo::query()->listed()
            ->selectRaw('videoable_type, count(*) as videos, count(distinct videoable_id) as records')
            ->groupBy('videoable_type')
            ->get();

        $modules = $rows->map(fn ($row) => [
            'kind' => $row->videoable_type === GalleryParent::ACTOR ? 'actor' : $row->videoable_type,
            'videos' => (int) $row->videos,
            'records' => (int) $row->records,
            // ⚠️ ესკიზი დაშორებული URL-ია (არაფერი იწერება) — ბოლო სამი ბმული
            'thumbnails' => GalleryVideo::query()->listed()
                ->where('videoable_type', $row->videoable_type)
                ->whereNotNull('thumbnail_url')
                ->orderByDesc('id')
                ->limit(3)
                ->pluck('thumbnail_url')
                ->all(),
        ])->sortByDesc('videos')->values();

        return response()->json(['data' => $modules]);
    }

    /**
     * **ერთი მოდულის ჩანაწერები, რომლებსაც ვიდეო-ბმული აქვთ** — მეორე საფეხური;
     * ბოლოს დამატებული თავში. ⚠️ დაჯგუფება ბაზაშია, გვერდი — ჩანაწერებისა.
     */
    public function records(Request $request): JsonResponse
    {
        $owners = implode('|', [...GalleryParent::recordKeys(), 'actor']);

        $data = $request->validate([
            'type' => ['required', 'string', 'regex:/^('.$owners.')$/'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $type = $data['type'] === 'actor' ? GalleryParent::ACTOR : $data['type'];

        $page = GalleryVideo::query()->listed()
            ->where('videoable_type', $type)
            ->selectRaw('videoable_id, count(*) as videos, max(id) as latest')
            ->groupBy('videoable_id')
            ->orderByDesc('latest')
            ->paginate($data['per_page'] ?? 24)
            ->withQueryString();

        $rows = collect($page->items());
        $records = GalleryParent::query($type)?->whereIn('id', $rows->pluck('videoable_id'))->get()->keyBy(fn (Model $record) => $record->getKey()) ?? collect();
        $thumbs = GalleryVideo::query()->whereIn('id', $rows->pluck('latest'))->pluck('thumbnail_url', 'id');

        return response()->json([
            'data' => $rows->map(fn ($row) => [
                'kind' => $data['type'],
                'id' => (int) $row->videoable_id,
                'videos' => (int) $row->videos,
                'thumbnail' => $thumbs[$row->latest] ?? null,
            ] + RecordTitle::of($records->get($row->videoable_id)))->values(),
            'meta' => [
                'page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'last_page' => $page->lastPage(),
            ],
        ]);
    }

    /**
     * ბმულის შენახვა — ვებძებნის შედეგიდან ან ხელით.
     *
     * ⚠️ **მშობლის შემოწმება ცხადია.** მარშრუტი `module:gallery`-შია, ე.ი.
     * გალერეის უფლებას ამოწმებს; მშობლის მფლობელობა კი აქ მოწმდება
     * (`404`, არა `403` — რომ სხვისი ჩანაწერის არსებობა არ გაირკვეს).
     * `cast_member` გამონაკლისია: ის გლობალური ლექსიკონია და მფლობელი არ ჰყავს.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'target' => ['required', GalleryParent::rule()],
            'id' => ['required', 'integer', 'min:1'],
            'url' => ['required', 'string', 'max:1000'],
            'title' => ['nullable', 'string', 'max:500'],
            'channel' => ['nullable', 'string', 'max:255'],
            'duration' => ['nullable', 'integer', 'min:0', 'max:86400'],
            'published_at' => ['nullable', 'date'],
            'thumbnail_url' => ['nullable', 'string', 'max:1000'],
            'source_url' => ['nullable', 'string', 'max:1000'],
            // ⚠️ engine-ის სახელს **ჩვენ ვამოწმებთ** — თვითნებური სტრიქონი
            // „საიდან მოვიდა" ფილტრს უაზროდ აქცევდა (`WebImageImporter`-ის წესი)
            'engine' => ['nullable', 'string', 'max:40'],
        ]);

        $user = $request->user();
        $parent = $this->parent($request, $data['target'], (int) $data['id']);

        if (! $parent) {
            return response()->json(['message' => 'not_found'], 404);
        }

        $url = trim($data['url']);

        if (! preg_match('~^https?://~i', $url)) {
            return response()->json(['message' => 'invalid_url'], 422);
        }

        // ხელახლა შენახვა იმავე ბმულს არ ამატებს
        $existing = $parent->galleryVideos()
            ->withoutGlobalScope('owner')
            ->where('user_id', $user->getKey())
            ->where('url', $url)
            ->first();

        if ($existing) {
            return response()->json(['video' => new GalleryVideoResource($existing), 'duplicate' => true]);
        }

        if ($parent->galleryVideos()->withoutGlobalScope('owner')->where('user_id', $user->getKey())->count() >= self::MAX_PER_PARENT) {
            return response()->json(['message' => 'too_many_videos'], 422);
        }

        $video = new GalleryVideo([
            'user_id' => $user->getKey(),
            'source' => $this->source($data['engine'] ?? null),
            'title' => $this->text($data['title'] ?? null, 500),
            'channel' => $this->text($data['channel'] ?? null, 255),
            'duration' => $data['duration'] ?? null,
            'published_at' => $data['published_at'] ?? null,
            'thumbnail_url' => $this->httpUrl($data['thumbnail_url'] ?? null),
            'source_url' => $this->httpUrl($data['source_url'] ?? null),
            /* ⚠️ **`user_id`-ის ფილტრიც აუცილებელია**: scope
               მოხსნილია, ე.ი. `max()` **ყველა ანგარიშის** რიგებს კითხულობდა —
               ორი ხაზით ზემოთ იგივე query სწორად იფილტრება. საზიარო მშობელზე
               (ერთი მსახიობი მრავალ ანგარიშზე) ეს რიგითობას ახტუნებდა და
               `unsignedSmallInteger`-ის ჭერისკენ სწრაფად მიდიოდა. */
            'sort_order' => (int) $parent->galleryVideos()
                ->withoutGlobalScope('owner')
                ->where('user_id', $user->getKey())
                ->max('sort_order') + 1,
        ]);

        // ⚠️ ერთადერთი ადგილი, სადაც პლატფორმა/embed იწერება
        $video->applyUrl($url);

        $parent->galleryVideos()->save($video);

        return response()->json(['video' => new GalleryVideoResource($video), 'duplicate' => false], 201);
    }

    public function destroy(GalleryVideo $galleryVideo)
    {
        // ⚠️ **ურნა** — ბმული ურნაში გადადის და იქიდან ბრუნდება
        $galleryVideo->moveToTrash();

        return response()->noContent();
    }

    /* ---------- შიგნეული ---------- */

    /** მშობელი + მფლობელობის შემოწმება */
    private function parent(Request $request, string $target, int $id): ?Model
    {
        // `query()`: პირადი მოდულის ჩანაწერი მოდულითაც იჭრება
        $parent = GalleryParent::query($target)?->find($id);

        if (! $parent) {
            return null;
        }

        // მოდულის წვდომა ცხადად — მარშრუტი მხოლოდ `gallery`-ს ამოწმებს
        if (! $request->user()->hasModule(GalleryParent::module($target))) {
            return null;
        }

        // ⚠️ `cast_member` გლობალურია (მფლობელი არ აქვს); დანარჩენებზე
        // `owner` scope ისედაც ჭრის, ცხადი შემოწმება კი CLI-სთვისაც რჩება
        if ($target !== GalleryParent::ACTOR && (int) $parent->user_id !== (int) $request->user()->id) {
            return null;
        }

        return $parent;
    }

    /**
     * წყაროს იარლიყი — **მხოლოდ ჩვენ ვწერთ**.
     *
     * ⚠️ ფრონტიდან მოსული თვითნებური ტექსტი „საიდან მოვიდა" ფილტრს
     * უაზროდ აქცევდა (`WebImageImporter::source()`-ის იგივე წესი).
     */
    private function source(?string $engine): string
    {
        if ($engine === null || $engine === '') {
            return GalleryVideo::SOURCE_MANUAL;
        }

        return array_key_exists($engine, SerpApiClient::VIDEO_ENGINES)
            ? 'serpapi:'.$engine
            : GalleryVideo::SOURCE_MANUAL;
    }

    /** @param  Collection<int, GalleryVideo>  $videos */
    private function withOwners($videos): array
    {
        $names = [];

        foreach ($videos->groupBy('videoable_type') as $type => $rows) {
            $parents = GalleryParent::query((string) $type);

            if (! $parents) {
                continue;
            }

            foreach ($parents->whereIn('id', $rows->pluck('videoable_id')->unique())->get() as $record) {
                // ადგილს მხოლოდ `name` აქვს — სათაური ყველა ტიპზე ერთი წესით იკითხება
                $names[$type.':'.$record->getKey()] = RecordTitle::label($record);
            }
        }

        return $videos->map(function (GalleryVideo $video) use ($names) {
            $payload = (new GalleryVideoResource($video))->resolve();
            $payload['owner']['title'] = $names[$video->videoable_type.':'.$video->videoable_id] ?? null;

            return $payload;
        })->values()->all();
    }

    private function text(mixed $value, int $max): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);

        return $value === '' ? null : mb_substr($value, 0, $max);
    }

    private function httpUrl(mixed $value): ?string
    {
        return is_string($value) && preg_match('~^https?://~i', trim($value)) && mb_strlen(trim($value)) <= 1000
            ? trim($value)
            : null;
    }
}
