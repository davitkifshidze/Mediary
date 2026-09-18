<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAnimeRequest;
use App\Http\Requests\UpdateAnimeRequest;
use App\Http\Resources\AnimeListResource;
use App\Http\Resources\AnimeResource;
use App\Models\Anime;
use App\Models\Genre;
use App\Services\Enrichment\AnimeEnricher;
use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * **ანიმეების კონტროლერი (Tasks §7.1).**
 *
 * ⚠️ **სერიალის ზუსტი ასლია და ეს განზრახაა** (შენი მითითება: „ყველაფერი
 * თავისი ჰქონდეს"). გაზიარებული აქ მხოლოდ ის არის, რაც წყაროსთან საუბარს
 * ეხება (`TvEnricher`) — ჩანაწერის CRUD კი დომენს თავისი აქვს, რომ ერთი
 * ცხრილის `type` სვეტმა ყოველი query ჩუმად არ დაატოტოს.
 */
class AnimeController extends Controller
{
    public function __construct(private StorageMeter $meter) {}

    /** ანიმეების სია (ფილტრი: status, genre, favorite, q, sort) */
    public function index(Request $request)
    {
        $query = Anime::query()->with('genres');

        // §6.4 — სტატუსი ლექსიკონის რიგია; ფილტრი კვლავ **გასაღებით** მოდის
        // (`?view=watched`), ე.ი. ძველი ბმულები და საიდბარი უცვლელი რჩება.
        foreach ($this->slugList($request->string('status')->toString()) as $key) {
            $query->statusKey($key);
        }

        if ($request->boolean('favorite')) {
            $query->where('is_favorite', true);
        }

        if ($request->string('source')->toString() === 'synced') {
            $query->where('sync_status', 'synced');
        }

        // მძიმით გამოყოფილი ჟანრები — იგივე ლოგიკა, რაც ფილმებზე
        foreach ($this->slugList($request->string('genre')->toString()) as $slug) {
            $query->whereHas('genres', fn ($q) => $q->where('slug', $slug));
        }

        if ($q = $request->string('q')->toString()) {
            $query->whereHas('translations', fn ($t) => $t->where('title', 'like', "%{$q}%"));
        }

        // დიაპაზონის ფილტრები (კომბინირებადი)
        if ($request->filled('year_min')) {
            $query->where('year', '>=', $request->integer('year_min'));
        }
        if ($request->filled('year_max')) {
            $query->where('year', '<=', $request->integer('year_max'));
        }
        if ($request->filled('rating_min')) {
            $query->where('rating', '>=', $request->float('rating_min'));
        }
        if ($request->filled('rating_max')) {
            $query->where('rating', '<=', $request->float('rating_max'));
        }

        match ($request->string('sort')->toString()) {
            'added_asc' => $query->orderBy('id'),
            'year_desc' => $query->orderByDesc('year'),
            'year_asc' => $query->orderBy('year'),
            'rating_desc', 'rating' => $query->orderByDesc('rating'),
            'rating_asc' => $query->orderBy('rating'),
            default => $query->orderByDesc('id'),
        };

        return AnimeListResource::collection($this->paginated($request, $query));
    }

    /** ერთი ანიმე დეტალურად */
    public function show(Anime $anime)
    {
        $anime->load(['genres', 'cast']);

        return new AnimeResource($anime);
    }

    /** ახალი ანიმე */
    public function store(StoreAnimeRequest $request)
    {
        $anime = new Anime;
        $this->applyData($anime, $request);
        $anime->save();
        $this->applyTranslations($anime, $request);
        $this->syncGenres($anime, $request->input('genres', []));

        $anime->load(['genres', 'cast']);

        return (new AnimeResource($anime))->response()->setStatusCode(201);
    }

    /** TMDB id-ით პირდაპირ დამატება (შემოთავაზებიდან) — ქმნის + ამდიდრებს */
    public function storeFromTmdb(Request $request, AnimeEnricher $enricher)
    {
        $data = $request->validate(['tmdb_id' => ['required', 'integer']]);

        if (! $enricher->configured()) {
            return response()->json(['message' => 'tmdb_not_configured'], 503);
        }

        $existing = Anime::where('tmdb_id', $data['tmdb_id'])->first();
        if ($existing) {
            $existing->load(['genres', 'cast']);

            return new AnimeResource($existing);
        }

        $anime = new Anime(['tmdb_id' => $data['tmdb_id']]);
        $anime->save();

        try {
            $enricher->enrichAnime($anime);
        } catch (\Throwable $e) {
            $anime->sync_status = 'partial';
            $anime->save();
        }

        $anime->load(['genres', 'cast']);

        return (new AnimeResource($anime))->response()->setStatusCode(201);
    }

    /** რედაქტირება */
    public function update(UpdateAnimeRequest $request, Anime $anime)
    {
        $this->applyData($anime, $request);
        $anime->save();
        $this->applyTranslations($anime, $request);

        if ($request->has('genres')) {
            $this->syncGenres($anime, $request->input('genres', []));
        }

        $anime->load(['genres', 'cast']);

        return new AnimeResource($anime);
    }

    /** წაშლა */
    public function destroy(Anime $anime)
    {
        // ⚠️ პოსტერს `Anime::booted()` შლის — იხ. `Movie::deletePoster()`
        $anime->delete();

        return response()->noContent();
    }

    /* ---------- დამხმარეები ---------- */

    private function applyData(Anime $anime, Request $request): void
    {
        // translation ველები (title_*, description_*) ცალკე მუშავდება — იხ. applyTranslations()
        foreach (['year', 'ge_url', 'trailer_url', 'rating', 'runtime', 'seasons', 'episodes'] as $field) {
            if ($request->has($field)) {
                $anime->{$field} = $request->input($field) ?: null;
            }
        }

        if ($request->has('imdb_id')) {
            $imdb = $request->string('imdb_id')->toString() ?: null;
            $anime->imdb_id = $imdb;
            $anime->imdb_url = $imdb ? "https://www.imdb.com/title/{$imdb}/" : null;
        }

        /* §6.4 — სტატუსსაც და `watched_at`-საც **ერთი ადგილი** წერს
           (`HasStatus::applyStatusKey()`): ორი ასლი მაშინვე დაშორდებოდა,
           რადგან „დასრულებულის“ კრიტერიუმი ახლა `role`-ია და არა სახელი. */
        if ($request->filled('status')) {
            $anime->applyStatusKey($request->string('status')->toString());
        }

        if ($request->has('is_favorite')) {
            $anime->is_favorite = $request->boolean('is_favorite');
        }

        // Tasks 16.1 — ხილვადობა. ⚠️ `filled` და არა `has`: multipart-ზე ველი
        // შეიძლება ცარიელი მოვიდეს, რაც „არ შეცვალო"-ს ნიშნავს და არა `private`-ს.
        if ($request->filled('visibility')) {
            $anime->visibility = $request->string('visibility')->toString();
        }

        // 17.1 — იხ. `MovieController`-ის იგივე ბლოკი: კვოტაში მხოლოდ ხელით
        // ატვირთული პოსტერი ითვლება (19.4/B)
        if ($request->boolean('remove_poster')) {
            if ($anime->poster_source === 'upload') {
                $this->meter->deleteUpload($anime->user_id, $anime->poster_path);
            }
            $anime->poster_path = null;
            $anime->poster_source = null;
        }

        if ($request->hasFile('poster')) {
            if ($anime->poster_source === 'upload') {
                $this->meter->deleteUpload($anime->user_id, $anime->poster_path);
            }
            $anime->poster_path = $this->meter
                ->storeUpload($request->user(), $request->file('poster'), StorageFolder::ANIME_POSTERS);
            $anime->poster_source = 'upload';
        }
    }

    /** translation ველების ჩაწერა request-იდან (title_*, description_*) */
    private function applyTranslations(Anime $anime, Request $request): void
    {
        foreach (['ka', 'en'] as $loc) {
            $attrs = [];
            if ($request->has("title_$loc")) {
                $attrs['title'] = $request->input("title_$loc") ?: null;
            }
            if ($request->has("description_$loc")) {
                $attrs['description'] = $request->input("description_$loc") ?: null;
            }
            if (! $attrs) {
                continue;
            }

            $existing = $anime->translations->firstWhere('locale', $loc);

            /* ⚠️ **ხელით გადაწერილი აღწერა `manual`-ია** (Tasks §7).
               უამისოდ ჩანაწერი „მანქანურ თარგმანად" რჩებოდა მას შემდეგაც,
               რაც user თვითონ გადაწერდა — ბარათზე მითითებული წყარო ტყუოდა.
               ⚠️ ვნიშნავთ **მხოლოდ მაშინ, როცა ტექსტი მართლა შეიცვალა**:
               ფორმის უბრალო შენახვა TMDB-ის ტექსტს „ხელით დაწერილად"
               არ უნდა აქცევდეს. */
            if (array_key_exists('description', $attrs)
                && $attrs['description'] !== ($existing->description ?? null)) {
                $attrs['source'] = 'manual';
            }

            $anime->translations()->updateOrCreate(['locale' => $loc], $attrs);
        }
        $anime->load('translations');
    }

    /** ჟანრების სინქრონი — სახელების მასივიდან (firstOrCreate slug-ით) */
    private function syncGenres(Anime $anime, array $names): void
    {
        $ids = [];
        foreach (array_filter(array_map('trim', $names)) as $name) {
            $slug = Str::slug($name) ?: 'g-'.substr(md5($name), 0, 8);
            $genre = Genre::firstOrCreate(['slug' => $slug]);
            if ($genre->wasRecentlyCreated) {
                $genre->setTranslation('en', $name);
                $genre->setTranslation('ka', $name);
            }
            $ids[] = $genre->id;
        }
        $anime->genres()->sync($ids);
    }
}
