<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMovieRequest;
use App\Http\Requests\UpdateMovieRequest;
use App\Http\Resources\MovieListResource;
use App\Http\Resources\MovieResource;
use App\Models\Genre;
use App\Models\Movie;
use App\Services\Enrichment\MovieEnricher;
use App\Services\Storage\StorageMeter;
use App\Support\Like;
use App\Support\StorageFolder;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Str;

class MovieController extends Controller
{
    public function __construct(private StorageMeter $meter) {}

    /** ფილმების სია (ფილტრი: status, genre, favorite, q, sort) */
    public function index(Request $request)
    {
        $query = Movie::query()->with('genres');

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

        // ჟანრი მძიმით გამოყოფილი სიაც შეიძლება (2.2-ის პანელი მრავალს ნიშნავს):
        // თითოეული მონიშნული ჟანრი **ცალკე** whereHas-ია, ე.ი. ფილტრი ვიწროვდება.
        foreach ($this->slugList($request->string('genre')->toString()) as $slug) {
            $query->whereHas('genres', fn ($q) => $q->where('slug', $slug));
        }

        /* FEAT-18 — ტეგი მძიმით გამოყოფილი სიაა და **AND**-ით ვიწროვდება,
           ზუსტად ისე, როგორც ვიდეოზე; ჟანრთან ერთადაც მუშაობს, რადგან ორი
           სხვადასხვა ღერძია. */
        foreach ($this->slugList($request->string('tag')->toString()) as $tag) {
            $query->whereJsonContains('tags', $tag);
        }

        if ($q = $request->string('q')->toString()) {
            $query->whereHas('translations', fn ($t) => $t->where('title', 'like', Like::contains($q)));
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

        $sort = $request->string('sort')->toString();

        match ($sort) {
            'added_asc' => $query->orderBy('id'),
            'year_desc' => $query->orderByDesc('year'),
            'year_asc' => $query->orderBy('year'),
            'rating_desc', 'rating' => $query->orderByDesc('rating'),
            'rating_asc' => $query->orderBy('rating'),
            default => $query->orderByDesc('id'),
        };

        /* ⚠️ ფრანჩაიზა **გვერდის შიგნით** იკრიბება და არა მთელ ბიბლიოთეკაზე.
           ფრონტი ყოველთვის პირველ გვერდს ითხოვს და `per_page`-ს ზრდის
           („მეტის ჩვენება“), ე.ი. ჩატვირთული პრეფიქსი ყოველთვის სრულია და
           კლასტერი მასზე სწორად დგება. `annotateFranchise()` ბეჯს ისედაც
           ცალკე query-ით ითვლის, ე.ი. ქვესიმრავლეზეც მუშაობს. */
        $page = $this->paginated($request, $query);
        $movies = $page instanceof LengthAwarePaginator ? $page->getCollection() : $page;
        Movie::annotateFranchise($movies);

        // ჯგუფის (ფრანჩაიზის) გათვალისწინება — default ჩართული.
        // `group=0` → სუფთა დალაგება, ფრანჩაიზის ნაწილები დაიშლება (Tasks D1).
        if ($request->has('group') && ! $request->boolean('group')) {
            return MovieListResource::collection($page);
        }

        $clustered = $this->clusterByFranchise($movies, $sort);

        return MovieListResource::collection(
            $page instanceof LengthAwarePaginator ? $page->setCollection($clustered) : $clustered,
        );
    }

    /**
     * ფრანჩაიზის ნაწილები გვერდიგვერდ — კლასტერი დგება მისი პირველი (sort-ით)
     * ნაწილის პოზიციაზე, ე.ი. ახალი ნაწილის მქონე ჯგუფი year_desc-ზე თავში წამოვა.
     * უკოლექციო ფილმი ადგილზე რჩება.
     *
     * ჯგუფის შიგნით (Tasks D2): default-ად ახალი მარცხნივ, კლებადობით მარჯვნივ;
     * ზრდადი დალაგების არჩევისას მიმართულებას ვუსწორებთ, თორემ ჯგუფი სიის
     * მიმართულებას ეწინააღმდეგება.
     */
    private function clusterByFranchise($movies, string $sort = '')
    {
        $dir = str_ends_with($sort, '_asc') ? 'asc' : 'desc';

        $byCollection = $movies
            ->filter(fn ($m) => $m->tmdb_collection_id)
            ->sortBy([['year', $dir], ['id', $dir]])
            ->groupBy('tmdb_collection_id');

        $emitted = [];
        $out = [];
        foreach ($movies as $m) {
            $cid = $m->tmdb_collection_id;
            if (! $cid) {
                $out[] = $m;

                continue;
            }
            if (isset($emitted[$cid])) {
                continue;
            }
            $emitted[$cid] = true;
            foreach ($byCollection[$cid] as $part) {
                $out[] = $part;
            }
        }

        return collect($out);
    }

    /** ერთი ფილმი დეტალურად */
    public function show(Movie $movie)
    {
        $movie->load(['genres', 'cast']);
        Movie::annotateFranchise([$movie]);

        return new MovieResource($movie);
    }

    /** ახალი ფილმი */
    public function store(StoreMovieRequest $request)
    {
        $movie = new Movie;
        $this->applyData($movie, $request);
        $movie->save();
        $this->applyTranslations($movie, $request);
        $this->syncGenres($movie, $request->input('genres', []));

        $movie->load(['genres', 'cast']);

        return (new MovieResource($movie))->response()->setStatusCode(201);
    }

    /** TMDB id-ით პირდაპირ დამატება (შემოთავაზებიდან) — ქმნის + ამდიდრებს */
    public function storeFromTmdb(Request $request, MovieEnricher $enricher)
    {
        $data = $request->validate(['tmdb_id' => ['required', 'integer']]);

        if (! $enricher->configured()) {
            return response()->json(['message' => 'tmdb_not_configured'], 503);
        }

        $existing = Movie::where('tmdb_id', $data['tmdb_id'])->first();
        if ($existing) {
            $existing->load(['genres', 'cast']);

            return new MovieResource($existing);
        }

        $movie = new Movie(['tmdb_id' => $data['tmdb_id']]);
        $movie->save();

        try {
            $enricher->enrichMovie($movie);
        } catch (\Throwable $e) {
            $movie->sync_status = 'partial';
            $movie->save();
        }

        $movie->load(['genres', 'cast']);

        return (new MovieResource($movie))->response()->setStatusCode(201);
    }

    /** რედაქტირება */
    public function update(UpdateMovieRequest $request, Movie $movie)
    {
        $this->applyData($movie, $request);
        $movie->save();
        $this->applyTranslations($movie, $request);

        if ($request->has('genres')) {
            $this->syncGenres($movie, $request->input('genres', []));
        }

        $movie->load(['genres', 'cast']);

        return new MovieResource($movie);
    }

    /** წაშლა */
    public function destroy(Movie $movie)
    {
        /* ⚠️ **კალათა (FEAT-11)** — `delete()` კი არა, `moveToTrash()`.
           ჩანაწერი სიიდან ქრება, მაგრამ ბაზაში რჩება: ფაილები, ჩანიშვნები,
           გალერეა და კვოტა **არ** თავისუფლდება, ე.ი. აღდგენა უფასოა.
           ნამდვილი წაშლა სამ ადგილას ხდება — კალათიდან, `/purge`-იდან და
           ვადის (`TrashDomain::KEEP_DAYS`) ამოწურვისას. */
        $movie->moveToTrash();

        return response()->noContent();
    }

    /* ---------- დამხმარეები ---------- */

    private function applyData(Movie $movie, Request $request): void
    {
        // translation ველები (title_*, description_*) ცალკე მუშავდება — იხ. applyTranslations()
        foreach (['year', 'ge_url', 'trailer_url', 'rating', 'runtime'] as $field) {
            if ($request->has($field)) {
                $movie->{$field} = $request->input($field) ?: null;
            }
        }

        if ($request->has('imdb_id')) {
            $imdb = $request->string('imdb_id')->toString() ?: null;
            $movie->imdb_id = $imdb;
            $movie->imdb_url = $imdb ? "https://www.imdb.com/title/{$imdb}/" : null;
        }

        /* §6.4 — სტატუსსაც და `watched_at`-საც **ერთი ადგილი** წერს
           (`HasStatus::applyStatusKey()`): ორი ასლი მაშინვე დაშორდებოდა,
           რადგან „დასრულებულის“ კრიტერიუმი ახლა `role`-ია და არა სახელი. */
        if ($request->filled('status')) {
            $movie->applyStatusKey($request->string('status')->toString());
        }

        if ($request->has('is_favorite')) {
            $movie->is_favorite = $request->boolean('is_favorite');
        }

        /* FEAT-18 — პირადი ტეგები. ⚠️ ნორმალიზაცია `Video::normalizeTags()`-ზე
           გადის (`HasTags`), ე.ი. დუბლი ყველა მოდულში ერთნაირად იჭრება —
           ფორმის `dedupeTags()` და ეს ერთსა და იმავეს უნდა ითვლიდნენ. */
        if ($request->has('tags')) {
            $movie->tags = Movie::normalizeTags($request->input('tags') ?? []);
        }

        // Tasks 16.1 — ხილვადობა. ⚠️ `filled` და არა `has`: multipart-ზე ველი
        // შეიძლება ცარიელი მოვიდეს, რაც „არ შეცვალო"-ს ნიშნავს და არა `private`-ს.
        if ($request->filled('visibility')) {
            $movie->visibility = $request->string('visibility')->toString();
        }

        // 17.1 — მხოლოდ **ხელით ატვირთული** პოსტერი ითვლება კვოტაში (19.4/B),
        // ამიტომ წაშლაც `deleteUpload()`-ით ხდება, TMDB-ის ფაილი კი ხელუხლებელია
        if ($request->boolean('remove_poster')) {
            if ($movie->poster_source === 'upload') {
                $this->meter->deleteUpload($movie->user_id, $movie->poster_path);
            }
            $movie->poster_path = null;
            $movie->poster_source = null;
        }

        if ($request->hasFile('poster')) {
            if ($movie->poster_source === 'upload') {
                $this->meter->deleteUpload($movie->user_id, $movie->poster_path);
            }
            $movie->poster_path = $this->meter
                ->storeUpload($request->user(), $request->file('poster'), StorageFolder::MOVIE_POSTERS);
            $movie->poster_source = 'upload';
        }
    }

    /** translation ველების ჩაწერა request-იდან (title_*, description_*) */
    private function applyTranslations(Movie $movie, Request $request): void
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

            $existing = $movie->translations->firstWhere('locale', $loc);

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

            $movie->translations()->updateOrCreate(['locale' => $loc], $attrs);
        }
        $movie->load('translations');
    }

    /** ჟანრების სინქრონი — სახელების მასივიდან (firstOrCreate slug-ით) */
    private function syncGenres(Movie $movie, array $names): void
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
        $movie->genres()->sync($ids);
    }
}
