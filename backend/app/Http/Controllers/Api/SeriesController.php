<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSeriesRequest;
use App\Http\Requests\UpdateSeriesRequest;
use App\Http\Resources\SeriesListResource;
use App\Http\Resources\SeriesResource;
use App\Models\Genre;
use App\Models\Series;
use App\Services\Enrichment\SeriesEnricher;
use App\Services\Storage\StorageMeter;
use App\Support\Like;
use App\Support\StorageFolder;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class SeriesController extends Controller
{
    public function __construct(private StorageMeter $meter) {}

    /** სერიალების სია (ფილტრი: status, genre, favorite, q, sort) */
    public function index(Request $request)
    {
        $query = Series::query()->with('genres');

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

        // მძიმით გამოყოფილი ჟანრები — იგივე ლოგიკა, რაც ფილმებზე (2.2)
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

        match ($request->string('sort')->toString()) {
            'added_asc' => $query->orderBy('id'),
            'year_desc' => $query->orderByDesc('year'),
            'year_asc' => $query->orderBy('year'),
            'rating_desc', 'rating' => $query->orderByDesc('rating'),
            'rating_asc' => $query->orderBy('rating'),
            default => $query->orderByDesc('id'),
        };

        return SeriesListResource::collection($this->paginated($request, $query));
    }

    /** ერთი სერიალი დეტალურად */
    public function show(Series $series)
    {
        $series->load(['genres', 'cast']);

        return new SeriesResource($series);
    }

    /** ახალი სერიალი */
    public function store(StoreSeriesRequest $request)
    {
        $series = new Series;
        $this->applyData($series, $request);
        $series->save();
        $this->applyTranslations($series, $request);
        $this->syncGenres($series, $request->input('genres', []));

        $series->load(['genres', 'cast']);

        return (new SeriesResource($series))->response()->setStatusCode(201);
    }

    /** TMDB id-ით პირდაპირ დამატება (შემოთავაზებიდან) — ქმნის + ამდიდრებს */
    public function storeFromTmdb(Request $request, SeriesEnricher $enricher)
    {
        $data = $request->validate(['tmdb_id' => ['required', 'integer']]);

        if (! $enricher->configured()) {
            return response()->json(['message' => 'tmdb_not_configured'], 503);
        }

        $existing = Series::where('tmdb_id', $data['tmdb_id'])->first();
        if ($existing) {
            $existing->load(['genres', 'cast']);

            return new SeriesResource($existing);
        }

        $series = new Series(['tmdb_id' => $data['tmdb_id']]);
        $series->save();

        try {
            $enricher->enrichSeries($series);
        } catch (\Throwable $e) {
            $series->sync_status = 'partial';
            $series->save();
        }

        $series->load(['genres', 'cast']);

        return (new SeriesResource($series))->response()->setStatusCode(201);
    }

    /** რედაქტირება */
    public function update(UpdateSeriesRequest $request, Series $series)
    {
        $this->applyData($series, $request);
        $series->save();
        $this->applyTranslations($series, $request);

        if ($request->has('genres')) {
            $this->syncGenres($series, $request->input('genres', []));
        }

        $series->load(['genres', 'cast']);

        return new SeriesResource($series);
    }

    /** წაშლა */
    public function destroy(Series $series)
    {
        /* ⚠️ **კალათა (FEAT-11)** — `delete()` კი არა, `moveToTrash()`.
           ჩანაწერი სიიდან ქრება, მაგრამ ბაზაში რჩება: ფაილები, ჩანიშვნები,
           გალერეა და კვოტა **არ** თავისუფლდება, ე.ი. აღდგენა უფასოა.
           ნამდვილი წაშლა სამ ადგილას ხდება — კალათიდან, `/purge`-იდან და
           ვადის (`TrashDomain::KEEP_DAYS`) ამოწურვისას. */
        $series->moveToTrash();

        return response()->noContent();
    }

    /* ---------- დამხმარეები ---------- */

    private function applyData(Series $series, Request $request): void
    {
        // translation ველები (title_*, description_*) ცალკე მუშავდება — იხ. applyTranslations()
        foreach (['year', 'ge_url', 'trailer_url', 'rating', 'runtime', 'seasons', 'episodes'] as $field) {
            if ($request->has($field)) {
                $series->{$field} = $request->input($field) ?: null;
            }
        }

        if ($request->has('imdb_id')) {
            $imdb = $request->string('imdb_id')->toString() ?: null;
            $series->imdb_id = $imdb;
            $series->imdb_url = $imdb ? "https://www.imdb.com/title/{$imdb}/" : null;
        }

        /* §6.4 — სტატუსსაც და `watched_at`-საც **ერთი ადგილი** წერს
           (`HasStatus::applyStatusKey()`): ორი ასლი მაშინვე დაშორდებოდა,
           რადგან „დასრულებულის“ კრიტერიუმი ახლა `role`-ია და არა სახელი. */
        if ($request->filled('status')) {
            $series->applyStatusKey($request->string('status')->toString());
        }

        if ($request->has('is_favorite')) {
            $series->is_favorite = $request->boolean('is_favorite');
        }

        /* FEAT-18 — პირადი ტეგები. ⚠️ ნორმალიზაცია `Video::normalizeTags()`-ზე
           გადის (`HasTags`), ე.ი. დუბლი ყველა მოდულში ერთნაირად იჭრება —
           ფორმის `dedupeTags()` და ეს ერთსა და იმავეს უნდა ითვლიდნენ. */
        if ($request->has('tags')) {
            $series->tags = Series::normalizeTags($request->input('tags') ?? []);
        }

        // Tasks 16.1 — ხილვადობა. ⚠️ `filled` და არა `has`: multipart-ზე ველი
        // შეიძლება ცარიელი მოვიდეს, რაც „არ შეცვალო"-ს ნიშნავს და არა `private`-ს.
        if ($request->filled('visibility')) {
            $series->visibility = $request->string('visibility')->toString();
        }

        // 17.1 — იხ. `MovieController`-ის იგივე ბლოკი: კვოტაში მხოლოდ ხელით
        // ატვირთული პოსტერი ითვლება (19.4/B)
        if ($request->boolean('remove_poster')) {
            if ($series->poster_source === 'upload') {
                $this->meter->deleteUpload($series->user_id, $series->poster_path);
            }
            $series->poster_path = null;
            $series->poster_source = null;
        }

        if ($request->hasFile('poster')) {
            if ($series->poster_source === 'upload') {
                $this->meter->deleteUpload($series->user_id, $series->poster_path);
            }
            $series->poster_path = $this->meter
                ->storeUpload($request->user(), $request->file('poster'), StorageFolder::SERIES_POSTERS);
            $series->poster_source = 'upload';
        }
    }

    /** translation ველების ჩაწერა request-იდან (title_*, description_*) */
    private function applyTranslations(Series $series, Request $request): void
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

            $existing = $series->translations->firstWhere('locale', $loc);

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

            $series->translations()->updateOrCreate(['locale' => $loc], $attrs);
        }
        $series->load('translations');
    }

    /** ჟანრების სინქრონი — სახელების მასივიდან (firstOrCreate slug-ით) */
    private function syncGenres(Series $series, array $names): void
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
        $series->genres()->sync($ids);
    }
}
