<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BoardGameResource;
use App\Models\BoardGame;
use App\Services\BoardGames\BggClient;
use App\Services\BoardGames\GeorgianShops;
use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * ბორდგეიმების მოდული (`board_game`, Tasks §14).
 *
 * მფლობელობა — `BelongsToUser` global scope (სხვისი ჩანაწერი 404), უფლებები —
 * `permission:board_game` middleware. გამამდიდრებელი წყარო **BoardGameGeek**-ია
 * (XML API 2, კლავიშის გარეშე), ნაკადი კი TMDB-ის იდენტურია: ჯერ
 * კანდიდატების სია, მერე არჩეულის დრაფტი.
 */
class BoardGameController extends Controller
{
    public function __construct(
        private StorageMeter $meter,
        private BggClient $bgg,
        private GeorgianShops $shopSearch,
    ) {}

    public function index(Request $request)
    {
        $query = BoardGame::query()->with('genre')->withCount(['files', 'images', 'notes']);

        if ($status = $request->string('status')->toString()) {
            $query->where('status', $status);
        }
        if ($request->boolean('favorite')) {
            $query->where('is_favorite', true);
        }
        // ჟანრები/მექანიკები — მძიმით გამოყოფილი სია (5.2-ის წესი)
        if ($genres = $this->slugList($request->string('genre_id')->toString())) {
            $query->whereIn('genre_id', array_map('intval', $genres));
        }
        foreach ($this->slugList($request->string('mechanic')->toString()) as $mechanic) {
            $query->whereJsonContains('mechanics', $mechanic);
        }

        // „რამდენი კაცით ვთამაშობთ" — ყველაზე ხშირი კითხვა ბორდგეიმზე
        if ($request->filled('players')) {
            $players = $request->integer('players');
            $query->where(fn ($q) => $q
                ->whereNull('players_min')
                ->orWhere('players_min', '<=', $players))
                ->where(fn ($q) => $q
                    ->whereNull('players_max')
                    ->orWhere('players_max', '>=', $players));
        }

        if ($q = $request->string('q')->toString()) {
            $query->where(fn ($inner) => $inner
                ->where('title', 'like', "%{$q}%")
                ->orWhere('designer', 'like', "%{$q}%")
                ->orWhere('publisher', 'like', "%{$q}%")
                ->orWhere('mechanics', 'like', "%{$q}%"));
        }

        match ($request->string('sort')->toString()) {
            'title' => $query->orderBy('title'),
            'year' => $query->orderByDesc('year'),
            'rating' => $query->orderByDesc('rating'),
            'bgg' => $query->orderByDesc('bgg_rating'),
            'complexity' => $query->orderByDesc('complexity'),
            'playtime' => $query->orderBy('playtime_min'),
            'oldest' => $query->orderBy('id'),
            default => $query->orderByDesc('id'),
        };

        return BoardGameResource::collection($query->get());
    }

    public function show(BoardGame $boardGame)
    {
        return new BoardGameResource(
            $boardGame->load('genre')->loadCount(['files', 'images', 'notes']),
        );
    }

    public function store(Request $request)
    {
        $game = new BoardGame;
        $this->apply($game, $request, $this->validated($request));
        $game->save();

        $this->fetchImage($game, $request);

        return (new BoardGameResource($game->refresh()->load('genre')))
            ->response()->setStatusCode(201);
    }

    public function update(Request $request, BoardGame $boardGame)
    {
        $this->apply($boardGame, $request, $this->validated($request, $boardGame));
        $boardGame->save();

        return new BoardGameResource(
            $boardGame->load('genre')->loadCount(['files', 'images', 'notes']),
        );
    }

    public function destroy(BoardGame $boardGame)
    {
        // ფოტოსა და ფაილებს `BoardGame::booted()` შლის — კვოტაც იქვე თავისუფლდება
        $boardGame->delete();

        return response()->noContent();
    }

    public function toggleFavorite(BoardGame $boardGame)
    {
        $boardGame->is_favorite = ! $boardGame->is_favorite;
        $boardGame->save();

        return new BoardGameResource($boardGame->load('genre'));
    }

    /** სტატუსი ცალკე endpoint-ია — ბარათიდან ერთი კლიკია (მედიის ანალოგი) */
    public function setStatus(Request $request, BoardGame $boardGame)
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(BoardGame::STATUSES)],
        ]);

        $boardGame->status = $data['status'];
        $boardGame->save();

        return new BoardGameResource($boardGame->load('genre'));
    }

    /* ---------- BoardGameGeek (§14-ის enrichment) ---------- */

    /**
     * არჩევანის სია — ავტომატურად არაფერს ვამთხვევთ (BGG-ში ერთი თამაშის
     * ათი გამოცემაა).
     *
     * ⚠️ **ცარიელი სია და მიუწვდომელი წყარო ერთი და იგივე არაა.** BGG ამ
     * მანქანიდან Cloudflare-ის challenge-ს აბრუნებს (იხ. `BggClient`), და თუ
     * 503-ს არ დავაბრუნებდით, user-ს ეგონებოდა, რომ თამაში ბაზაში არ არსებობს.
     */
    public function candidates(Request $request)
    {
        $data = $request->validate(['query' => ['required', 'string', 'max:255']]);

        $results = $this->bgg->search($data['query']);

        if (! $results && $this->bgg->blocked()) {
            return response()->json(['message' => 'bgg_unavailable'], 503);
        }

        return response()->json(['results' => $results]);
    }

    /** არჩეულის სრული დრაფტი ფორმის შესავსებად — ჩანაწერს **არ ქმნის** */
    public function lookup(Request $request)
    {
        $data = $request->validate(['bgg_id' => ['required', 'integer', 'min:1']]);

        $draft = $this->bgg->details($data['bgg_id']);

        if (! $draft) {
            return response()->json([
                'message' => $this->bgg->blocked() ? 'bgg_unavailable' : 'not_found',
            ], $this->bgg->blocked() ? 503 : 404);
        }

        return response()->json(['draft' => $draft]);
    }

    /**
     * ქართული მაღაზიები — corners.ge / puzz.ge (Tasks §7.2).
     *
     * ⚠️ **GET და არა POST**: ეს ძებნაა და არაფერს ქმნის, POST-ზე კი
     * `EnsureModulePermission` მეთოდიდან `create`-ს გამოიყვანდა და ჩანაწერის
     * **რედაქტირებისას** (update-ის უფლებით) მაღაზიის მოძებნა 403-ს დააბრუნებდა.
     *
     * ⚠️ **მაღაზიის ჩავარდნა 200-ია და არა 5xx** — პასუხის `sources[]` წერს,
     * რომელი გაიხსნა (`ok`) და რამდენი იპოვა (`count`), ე.ი. „მაღაზია
     * მიუწვდომელია" და „ვერაფერი ვიპოვე" ინტერფეისზე ერთმანეთს არ ერევა.
     */
    public function shops(Request $request)
    {
        $data = $request->validate([
            'query' => ['required', 'string', 'max:255'],
            // მძიმით გამოყოფილი სია (`corners,puzz`); ცარიელი = ყველა მაღაზია
            'shops' => ['nullable', 'string', 'max:100'],
        ]);

        $only = array_values(array_intersect(
            $this->slugList($data['shops'] ?? null),
            array_keys(GeorgianShops::SHOPS),
        ));

        return response()->json($this->shopSearch->search($data['query'], $only));
    }

    /* ---------- დამხმარეები ---------- */

    private function validated(Request $request, ?BoardGame $game = null): array
    {
        $userId = $request->user()->id;

        return $request->validate([
            'title' => [$game ? 'sometimes' : 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:20000'],
            'year' => ['nullable', 'integer', 'min:1', 'max:2200'],

            'designer' => ['nullable', 'string', 'max:255'],
            'publisher' => ['nullable', 'string', 'max:255'],
            'genre_id' => [
                'nullable', 'integer',
                Rule::exists('board_game_genres', 'id')->where('user_id', $userId),
            ],
            'mechanics' => ['nullable', 'array', 'max:20'],
            'mechanics.*' => ['string', 'max:60'],

            'players_min' => ['nullable', 'integer', 'min:1', 'max:999'],
            'players_max' => ['nullable', 'integer', 'min:1', 'max:999', 'gte:players_min'],
            'age_min' => ['nullable', 'integer', 'min:1', 'max:120'],
            'playtime_min' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'playtime_max' => ['nullable', 'integer', 'min:1', 'max:10000', 'gte:playtime_min'],
            'complexity' => ['nullable', 'numeric', 'min:1', 'max:5'],

            'bgg_id' => [
                'nullable', 'integer', 'min:1',
                // ⚠️ უნიკალურობა **user-ზეა** — ორ ანგარიშს ერთი თამაში უნდა შეეძლოს
                Rule::unique('board_games', 'bgg_id')->where('user_id', $userId)->ignore($game?->id),
            ],
            'bgg_rating' => ['nullable', 'numeric', 'min:0', 'max:10'],

            'status' => ['nullable', Rule::in(BoardGame::STATUSES)],
            'rating' => ['nullable', 'integer', 'min:1', 'max:'.BoardGame::MAX_RATING],
            'is_favorite' => ['nullable', 'boolean'],

            // მაღაზიები: ფასი **ბმულზეა** და არა ჩანაწერზე (ორი მაღაზია, ორი ფასი)
            'links' => ['nullable', 'array', 'max:10'],
            'links.*.label' => ['nullable', 'string', 'max:60'],
            'links.*.url' => ['required_with:links', 'string', 'max:1000', 'url'],
            'links.*.price' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'links.*.currency' => ['nullable', 'string', 'max:8'],

            'image_url' => ['nullable', 'string', 'max:1000', 'url'],
            'image' => ['nullable', 'image', 'max:4096'],
            'remove_image' => ['nullable', 'boolean'],
            'visibility' => ['nullable', Rule::in(['private', 'public'])],
        ]);
    }

    private function apply(BoardGame $game, Request $request, array $data): void
    {
        $plain = [
            'title', 'description', 'year', 'designer', 'publisher',
            'players_min', 'players_max', 'age_min', 'playtime_min', 'playtime_max',
            'complexity', 'bgg_id', 'bgg_rating', 'rating',
        ];

        foreach ($plain as $field) {
            if (array_key_exists($field, $data)) {
                $game->{$field} = $data[$field] ?: null;
            }
        }

        if (array_key_exists('genre_id', $data)) {
            $game->genre_id = $data['genre_id'] ?: null;
        }
        foreach (['status', 'visibility'] as $field) {
            if (! empty($data[$field])) {
                $game->{$field} = $data[$field];
            }
        }
        if (array_key_exists('mechanics', $data)) {
            $game->mechanics = BoardGame::normalizeMechanics($data['mechanics'] ?? []);
        }
        if (array_key_exists('links', $data)) {
            $game->links = array_values(array_map(fn (array $link) => [
                'label' => $link['label'] ?? null,
                'url' => $link['url'],
                'price' => isset($link['price']) && $link['price'] !== '' ? (float) $link['price'] : null,
                'currency' => $link['currency'] ?? null,
            ], $data['links'] ?? []));
        }
        if ($request->has('is_favorite')) {
            $game->is_favorite = $request->boolean('is_favorite');
        }

        if ($request->boolean('remove_image')) {
            $game->deleteImage();
            $game->image_path = null;
            $game->image_source = null;
        }

        if (array_key_exists('image_url', $data)) {
            $game->image_url = $data['image_url'] ?: null;
        }

        if ($request->hasFile('image')) {
            // 17.3 — `storeUpload()` ატვირთვამდე ამოწმებს კვოტას (ამოწურვაზე 413)
            $game->deleteImage();
            $game->image_path = $this->meter
                ->storeUpload($request->user(), $request->file('image'), StorageFolder::BOARD_GAME_IMAGES);
            $game->image_source = 'upload';
            $game->image_url = null;
        }
    }

    /**
     * BGG-ის ფოტოს ჩამოტვირთვა შენახვისას.
     *
     * ⚠️ **კვოტაში არ ითვლება** (19.4/B) — TMDB-ის პოსტერივით ეს user-ის
     * ატვირთვა არაა. ფაილის სახელი `bgg_id`-ია, ე.ი. საერთოა ანგარიშებს
     * შორის და ჩანაწერთან ერთად **არ იშლება** (`BoardGame::deleteImage()`).
     */
    private function fetchImage(BoardGame $game, Request $request): void
    {
        $url = $request->string('bgg_image_url')->toString();

        if (! $url || ! $game->bgg_id || $game->image_path) {
            return;
        }

        $body = $this->bgg->image($url);

        if (! $body) {
            return;
        }

        $path = StorageFolder::BOARD_GAME_IMAGES."/bgg-{$game->bgg_id}.jpg";
        Storage::disk('public')->put($path, $body);

        $game->forceFill(['image_path' => $path, 'image_source' => 'bgg'])->save();
    }
}
