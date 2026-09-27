<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\GameResource;
use App\Models\Game;
use App\Models\GameVideo;
use App\Services\Games\IgdbClient;
use App\Services\Games\RawgClient;
use App\Services\Storage\StorageMeter;
use App\Support\Like;
use App\Support\StorageFolder;
use App\Support\VideoUrl;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * თამაშების მოდული (`game`, Tasks §11).
 *
 * მფლობელობა — `BelongsToUser` global scope (სხვისი ჩანაწერი 404), უფლებები —
 * `permission:game` middleware. გამამდიდრებელი წყარო **RAWG**-ია (§11.4),
 * ნაკადი კი TMDB-ის იდენტურია: ჯერ კანდიდატების სია, მერე არჩეულის დრაფტი.
 *
 * ⚠️ **IGDB სათადარიგოა** (`DECISIONS.md` §7, 2026-09-06): ერთვება მაშინ, როცა
 * RAWG-ს კლავიში არ აქვს ან შედეგი არ მოაქვს. ორივე არასავალდებულოა.
 *
 * ⚠️ **ჟანრი აქ pivot-ია** (`genre_ids[]`) და არა ერთი `genre_id`, როგორც
 * წიგნზე/ბორდგეიმზე — 11.1 „ჟანრებს" მრავლობითში წერს.
 */
class GameController extends Controller
{
    public function __construct(
        private StorageMeter $meter,
        private RawgClient $rawg,
        private IgdbClient $igdb,
    ) {}

    public function index(Request $request)
    {
        $query = Game::query()
            ->with('genres')
            ->withCount(['videos', 'files', 'images', 'notes', 'galleryImages']);

        if ($status = $request->string('status')->toString()) {
            $query->where('status', $status);
        }
        if ($request->boolean('favorite')) {
            $query->where('is_favorite', true);
        }

        // ჟანრი/პლატფორმა/რეჟიმი — მძიმით გამოყოფილი სია და **AND** (5.2-ის წესი)
        foreach ($this->slugList($request->string('genre_id')->toString()) as $genreId) {
            $query->whereHas('genres', fn ($q) => $q->where('game_genres.id', (int) $genreId));
        }
        foreach ($this->slugList($request->string('platform')->toString()) as $platform) {
            $query->whereJsonContains('platforms', $platform);
        }
        foreach ($this->slugList($request->string('mode')->toString()) as $mode) {
            $query->whereJsonContains('modes', $mode);
        }

        // §5.1 — ფრენჩაიზის მოდალი: **ზუსტი** დამთხვევა და არა `like`, თორემ
        // „Mass Effect" და „Mass Effect: Andromeda" ერთ ნაკრებში აღმოჩნდებოდა
        if ($franchise = $request->string('franchise')->toString()) {
            $query->where('franchise', $franchise);
        }

        if ($q = $request->string('q')->toString()) {
            $query->where(fn ($inner) => $inner
                ->where('title_ka', 'like', Like::contains($q))
                ->orWhere('title_en', 'like', Like::contains($q))
                ->orWhere('developer', 'like', Like::contains($q))
                ->orWhere('publisher', 'like', Like::contains($q))
                ->orWhere('franchise', 'like', Like::contains($q)));
        }

        match ($request->string('sort')->toString()) {
            'title' => $query->orderBy('title_en')->orderBy('title_ka'),
            // ⚠️ `year` სვეტი არ არსებობს (აქსესორია) — სორტირება თარიღზეა
            'year' => $query->orderByDesc('release_date'),
            'rating' => $query->orderByDesc('rating'),
            'oldest' => $query->orderBy('id'),
            default => $query->orderByDesc('id'),
        };

        return GameResource::collection($this->paginated($request, $query));
    }

    /**
     * ბიბლიოთეკაში არსებული ფრენჩაიზები — სახელი + რამდენი ნაწილი (§5.1).
     *
     * ⚠️ ცალკე ლექსიკონის ცხრილი **განზრახ არ იქმნება**: ფრენჩაიზი თამაშის
     * საკუთარი ტექსტური სვეტია და RAWG-იც ასე აბრუნებს — ცხრილი ერთსა და
     * იმავე ფაქტს ორ ადგილას შეინახავდა და ისინი აუცილებლად დაშორდებოდნენ
     * (იგივე მიზეზი, რის გამოც `games.year` სვეტი არ არსებობს).
     *
     * ⚠️ `owner` global scope ძალაშია, ე.ი. სია მხოლოდ ამ ანგარიშისაა.
     */
    public function franchises()
    {
        $rows = Game::query()
            ->whereNotNull('franchise')
            ->where('franchise', '!=', '')
            ->selectRaw('franchise, count(*) as games_count')
            ->groupBy('franchise')
            ->orderBy('franchise')
            ->get();

        return response()->json([
            'data' => $rows->map(fn ($row) => [
                'name' => $row->franchise,
                'games_count' => (int) $row->games_count,
            ])->all(),
        ]);
    }

    public function show(Game $game)
    {
        return new GameResource(
            $game->load(['genres', 'videos'])
                ->loadCount(['videos', 'files', 'images', 'notes', 'galleryImages']),
        );
    }

    public function store(Request $request)
    {
        $game = new Game;
        $data = $this->validated($request);
        $videos = $this->apply($game, $request, $data);
        $game->save();

        $this->syncGenres($game, $data);
        $this->addVideos($game, $videos, (int) $request->user()->id);
        $this->fetchCover($game, $request);

        return (new GameResource($game->refresh()->load('genres')))
            ->response()->setStatusCode(201);
    }

    public function update(Request $request, Game $game)
    {
        $data = $this->validated($request, $game);
        $videos = $this->apply($game, $request, $data);
        $game->save();

        $this->syncGenres($game, $data);
        $this->addVideos($game, $videos, (int) $request->user()->id);

        return new GameResource(
            $game->load(['genres', 'videos'])
                ->loadCount(['videos', 'files', 'images', 'notes', 'galleryImages']),
        );
    }

    public function destroy(Game $game)
    {
        /* ⚠️ **კალათა (FEAT-11)** — `delete()` კი არა, `moveToTrash()`.
           ჩანაწერი სიიდან ქრება, მაგრამ ბაზაში რჩება: ფაილები, ჩანიშვნები,
           გალერეა და კვოტა **არ** თავისუფლდება, ე.ი. აღდგენა უფასოა.
           ნამდვილი წაშლა სამ ადგილას ხდება — კალათიდან, `/purge`-იდან და
           ვადის (`TrashDomain::KEEP_DAYS`) ამოწურვისას. */
        $game->moveToTrash();

        return response()->noContent();
    }

    public function toggleFavorite(Game $game)
    {
        $game->is_favorite = ! $game->is_favorite;
        $game->save();

        return new GameResource($game->load('genres'));
    }

    /** სტატუსი ცალკე endpoint-ია — ბარათიდან ერთი კლიკია (მედიის ანალოგი) */
    public function setStatus(Request $request, Game $game)
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(Game::STATUSES)],
        ]);

        $game->status = $data['status'];
        $game->save();

        return new GameResource($game->load('genres'));
    }

    /* ---------- RAWG + IGDB (§11.4-ის enrichment) ---------- */

    /**
     * არჩევანის სია — ავტომატურად არაფერს ვამთხვევთ (remake/remaster ერთნაირად ჰქვია).
     *
     * ⚠️ **ცარიელი სია და მიუწვდომელი წყარო ერთი და იგივე არაა:** ორივე წყაროს
     * ჩავარდნაზე 503-ს ვაბრუნებთ, თორემ user-ს ეგონებოდა, რომ თამაში ბაზაში
     * არ არსებობს (BGG-ის იგივე წესი).
     *
     * ⚠️ **რიგი ცხადია: ჯერ RAWG, მერე IGDB** (`DECISIONS.md` §7). IGDB
     * **სათადარიგოა** — ერთვება მაშინ, როცა RAWG-ს კლავიში არ აქვს ან შედეგი
     * არ მოაქვს. თითო რიგს `source` ველი აქვს, ე.ი. ფორმა იცის, სად დააბრუნოს
     * `lookup`.
     */
    public function candidates(Request $request)
    {
        $data = $request->validate(['query' => ['required', 'string', 'max:255']]);

        $results = $this->rawg->search($data['query']);

        // RAWG-მა ვერაფერი მოიტანა → IGDB (თუ ისიც გამართულია)
        if (! $results && $this->igdb->configured()) {
            $results = $this->igdb->search($data['query']);
        }

        if (! $results && $this->blocked()) {
            return response()->json([
                'message' => 'rawg_unavailable',
                'configured' => $this->configured(),
            ], 503);
        }

        return response()->json(['results' => $results, 'configured' => $this->configured()]);
    }

    /**
     * არჩეულის სრული დრაფტი ფორმის შესავსებად — ჩანაწერს **არ ქმნის**.
     *
     * ⚠️ **`rawg_id` ისევ მუშაობს მარტოც** — ძველი SPA და სკრიპტები არ იტეხება;
     * `igdb_id` ახალი, ტოლუფლებიანი შესასვლელია. ორივეს არქონა 422-ია.
     */
    public function lookup(Request $request)
    {
        $data = $request->validate([
            'rawg_id' => ['nullable', 'integer', 'min:1', 'required_without:igdb_id'],
            'igdb_id' => ['nullable', 'integer', 'min:1', 'required_without:rawg_id'],
        ]);

        $useIgdb = ! empty($data['igdb_id']);
        $id = (int) ($useIgdb ? $data['igdb_id'] : $data['rawg_id']);

        $draft = $useIgdb ? $this->igdb->details($id) : $this->rawg->details($id);

        if (! $draft) {
            $blocked = $useIgdb ? $this->igdb->blocked() : $this->rawg->blocked();

            return response()->json([
                'message' => $blocked ? 'rawg_unavailable' : 'not_found',
            ], $blocked ? 503 : 404);
        }

        $draft['screenshots'] = $useIgdb
            ? $this->igdb->screenshots($id)
            : $this->rawg->screenshots($id);

        return response()->json(['draft' => $draft]);
    }

    /** ერთი წყარო მაინც გამართულია */
    private function configured(): bool
    {
        return $this->rawg->configured() || $this->igdb->configured();
    }

    /**
     * ⚠️ **„დაბლოკილი" მხოლოდ მაშინაა, თუ *ორივე* ჩავარდა.** ერთის მუშაობა
     * ცარიელი შედეგით ნიშნავს, რომ თამაში მართლა ვერ მოიძებნა — და ეს 503
     * არაა, რომ user-ს ტყუილად არ ეგონოს წყარო გატეხილი.
     */
    private function blocked(): bool
    {
        return $this->rawg->blocked() && (! $this->igdb->configured() || $this->igdb->blocked());
    }

    /* ---------- დამხმარეები ---------- */

    private function validated(Request $request, ?Game $game = null): array
    {
        $userId = $request->user()->id;

        // ⚠️ სტატუსი და ტიპი სავალდებულოა — ჩანაწერი ვერცერთის გარეშე ვერ შეინახება.
        // რედაქტირებისას `sometimes`: თუ ველი საერთოდ არ გამოიგზავნა, ძველი
        // მნიშვნელობა რჩება (შექმნისას სავალდებულო იყო) — მაგრამ ცარიელს ვეღარ გაგზავნი.
        $must = $game ? ['sometimes', 'required'] : ['required'];

        return $request->validate([
            // ერთი ენა მაინც — ორივე ცარიელი სათაური უსახელო ჩანაწერს დატოვებდა
            'title_ka' => ['nullable', 'string', 'max:255', 'required_without:title_en'],
            'title_en' => ['nullable', 'string', 'max:255', 'required_without:title_ka'],
            'description_ka' => ['nullable', 'string', 'max:20000'],
            'description_en' => ['nullable', 'string', 'max:20000'],

            'release_date' => ['nullable', 'date'],
            'developer' => ['nullable', 'string', 'max:255'],
            'publisher' => ['nullable', 'string', 'max:255'],
            'franchise' => ['nullable', 'string', 'max:255'],

            'platforms' => ['nullable', 'array', 'max:20'],
            'platforms.*' => [Rule::in(Game::PLATFORMS)],
            'my_platform' => ['nullable', Rule::in(Game::PLATFORMS)],
            'modes' => ['nullable', 'array', 'max:10'],
            'modes.*' => [Rule::in(Game::MODES)],

            'genre_ids' => [...$must, 'array', 'min:1', 'max:10'],
            'genre_ids.*' => [
                'integer',
                Rule::exists('game_genres', 'id')->whereNull('trashed_at')->where('user_id', $userId),
            ],

            'opencritic' => ['nullable', 'integer', 'min:0', 'max:100'],
            'users_score' => ['nullable', 'numeric', 'min:0', 'max:5'],
            'rating' => ['nullable', 'integer', 'min:1', 'max:'.Game::MAX_RATING],

            'links' => ['nullable', 'array', 'max:10'],
            'links.*.label' => ['nullable', 'string', 'max:60'],
            'links.*.url' => ['required_with:links', 'string', 'max:1000', 'url'],
            // §22.3 — ⚠️ ძველი ერთღერძიანი მნიშვნელობაც მიიღება (`Game::normalizeLink()` თარგმნის)
            'links.*.kind' => ['nullable', Rule::in([...Game::LINK_KINDS, ...Game::LEGACY_LINK_KINDS])],
            'links.*.store' => ['nullable', Rule::in(Game::LINK_STORES)],

            'status' => [...$must, Rule::in(Game::STATUSES)],
            'is_favorite' => ['nullable', 'boolean'],

            'age_rating' => ['nullable', 'string', 'max:20'],
            'size_gb' => ['nullable', 'numeric', 'min:0', 'max:99999'],

            'rawg_id' => [
                'nullable', 'integer', 'min:1',
                // ⚠️ უნიკალურობა **user-ზეა** — ორ ანგარიშს ერთი თამაში უნდა შეეძლოს
                Rule::unique('games', 'rawg_id')->where('user_id', $userId)->ignore($game?->id),
            ],
            'rawg_slug' => ['nullable', 'string', 'max:255'],

            // IGDB — სათადარიგო წყარო (`DECISIONS.md` §7); იგივე per-user წესი
            'igdb_id' => [
                'nullable', 'integer', 'min:1',
                Rule::unique('games', 'igdb_id')->where('user_id', $userId)->ignore($game?->id),
            ],
            'igdb_slug' => ['nullable', 'string', 'max:255'],

            'cover_url' => ['nullable', 'string', 'max:1000', 'url'],
            'cover' => ['nullable', 'image', 'max:4096'],
            'remove_cover' => ['nullable', 'boolean'],
            'visibility' => ['nullable', Rule::in(['private', 'public'])],
        ]);
    }

    /**
     * @return list<array{label: ?string, url: string, kind: string, store: ?string}>
     *                                                                                ბმულები, რომლებიც თამაშის ვიდეოდ უნდა იქცეს (§22.4) — შენახვის შემდეგ
     */
    private function apply(Game $game, Request $request, array $data): array
    {
        $plain = [
            'title_ka', 'title_en', 'description_ka', 'description_en',
            'release_date', 'developer', 'publisher', 'franchise', 'my_platform',
            'opencritic', 'users_score', 'rating',
            'age_rating', 'size_gb', 'rawg_id', 'rawg_slug', 'igdb_id', 'igdb_slug',
        ];

        foreach ($plain as $field) {
            if (array_key_exists($field, $data)) {
                // ⚠️ `?:` აქ იმიტომ, რომ ცარიელი სტრიქონი `null`-ად ჩაჯდეს;
                // `0`-ის მქონე ველი ამ სიაში არაა (ქულა 1-დან იწყება)
                $game->{$field} = $data[$field] ?: null;
            }
        }

        foreach (['status', 'visibility'] as $field) {
            if (! empty($data[$field])) {
                $game->{$field} = $data[$field];
            }
        }

        if (array_key_exists('platforms', $data)) {
            $game->platforms = Game::normalizeKeys($data['platforms'] ?? [], Game::PLATFORMS);
        }
        if (array_key_exists('modes', $data)) {
            $game->modes = Game::normalizeKeys($data['modes'] ?? [], Game::MODES);
        }
        $videos = [];

        if (array_key_exists('links', $data)) {
            /* §22.3/§22.4 — ორი ღერძი (`Game::normalizeLink()`), ხოლო
               YouTube/Vimeo-ს ტრეილერი და გზამკვლევი ბმულად აღარ რჩება —
               შენახვის შემდეგ თამაშის ვიდეოდ ჯდება (`addVideos()`). */
            /* ⚠️ **`ksort` აუცილებელია**: `validate()` wildcard-ის მასივს **წესების**
               რიგით აგებს (`links.*.label` → `links.*.url` → …), ე.ი. როცა ბმულებს
               სხვადასხვა ველი აქვს (ერთს წარწერა აქვს, მეორეს — არა), გასაღებები
               1, 3, 0, 2-ად მოდის და `array_values` ბმულებს ჩუმად აურევდა. */
            $raw = $data['links'] ?? [];
            ksort($raw);

            [$game->links, $videos] = Game::splitVideoLinks(
                array_values(array_map(fn (array $link) => Game::normalizeLink($link), $raw)),
            );
        }

        // „ჩემი პლატფორმა" სიაშივე უნდა იყოს, თორემ ბარათი ისეთს აჩვენებდა,
        // რომელზეც თამაში საერთოდ არ გამოსულა
        if ($game->my_platform && ! in_array($game->my_platform, $game->platforms ?? [], true)) {
            $game->platforms = [...($game->platforms ?? []), $game->my_platform];
        }

        if ($request->has('is_favorite')) {
            $game->is_favorite = $request->boolean('is_favorite');
        }

        if ($request->boolean('remove_cover')) {
            $game->deleteCover();
            $game->cover_path = null;
            $game->cover_source = null;
        }

        if (array_key_exists('cover_url', $data)) {
            $game->cover_url = $data['cover_url'] ?: null;
        }

        if ($request->hasFile('cover')) {
            // 17.3 — `storeUpload()` ატვირთვამდე ამოწმებს კვოტას (ამოწურვაზე 413)
            $game->deleteCover();
            $game->cover_path = $this->meter
                ->storeUpload($request->user(), $request->file('cover'), StorageFolder::GAME_COVERS);
            $game->cover_source = 'upload';
            $game->cover_url = null;
        }

        return $videos;
    }

    /**
     * **ტრეილერი და გზამკვლევი — თამაშის ვიდეოებში** (Tasks §22.4, Q15).
     *
     * ⚠️ **შენახვის შემდეგ**: ახალ თამაშს `id` მხოლოდ ახლა აქვს.
     * ⚠️ **ერთი ვიდეო ორჯერ არ ემატება** — `platform` + `external_id`-ით
     * (FEAT-17-ის წესი: ერთ ვიდეოს ათი მისამართი აქვს, `?t=42`-იანიც).
     * ⚠️ ბმული **`GameVideo::applyUrl()`-ს** გადის — `VideoUrl`-ის allowlist და
     * embed სერვერზე იგება, ნედლი HTML არასდროს ინახება.
     *
     * @param  list<array{label: ?string, url: string, kind: string, store: ?string}>  $links
     */
    private function addVideos(Game $game, array $links, int $userId): void
    {
        if (! $links) {
            return;
        }

        $taken = $game->videos()->get(['platform', 'external_id'])
            ->map(fn (GameVideo $v) => $v->platform.':'.$v->external_id)
            ->all();
        $order = (int) $game->videos()->max('sort_order');

        foreach ($links as $link) {
            $meta = VideoUrl::parse($link['url']);
            $key = $meta['platform'].':'.$meta['external_id'];

            if (in_array($key, $taken, true)) {
                continue;
            }

            $video = new GameVideo([
                'user_id' => $userId,
                'game_id' => $game->id,
                'kind' => Game::VIDEO_LINK_KINDS[$link['kind']] ?? 'other',
                'title' => $link['label'],
                'sort_order' => ++$order,
            ]);
            $video->applyUrl($link['url']);
            $video->save();

            $taken[] = $key;
        }
    }

    /** ჟანრები pivot-ია; გასაღებები ვალიდაციაზე უკვე user-ზეა შემოწმებული */
    private function syncGenres(Game $game, array $data): void
    {
        if (array_key_exists('genre_ids', $data)) {
            $game->genres()->sync(array_map('intval', $data['genre_ids'] ?? []));
        }
    }

    /**
     * გარე წყაროს ყდის ჩამოტვირთვა შენახვისას.
     *
     * ⚠️ **კვოტაში არ ითვლება** (19.4/B) — TMDB-ის პოსტერივით ეს user-ის
     * ატვირთვა არაა. ფაილის სახელი წყაროს id-ია, ე.ი. საერთოა ანგარიშებს
     * შორის და ჩანაწერთან ერთად **არ იშლება** (`Game::deleteCover()`).
     *
     * ⚠️ **`cover_source` ორივე შემთხვევაში `'rawg'`-ია** და არა `'igdb'`:
     * ეს სვეტი „ატვირთულია თუ გარედან მოვიდა"-ს პასუხობს და მასზეა მიბმული
     * კვოტისა და წაშლის წესი (`Game::deleteCover()` მხოლოდ `'upload'`-ს შლის).
     * მესამე მნიშვნელობა ორივე ადგილას ცალკე `if`-ს დაამატებდა და პირველივე
     * გამორჩენა IGDB-ის ყდას ან წაშლიდა, ან სამუდამოდ კვოტაში დატოვებდა.
     */
    private function fetchCover(Game $game, Request $request): void
    {
        $url = $request->string('rawg_cover_url')->toString() ?: (string) $game->cover_url;

        // ფაილის სახელი წყაროს id-დან — ჯერ RAWG, მერე IGDB
        $name = $game->rawg_id ? "rawg-{$game->rawg_id}" : ($game->igdb_id ? "igdb-{$game->igdb_id}" : null);

        if (! $url || ! $name || $game->cover_path) {
            return;
        }

        $body = $game->rawg_id ? $this->rawg->image($url) : $this->igdb->image($url);

        if (! $body) {
            return;
        }

        $path = StorageFolder::GAME_COVERS."/{$name}.jpg";
        Storage::disk(StorageFolder::diskFor($path))->put($path, $body);

        $game->forceFill(['cover_path' => $path, 'cover_source' => 'rawg'])->save();
    }
}
