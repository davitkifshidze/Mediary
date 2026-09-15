<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\GalleryVideoResource;
use App\Models\CastMember;
use App\Models\GalleryVideo;
use App\Services\Serp\SerpApiClient;
use App\Support\GalleryParent;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * **ვიდეო-ბმულები გალერეაში (Tasks §8.1/§8.4).**
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
        ]);

        $query = GalleryVideo::query()->orderByDesc('id');

        if ($owner = $data['owner'] ?? null) {
            [$kind, $id] = explode(':', $owner);
            $query->where('videoable_type', $kind === 'actor' ? GalleryParent::ACTOR : $kind)
                ->where('videoable_id', (int) $id);
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
            /* ⚠️ **`user_id`-ის ფილტრიც აუცილებელია** (აუდიტი 2026-09-14): scope
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
        $galleryVideo->delete();

        return response()->noContent();
    }

    /* ---------- შიგნეული ---------- */

    /** მშობელი + მფლობელობის შემოწმება */
    private function parent(Request $request, string $target, int $id): ?Model
    {
        /** @var class-string<Model>|null $model */
        $model = GalleryParent::model($target);

        if (! $model) {
            return null;
        }

        $parent = $model::find($id);

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
            $model = GalleryParent::model((string) $type);

            if (! $model) {
                continue;
            }

            foreach ($model::query()->whereIn('id', $rows->pluck('videoable_id')->unique())->get() as $record) {
                $names[$type.':'.$record->getKey()] = $record instanceof CastMember
                    ? ($record->name_ka ?: $record->name)
                    : ($record->title_ka ?? $record->title_en ?? $record->title ?? null);
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
