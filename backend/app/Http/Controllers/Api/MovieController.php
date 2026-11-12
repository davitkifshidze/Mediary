<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\FiltersMediaLibrary;
use App\Http\Controllers\Concerns\PicksRandomRecords;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMovieRequest;
use App\Http\Requests\UpdateMovieRequest;
use App\Http\Resources\MovieListResource;
use App\Http\Resources\MovieResource;
use App\Models\FranchisePart;
use App\Models\Genre;
use App\Models\Movie;
use App\Services\Enrichment\MovieEnricher;
use App\Services\Media\FranchiseTracker;
use App\Services\Storage\StorageMeter;
use App\Support\ColumnTrash;
use App\Support\CredentialProviders;
use App\Support\MediaDuplicate;
use App\Support\MissingCredential;
use App\Support\RecordLocks;
use App\Support\StorageFolder;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class MovieController extends Controller
{
    use FiltersMediaLibrary, PicksRandomRecords;

    public function __construct(private StorageMeter $meter) {}

    /** ფილმების სია (ფილტრი: status, genre, favorite, q, sort) */
    public function index(Request $request)
    {
        // ფილტრი ერთია სამივე მოდულზე — „ჩაკეტილი" ჭრილისაც (`FiltersMediaLibrary`)
        $query = $this->libraryQuery($request, Movie::class, 'movie');
        $locked = $request->boolean('locked');

        /* „რა ვნახო დღეს". ⚠️ **ფილტრების შემდეგ და დალაგებამდე**:
           არჩევანი ზუსტად იმ სიიდან უნდა მოდიოდეს, რომელსაც ეკრანზე ხედავ,
           დალაგებას კი შემთხვევით არჩევანზე აზრი არ აქვს. */
        if (! $locked && $request->string('pick')->toString() === 'random') {
            return $this->randomPick($request, $query);
        }

        $sort = $this->sortLibrary($query, $request);

        // „ჩაკეტილებში" დამალული ბოქლომიანი ბარათია — ფრანჩაიზად არ იკვრება
        if ($locked) {
            return MovieListResource::collection($this->paginated($request, $query));
        }

        // ჯგუფის (ფრანჩაიზის) გათვალისწინება — default ჩართული.
        // `group=0` → სუფთა დალაგება: ფრანჩაიზის ნაწილები დაიშლება და გვერდი ფილმებს ითვლის.
        if ($request->has('group') && ! $request->boolean('group')) {
            $page = $this->paginated($request, $query);
            Movie::annotateFranchise($page instanceof LengthAwarePaginator ? $page->getCollection() : $page);

            return MovieListResource::collection($page);
        }

        return $this->franchisePage($request, $query, $sort);
    }

    /**
     * **ფრანჩაიზი სიაში ერთი ერთეულია — და ერთეულები იკვრება გვერდებად დაჭრამდე.**
     *
     * ⚠️ ადრე სია ჯერ იჭრებოდა და ნაწილები მხოლოდ **იმ გვერდის შიგნით** იკვრებოდა:
     * სხვადასხვა გვერდზე მოხვედრილი ნაწილები ვერასდროს ერთდებოდა (SPA თითო გვერდს
     * ცალკე ითხოვს და `per_page`-ს აღარ ზრდის). ახლა ჯერ მთელი გაფილტრული სია
     * იკითხება მსუბუქად — id, კოლექცია, წელი —, მასზე ეწყობა ერთეულები, და იჭრება
     * **ერთეულების** სია: გვერდის ზომა და ბოლო გვერდი ერთეულებს ითვლის, ჯგუფი შუაზე
     * არასდროს იჭრება, მისი ყველა ნაწილი კი ერთ გვერდზეა, რომელზეც არ უნდა ყოფილიყო.
     *
     * ⚠️ `meta.total` ამიტომ **ერთეულების** რიცხვია; ფილმების რაოდენობა ცალკე მოდის
     * (`meta.records`) — სათაურის „N ფილმი" და „სულ N" მას აჩვენებს.
     */
    private function franchisePage(Request $request, Builder $query, string $sort)
    {
        $model = $query->getModel();

        $rows = (clone $query)->setEagerLoads([])->toBase()->get([
            $model->getQualifiedKeyName().' as id',
            $model->qualifyColumn('tmdb_collection_id'),
            $model->qualifyColumn('year'),
        ]);

        $units = collect($this->franchiseUnits($rows, $sort));
        $page = $this->paginated($request, $units);

        $ids = ($page instanceof LengthAwarePaginator ? $page->getCollection() : $page)->flatten()->all();
        $position = array_flip($ids);

        // ⚠️ იგივე scope-ები, რითაც id-ები ამოვიდა (`owner`, ურნა, დამალული) — მეორე კარი არ იხსნება
        $movies = Movie::query()->with('genres')->whereIn($model->getQualifiedKeyName(), $ids)->get()
            ->sortBy(fn (Movie $movie) => $position[$movie->id])
            ->values();

        Movie::annotateFranchise($movies);

        if ($this->wantsFranchiseGaps($request)) {
            $movies = $this->withFranchiseGaps($request, $movies, $sort);
        }

        return MovieListResource::collection(
            $page instanceof LengthAwarePaginator ? $page->setCollection($movies) : $movies,
        )->additional(['meta' => ['records' => $rows->count()]]);
    }

    /**
     * **დაუმატებელი ნაწილები ჯგუფში** — მხოლოდ მაშინ, როცა გვერდი ითხოვს (`franchise_gaps=1`)
     * და სია არაფრით არის დავიწროებული.
     *
     * ⚠️ გაფილტრულ სიაში (სტატუსი, ჟანრი, ძებნა…) მკრთალი ბარათი იმას არ პასუხობს, რაც
     * იკითხეს: „ნანახების" სიაში ჯერ დაუმატებელი ნაწილი უცხო სხეულია. სრულ სიაში კი
     * ფრანჩაიზი სრულად ჩანს — რაც მაქვს და რაც მაკლია.
     */
    private function wantsFranchiseGaps(Request $request): bool
    {
        return $request->boolean('franchise_gaps')
            && ! $this->filtersContent($request)
            && ! $request->filled('q');
    }

    /**
     * გვერდის ფრანჩაიზებს ემატება მათი დაუმატებელი ნაწილები (`FranchisePart`), ჯგუფის
     * შიგნით გამოსვლის წლით — იმავე მიმართულებით, რითაც ჯგუფია დალაგებული.
     *
     * ⚠️ გვერდის ზომასა და ჯამს ეს არ ცვლის: ერთეული ისევ ფრანჩაიზია, მკრთალი ბარათი კი
     * მისი ნაწილია და არა ჩანაწერი.
     *
     * @param  Collection<int, Movie>  $movies
     * @return Collection<int, Movie|FranchisePart>
     */
    private function withFranchiseGaps(Request $request, Collection $movies, string $sort): Collection
    {
        $collections = $movies->pluck('tmdb_collection_id')->filter()->unique()->map(fn ($id) => (int) $id)->values()->all();
        $gaps = app(FranchiseTracker::class)->gaps($request->user(), $collections);

        if ($gaps->isEmpty()) {
            return $movies;
        }

        $desc = ! str_ends_with($sort, '_asc');
        $year = fn (Movie|FranchisePart $item): ?int => $item instanceof FranchisePart ? $item->year() : $item->year;
        $out = collect();
        $done = [];

        foreach ($movies as $movie) {
            $collection = (int) $movie->tmdb_collection_id;

            if (! $collection || ! $gaps->has($collection)) {
                $out->push($movie);

                continue;
            }

            if (isset($done[$collection])) {
                continue;
            }

            $done[$collection] = true;

            // ჯგუფის ჩემი ნაწილები გვერდზე უკვე ერთად და დალაგებულია — დაუმატებელი მათ შორის ჩადგება
            $unit = $movies->where('tmdb_collection_id', $movie->tmdb_collection_id)->values()
                ->concat($gaps[$collection])
                ->sort(function ($a, $b) use ($year, $desc) {
                    // უწლო (მხოლოდ გამოცხადებული) ნაწილი ყოველთვის ახალია: კლებადში წინ, ზრდადში ბოლოს
                    [$ya, $yb] = [$year($a) ?? PHP_INT_MAX, $year($b) ?? PHP_INT_MAX];

                    return $desc ? $yb <=> $ya : $ya <=> $yb;
                });

            $out = $out->concat($unit);
        }

        return $out->values();
    }

    /**
     * **სიის ერთეულები** — თითო ერთეული ფილმების id-ების სიაა: ფრანჩაიზი თავისი ყველა
     * (ფილტრში მოხვედრილი) ნაწილით, ან ერთი უკოლექციო ფილმი.
     *
     * ერთეული დგება მისი პირველი (sort-ით) ნაწილის ადგილას, ე.ი. ახალი ნაწილის მქონე
     * ჯგუფი `year_desc`-ზე თავში წამოვა. ჯგუფის შიგნით ნაწილები გამოსვლის წლითაა:
     * ნაგულისხმევად ახალი წინ; ზრდადი დალაგებისას მიმართულება სიისას მიჰყვება, თორემ
     * ჯგუფი სიის მიმართულებას ეწინააღმდეგებოდა.
     *
     * @param  Collection<int, object{id: int, tmdb_collection_id: ?int, year: ?int}>  $rows  დალაგებული სია
     * @return list<list<int>>
     */
    private function franchiseUnits($rows, string $sort = ''): array
    {
        $dir = str_ends_with($sort, '_asc') ? 'asc' : 'desc';

        $byCollection = $rows
            ->filter(fn ($row) => $row->tmdb_collection_id)
            ->sortBy([['year', $dir], ['id', $dir]])
            ->groupBy('tmdb_collection_id');

        $emitted = [];
        $units = [];

        foreach ($rows as $row) {
            $collection = $row->tmdb_collection_id;

            if (! $collection) {
                $units[] = [(int) $row->id];

                continue;
            }

            if (isset($emitted[$collection])) {
                continue;
            }

            $emitted[$collection] = true;
            $units[] = $byCollection[$collection]->map(fn ($part) => (int) $part->id)->values()->all();
        }

        return $units;
    }

    /** ერთი ფილმი დეტალურად */
    public function show(Movie $movie)
    {
        // დამალული: ბოქლომიანი ბარათი (რესურსი თვითონ ჭრის); რელაციები ზედმეტია
        if (RecordLocks::hiddenRecord($movie)) {
            return new MovieResource($movie);
        }

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

    /**
     * TMDB id-ით პირდაპირ დამატება (შემოთავაზებიდან) — ქმნის + ამდიდრებს.
     *
     * `status` და `is_favorite` არჩევითია: ფრანჩაიზის პოპაპი
     * ბიბლიოთეკაში არარსებულ ნაწილს არჩეული სტატუსით და რჩეულად ამატებს.
     * ⚠️ უცნობი გასაღები ჩუმად ვარდება — ნაგულისხმევი სტატუსი რჩება.
     */
    public function storeFromTmdb(Request $request, MovieEnricher $enricher)
    {
        $data = $request->validate([
            'tmdb_id' => ['required', 'integer'],
            'status' => ['nullable', 'string', 'max:100'],
            'is_favorite' => ['nullable', 'boolean'],
        ]);

        if (! $enricher->configured()) {
            return MissingCredential::response(CredentialProviders::TMDB);
        }

        // ⚠️ ურნიანად — ურნაში მყოფი 409 `record_in_trash`-ია და არა ახალი რიგი
        $existing = MediaDuplicate::find('movie', Movie::class, (int) $request->user()->getKey(), ['tmdb_id' => $data['tmdb_id']]);
        if ($existing) {
            $existing->load(['genres', 'cast']);

            return new MovieResource($existing);
        }

        $movie = new Movie(['tmdb_id' => $data['tmdb_id']]);
        $movie->save();

        try {
            $enricher->enrichMovie($movie);
        } catch (\Throwable $e) {
            if ($e instanceof UniqueConstraintViolationException) {
                $existing = MediaDuplicate::resolveClash('movie', $movie, $e);
                $existing->load(['genres', 'cast']);

                return new MovieResource($existing);
            }
            $movie->sync_status = 'partial';
            $movie->save();
        }

        // გამდიდრების **შემდეგ**: `enrichMovie()` თვითონ იძახებს `save()`-ს და სტატუსს არ ეხება
        if (! empty($data['status'])) {
            $movie->applyStatusKey($data['status']);
        }
        if (isset($data['is_favorite'])) {
            $movie->is_favorite = (bool) $data['is_favorite'];
        }
        if ($movie->isDirty()) {
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
        /* ⚠️ **კალათა** — `delete()` კი არა, `moveToTrash()`.
           ჩანაწერი სიიდან ქრება, მაგრამ ბაზაში რჩება: ფაილები, ჩანიშვნები,
           გალერეა და კვოტა **არ** თავისუფლდება, ე.ი. აღდგენა უფასოა.
           ნამდვილი წაშლა სამ ადგილას ხდება — კალათიდან, `/purge`-იდან და
           ვადის (`UserSettings::trashDays()`) ამოწურვისას. */
        $movie->moveToTrash();

        return response()->noContent();
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * **„რა ვნახო დღეს" — შემთხვევითი ჩანაწერები**:
     * ლოგიკა `PicksRandomRecords`-შია, აქ მხოლოდ რესურსია. ⚠️ პასუხი
     * **სიაა** (`data: []`) — დიალოგი 1–5 ბარათს აჩვენებს; ცარიელი სია
     * მდგომარეობაა და არა შეცდომა.
     */
    private function randomPick(Request $request, $query)
    {
        return MovieResource::collection($this->randomRecords($request, $query, 'movies.id')->load(['genres', 'cast']));
    }

    private function applyData(Movie $movie, Request $request): void
    {
        // translation ველები (title_*, description_*) ცალკე მუშავდება — იხ. applyTranslations()
        // `my_rating` „ჩემი ქულაა", `rating` TMDB-ის საშუალო: ორი სვეტი, ორი აზრი
        foreach (['year', 'ge_url', 'trailer_url', 'rating', 'my_rating'] as $field) {
            if ($request->has($field)) {
                $movie->{$field} = $request->input($field) ?: null;
            }
        }

        if ($request->has('imdb_id')) {
            $imdb = $request->string('imdb_id')->toString() ?: null;
            $movie->imdb_id = $imdb;
            $movie->imdb_url = $imdb ? "https://www.imdb.com/title/{$imdb}/" : null;
        }

        /* სტატუსსაც და `watched_at`-საც **ერთი ადგილი** წერს
           (`HasStatus::applyStatusKey()`): ორი ასლი მაშინვე დაშორდებოდა,
           რადგან „დასრულებულის“ კრიტერიუმი ახლა `role`-ია და არა სახელი. */
        if ($request->filled('status')) {
            $movie->applyStatusKey($request->string('status')->toString());
        }

        if ($request->has('is_favorite')) {
            $movie->is_favorite = $request->boolean('is_favorite');
        }

        // ხილვადობა. ⚠️ `filled` და არა `has`: multipart-ზე ველი
        // შეიძლება ცარიელი მოვიდეს, რაც „არ შეცვალო"-ს ნიშნავს და არა `private`-ს.
        if ($request->filled('visibility')) {
            $movie->visibility = $request->string('visibility')->toString();
        }

        // მხოლოდ **ხელით ატვირთული** პოსტერი ითვლება კვოტაში,
        // ამიტომ წაშლაც `deleteUpload()`-ით ხდება, TMDB-ის ფაილი კი ხელუხლებელია
        if ($request->boolean('remove_poster')) {
            // ⚠️ ურნა — ძველი ატვირთული ფაილი ურნაში; TMDB-ის/გალერეის ფაილს ხელი არ ეხება
            ColumnTrash::capture($movie, 'poster_path', 'poster_source');
            $movie->poster_path = null;
            $movie->poster_source = null;
        }

        if ($request->hasFile('poster')) {
            // ⚠️ ურნა — ძველი ატვირთული ფაილი ურნაში; TMDB-ის/გალერეის ფაილს ხელი არ ეხება
            // ⚠️ ჯერ ახალი ფაილი: 413-ზე (კვოტა) ძველი ხელუხლებელი რჩება და ურნაში არ ხვდება
            $stored = $this->meter->storeUpload($request->user(), $request->file('poster'), StorageFolder::MOVIE_POSTERS);
            ColumnTrash::capture($movie, 'poster_path', 'poster_source');
            $movie->poster_path = $stored;
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

            /* ⚠️ **ხელით გადაწერილი აღწერა `manual`-ია**.
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
