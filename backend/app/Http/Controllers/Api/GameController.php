<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\GameResource;
use App\Models\Game;
use App\Services\Games\IgdbClient;
use App\Services\Games\RawgClient;
use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
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
                ->where('title_ka', 'like', "%{$q}%")
                ->orWhere('title_en', 'like', "%{$q}%")
                ->orWhere('developer', 'like', "%{$q}%")
                ->orWhere('publisher', 'like', "%{$q}%")
                ->orWhere('franchise', 'like', "%{$q}%"));
        }

        match ($request->string('sort')->toString()) {
            'title' => $query->orderBy('title_en')->orderBy('title_ka'),
            // ⚠️ `year` სვეტი არ არსებობს (აქსესორია) — სორტირება თარიღზეა
            'year' => $query->orderByDesc('release_date'),
            'rating' => $query->orderByDesc('rating'),
            'metacritic' => $query->orderByDesc('metacritic'),
            'playtime' => $query->orderBy('hltb_main'),
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
        $this->apply($game, $request, $data);
        $game->save();

        $this->syncGenres($game, $data);
        $this->fetchCover($game, $request);

        return (new GameResource($game->refresh()->load('genres')))
            ->response()->setStatusCode(201);
    }

    public function update(Request $request, Game $game)
    {
        $data = $this->validated($request, $game);
        $this->apply($game, $request, $data);
        $game->save();

        $this->syncGenres($game, $data);

        return new GameResource(
            $game->load(['genres', 'videos'])
                ->loadCount(['videos', 'files', 'images', 'notes', 'galleryImages']),
        );
    }

    public function destroy(Game $game)
    {
        // ყდას, ფაილებსა და გალერეას `Game::booted()` შლის — კვოტაც იქვე თავისუფლდება
        $game->delete();

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

            'genre_ids' => ['nullable', 'array', 'max:10'],
            'genre_ids.*' => [
                'integer',
                Rule::exists('game_genres', 'id')->where('user_id', $userId),
            ],

            // HowLongToBeat — ხელით (11.4). ⚠️ **წუთები** (§2.5), ე.ი. ჭერი
            // იგივე 2000 საათია, ოღონდ 120 000 წუთად დაწერილი.
            'hltb_main' => ['nullable', 'integer', 'min:0', 'max:120000'],
            'hltb_main_extra' => ['nullable', 'integer', 'min:0', 'max:120000'],
            'hltb_complete' => ['nullable', 'integer', 'min:0', 'max:120000'],

            'metacritic' => ['nullable', 'integer', 'min:0', 'max:100'],
            'opencritic' => ['nullable', 'integer', 'min:0', 'max:100'],
            'users_score' => ['nullable', 'numeric', 'min:0', 'max:5'],
            'rating' => ['nullable', 'integer', 'min:1', 'max:'.Game::MAX_RATING],

            'links' => ['nullable', 'array', 'max:10'],
            'links.*.label' => ['nullable', 'string', 'max:60'],
            'links.*.url' => ['required_with:links', 'string', 'max:1000', 'url'],
            'links.*.kind' => ['nullable', Rule::in(Game::LINK_KINDS)],

            'status' => ['nullable', Rule::in(Game::STATUSES)],
            'is_favorite' => ['nullable', 'boolean'],

            'age_rating' => ['nullable', 'string', 'max:20'],
            'languages' => ['nullable', 'array'],
            'languages.interface' => ['nullable', 'array', 'max:30'],
            'languages.interface.*' => ['string', 'max:40'],
            'languages.audio' => ['nullable', 'array', 'max:30'],
            'languages.audio.*' => ['string', 'max:40'],
            'languages.subtitles' => ['nullable', 'array', 'max:30'],
            'languages.subtitles.*' => ['string', 'max:40'],
            'size_gb' => ['nullable', 'numeric', 'min:0', 'max:99999'],
            'dlcs' => ['nullable', 'array', 'max:50'],
            'dlcs.*.name' => ['required_with:dlcs', 'string', 'max:255'],
            'dlcs.*.note' => ['nullable', 'string', 'max:500'],

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

    private function apply(Game $game, Request $request, array $data): void
    {
        $plain = [
            'title_ka', 'title_en', 'description_ka', 'description_en',
            'release_date', 'developer', 'publisher', 'franchise', 'my_platform',
            'hltb_main', 'hltb_main_extra', 'hltb_complete',
            'metacritic', 'opencritic', 'users_score', 'rating',
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
        if (array_key_exists('languages', $data)) {
            $game->languages = array_filter([
                'interface' => array_values($data['languages']['interface'] ?? []),
                'audio' => array_values($data['languages']['audio'] ?? []),
                'subtitles' => array_values($data['languages']['subtitles'] ?? []),
            ]) ?: null;
        }
        if (array_key_exists('dlcs', $data)) {
            $game->dlcs = array_values(array_map(fn (array $dlc) => [
                'name' => $dlc['name'],
                'note' => $dlc['note'] ?? null,
            ], $data['dlcs'] ?? []));
        }
        if (array_key_exists('links', $data)) {
            $game->links = array_values(array_map(fn (array $link) => [
                'label' => $link['label'] ?? null,
                'url' => $link['url'],
                'kind' => $link['kind'] ?? 'other',
            ], $data['links'] ?? []));
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
