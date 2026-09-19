<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SongResource;
use App\Models\Song;
use App\Services\Storage\StorageMeter;
use App\Services\Video\VideoMetadata;
use App\Support\DuplicateLink;
use App\Support\Like;
use App\Support\StorageFolder;
use App\Support\VideoUrl;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * სიმღერების მოდული (`song`).
 *
 * მფლობელობა — `BelongsToUser` global scope (სხვისი ჩანაწერი 404).
 *
 * ბმული იმავე allowlist-ზე გადის, რაც ვიდეოზე (`VideoUrl`) — ე.ი. YouTube-ის
 * embed აქაც უსაფრთხოდ იგება და **HTML არასდროს ინახება**. მეტამონაცემი
 * (სათაური, ხანგრძლივობა, ფოტო) იმავე `VideoMetadata`-დან მოდის.
 *
 * ⚠️ **ჟანრი აქ pivot-ია** (`genre_ids[]`) და არა ერთი `genre_id`, როგორც
 * წიგნზე/ბორდგეიმზე — `DECISIONS.md` §5-ის პასუხი 2026-09-06-ს.
 */
class SongController extends Controller
{
    public function __construct(private StorageMeter $meter) {}

    public function index(Request $request)
    {
        // §7.4 — ბარათზე „რამდენი ფაილი/ჩანიშვნაა" ერთი რექვესთით ჩანს
        $query = Song::query()
            ->with(['genres', 'playlists:id,name'])
            ->withCount(['images', 'documents', 'notes']);

        if ($platform = $request->string('platform')->toString()) {
            $query->where('platform', $platform);
        }
        if ($request->boolean('favorite')) {
            $query->where('is_favorite', true);
        }
        // ჟანრები/ტეგები — მძიმით გამოყოფილი სია, თითოეული ცალკე პირობაა (5.2-ის წესი)
        // ⚠️ ჟანრი pivot-ია, ე.ი. `whereHas` და არა `whereIn` სვეტზე (თამაშის წესი)
        foreach ($this->slugList($request->string('genre_id')->toString()) as $genreId) {
            $query->whereHas('genres', fn ($q) => $q->where('song_genres.id', (int) $genreId));
        }
        foreach ($this->slugList($request->string('tag')->toString()) as $tag) {
            $query->whereJsonContains('tags', $tag);
        }
        if ($artist = $request->string('artist')->toString()) {
            $query->where('artist', $artist);
        }

        if ($q = $request->string('q')->toString()) {
            $query->where(fn (Builder $inner) => $inner
                ->where('title', 'like', Like::contains($q))
                ->orWhere('artist', 'like', Like::contains($q))
                ->orWhere('album', 'like', Like::contains($q))
                ->orWhere('tags', 'like', Like::contains($q)));
        }

        match ($request->string('sort')->toString()) {
            'title' => $query->orderBy('title'),
            'artist' => $query->orderBy('artist')->orderBy('album')->orderBy('title'),
            'album' => $query->orderBy('album')->orderBy('title'),
            'year' => $query->orderByDesc('year'),
            'rating' => $query->orderByDesc('rating'),
            'oldest' => $query->orderBy('id'),
            'played' => $query->orderByDesc('played_at'),
            default => $query->orderByDesc('id'),
        };

        return SongResource::collection($this->paginated($request, $query));
    }

    public function show(Song $song)
    {
        return new SongResource(
            $song->load(['genres', 'playlists:id,name'])
                ->loadCount(['images', 'documents', 'notes']),
        );
    }

    /**
     * ბმულის მეტამონაცემი ფორმის შესავსებად — ჩანაწერს არ ქმნის.
     *
     * ⚠️ **`existing` აქვე მოდის და ცალკე endpoint არაა** (FEAT-17): ეს
     * ერთი კითხვის ორი ნახევარია („რა არის ამ ბმულის უკან და ხომ არ მაქვს
     * უკვე"), და ორი მოთხოვნა ფორმას ორ ცალკე მდგომარეობას შეაძენინებდა.
     * გაფრთხილებაა და არა აკრძალვა — შენახვა მაინც შესაძლებელია.
     *
     * ⚠️ **`exclude` რედაქტირებისთვისაა**: არსებული ჩანაწერის ფორმა
     * საკუთარ მისამართს ხელახლა ამოწმებს და უამისოდ ყოველთვის იტყოდა
     * „ეს უკვე გაქვს".
     */
    public function metadata(Request $request, VideoMetadata $meta)
    {
        $data = $request->validate([
            'url' => ['required', 'string', 'max:1000', 'url'],
            'exclude' => ['nullable', 'integer'],
        ]);

        return response()->json($meta->fetch($data['url']) + [
            'youtube_key' => $meta->hasYoutubeKey(),
            'existing' => DuplicateLink::find(Song::class, $data['url'], $data['exclude'] ?? null),
        ]);
    }

    public function store(Request $request)
    {
        $song = new Song;
        $data = $this->validated($request);
        $this->apply($song, $request, $data);
        $song->save();
        $this->syncGenres($song, $data);

        // ბაზის default-ები (is_favorite/play_count) მოდელზე ჯერ არ ასახულა
        return (new SongResource($song->refresh()->load('genres')))->response()->setStatusCode(201);
    }

    public function update(Request $request, Song $song)
    {
        $data = $this->validated($request, $song);
        $this->apply($song, $request, $data);
        $song->save();
        $this->syncGenres($song, $data);

        return new SongResource($song->load('genres'));
    }

    public function destroy(Song $song)
    {
        /* ⚠️ **კალათა (FEAT-11)** — `delete()` კი არა, `moveToTrash()`.
           ჩანაწერი სიიდან ქრება, მაგრამ ბაზაში რჩება: ფაილები, ჩანიშვნები,
           გალერეა და კვოტა **არ** თავისუფლდება, ე.ი. აღდგენა უფასოა.
           ნამდვილი წაშლა სამ ადგილას ხდება — კალათიდან, `/purge`-იდან და
           ვადის (`TrashDomain::KEEP_DAYS`) ამოწურვისას. */
        $song->moveToTrash();

        return response()->noContent();
    }

    public function toggleFavorite(Song $song)
    {
        $song->is_favorite = ! $song->is_favorite;
        $song->save();

        return new SongResource($song->load('genres'));
    }

    /** „მოვისმინე" — მთვლელი + თარიღი (ვიდეოს `watched`-ის ანალოგი) */
    public function markPlayed(Song $song)
    {
        $song->forceFill([
            'play_count' => $song->play_count + 1,
            'played_at' => now(),
        ])->save();

        return new SongResource($song->load('genres'));
    }

    /* ---------- დამხმარეები ---------- */

    private function validated(Request $request, ?Song $song = null): array
    {
        // ⚠️ სტატუსი და ტიპი სავალდებულოა — ჩანაწერი ვერცერთის გარეშე ვერ შეინახება.
        // რედაქტირებისას `sometimes`: თუ ველი საერთოდ არ გამოიგზავნა, ძველი
        // მნიშვნელობა რჩება (შექმნისას სავალდებულო იყო) — მაგრამ ცარიელს ვეღარ გაგზავნი.
        $must = $song ? ['sometimes', 'required'] : ['required'];

        return $request->validate([
            // სათაური არასავალდებულოა — ცარიელზე ბმულიდან წამოვა
            'title' => ['nullable', 'string', 'max:255'],
            'artist' => ['nullable', 'string', 'max:255'],
            'album' => ['nullable', 'string', 'max:255'],
            'year' => ['nullable', 'integer', 'min:1850', 'max:2200'],
            'url' => [$song ? 'sometimes' : 'required', 'string', 'max:1000', 'url'],
            // ჟანრები მხოლოდ **საკუთარი** ლექსიკონიდან; pivot-ია, ე.ი. მასივი
            'genre_ids' => [...$must, 'array', 'min:1', 'max:10'],
            'genre_ids.*' => [
                'integer',
                Rule::exists('song_genres', 'id')->where('user_id', $request->user()->id),
            ],
            'duration' => ['nullable', 'integer', 'min:0', 'max:86400'],
            'tags' => ['nullable', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],
            'rating' => ['nullable', 'integer', 'min:1', 'max:'.Song::MAX_RATING],
            'is_favorite' => ['nullable', 'boolean'],
            'visibility' => ['nullable', Rule::in(['private', 'public'])],
            'thumbnail' => ['nullable', 'image', 'max:4096'],
            'remove_thumbnail' => ['nullable', 'boolean'],
        ]);
    }

    private function apply(Song $song, Request $request, array $data): void
    {
        foreach (['title', 'artist', 'album', 'year', 'duration', 'rating'] as $field) {
            if (array_key_exists($field, $data)) {
                $song->{$field} = $data[$field] ?: null;
            }
        }
        if (! empty($data['visibility'])) {
            $song->visibility = $data['visibility'];
        }
        if (array_key_exists('tags', $data)) {
            $song->tags = Song::normalizeTags($data['tags'] ?? []);
        }
        if ($request->has('is_favorite')) {
            $song->is_favorite = $request->boolean('is_favorite');
        }

        if (array_key_exists('url', $data)) {
            $urlChanged = $song->url !== $data['url'];
            $song->url = $data['url'];

            $parsed = VideoUrl::parse($data['url']);
            $song->platform = $parsed['platform'];
            $song->external_id = $parsed['external_id'];
            $song->embed_url = $parsed['embed_url'];
            if (! $song->thumbnail_path) {
                $song->thumbnail_url = $parsed['thumbnail_url'];
            }

            if ($urlChanged) {
                $this->autofill($song, $request);
            }
        }

        if ($request->boolean('remove_thumbnail')) {
            $song->deleteThumbnail();
            $song->thumbnail_path = null;
        }

        if ($request->hasFile('thumbnail')) {
            // 17.3 — `storeUpload()` ატვირთვამდე ამოწმებს კვოტას (ამოწურვაზე 413)
            $song->deleteThumbnail();
            $song->thumbnail_path = $this->meter
                ->storeUpload($request->user(), $request->file('thumbnail'), StorageFolder::SONG_THUMBNAILS);
            $song->thumbnail_url = null;
        }
    }

    /**
     * ჟანრები pivot-ია; გასაღებები ვალიდაციაზე უკვე user-ზეა შემოწმებული.
     *
     * ⚠️ **`save()`-ის შემდეგ უნდა გაეშვას** — ახალ ჩანაწერს ჯერ `id` არ აქვს,
     * `sync()` კი pivot-ის რიგს ვერ ჩაწერს.
     */
    private function syncGenres(Song $song, array $data): void
    {
        if (array_key_exists('genre_ids', $data)) {
            $song->genres()->sync(array_map('intval', $data['genre_ids'] ?? []));
        }
    }

    /**
     * ცარიელი ველების შევსება ბმულიდან. არასდროს გადააწერს იმას, რაც
     * user-მა შეავსო; ჩავარდნაზე ჩუმად გადის. `autofill=0`-ით გამორთვადია.
     */
    private function autofill(Song $song, Request $request): void
    {
        if (! $request->boolean('autofill', true)) {
            return;
        }

        $needs = ! $song->title || ! $song->duration || ! $song->tags || ! $song->thumbnail_url;
        if (! $needs) {
            return;
        }

        $meta = app(VideoMetadata::class)->fetch($song->url);

        if (! $song->title) {
            $song->title = $meta['title'] ?: parse_url($song->url, PHP_URL_HOST) ?: $song->url;
        }
        // YouTube-ის „author" არხის სახელია — შემსრულებლის საუკეთესო მიახლოება
        if (! $song->artist && ($meta['author'] ?? null)) {
            $song->artist = $meta['author'];
        }
        if (! $song->duration && $meta['duration']) {
            $song->duration = $meta['duration'];
        }
        if (! $song->tags && $meta['tags']) {
            $song->tags = Song::normalizeTags($meta['tags']);
        }
        if (! $song->thumbnail_path && ! $song->thumbnail_url && $meta['thumbnail_url']) {
            $song->thumbnail_url = $meta['thumbnail_url'];
        }
    }
}
