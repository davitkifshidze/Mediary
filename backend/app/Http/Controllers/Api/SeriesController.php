<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\FiltersMediaLibrary;
use App\Http\Controllers\Concerns\PicksRandomRecords;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSeriesRequest;
use App\Http\Requests\UpdateSeriesRequest;
use App\Http\Resources\SeriesListResource;
use App\Http\Resources\SeriesResource;
use App\Models\Genre;
use App\Models\Series;
use App\Services\Enrichment\SeriesEnricher;
use App\Services\Storage\StorageMeter;
use App\Support\ColumnTrash;
use App\Support\CredentialProviders;
use App\Support\MediaDuplicate;
use App\Support\MissingCredential;
use App\Support\RecordLocks;
use App\Support\StorageFolder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class SeriesController extends Controller
{
    use FiltersMediaLibrary, PicksRandomRecords;

    public function __construct(private StorageMeter $meter) {}

    /** სერიალების სია (ფილტრი: status, genre, favorite, q, sort) */
    public function index(Request $request)
    {
        // ფილტრი ერთია სამივე მოდულზე — „ჩაკეტილი" ჭრილისაც (`FiltersMediaLibrary`)
        $query = $this->libraryQuery($request, Series::class, 'series');
        $locked = $request->boolean('locked');

        /* „რა ვნახო დღეს". ⚠️ **ფილტრების შემდეგ და დალაგებამდე**:
           არჩევანი ზუსტად იმ სიიდან უნდა მოდიოდეს, რომელსაც ეკრანზე ხედავ,
           დალაგებას კი შემთხვევით არჩევანზე აზრი არ აქვს. */
        if (! $locked && $request->string('pick')->toString() === 'random') {
            return $this->randomPick($request, $query);
        }

        $this->sortLibrary($query, $request);

        return SeriesListResource::collection($this->paginated($request, $query));
    }

    /** ერთი სერიალი დეტალურად */
    public function show(Series $series)
    {
        // დამალული: ბოქლომიანი ბარათი (რესურსი თვითონ ჭრის); რელაციები ზედმეტია
        if (RecordLocks::hiddenRecord($series)) {
            return new SeriesResource($series);
        }

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
            return MissingCredential::response(CredentialProviders::TMDB);
        }

        // ⚠️ ურნიანად — ურნაში მყოფი 409 `record_in_trash`-ია და არა ახალი რიგი
        $existing = MediaDuplicate::find('series', Series::class, (int) $request->user()->getKey(), ['tmdb_id' => $data['tmdb_id']]);
        if ($existing) {
            $existing->load(['genres', 'cast']);

            return new SeriesResource($existing);
        }

        $series = new Series(['tmdb_id' => $data['tmdb_id']]);
        $series->save();

        try {
            $enricher->enrichSeries($series);
        } catch (\Throwable $e) {
            if ($e instanceof UniqueConstraintViolationException) {
                $existing = MediaDuplicate::resolveClash('series', $series, $e);
                $existing->load(['genres', 'cast']);

                return new SeriesResource($existing);
            }
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
        /* ⚠️ **კალათა** — `delete()` კი არა, `moveToTrash()`.
           ჩანაწერი სიიდან ქრება, მაგრამ ბაზაში რჩება: ფაილები, ჩანიშვნები,
           გალერეა და კვოტა **არ** თავისუფლდება, ე.ი. აღდგენა უფასოა.
           ნამდვილი წაშლა სამ ადგილას ხდება — კალათიდან, `/purge`-იდან და
           ვადის (`UserSettings::trashDays()`) ამოწურვისას. */
        $series->moveToTrash();

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
        return SeriesResource::collection($this->randomRecords($request, $query, 'series.id')->load(['genres', 'cast']));
    }

    private function applyData(Series $series, Request $request): void
    {
        // translation ველები (title_*, description_*) ცალკე მუშავდება — იხ. applyTranslations()
        // `my_rating` „ჩემი ქულაა", `rating` TMDB-ის საშუალო: ორი სვეტი, ორი აზრი
        foreach (['year', 'ge_url', 'trailer_url', 'rating', 'my_rating', 'runtime', 'seasons', 'episodes'] as $field) {
            if ($request->has($field)) {
                $series->{$field} = $request->input($field) ?: null;
            }
        }

        if ($request->has('imdb_id')) {
            $imdb = $request->string('imdb_id')->toString() ?: null;
            $series->imdb_id = $imdb;
            $series->imdb_url = $imdb ? "https://www.imdb.com/title/{$imdb}/" : null;
        }

        /* სტატუსსაც და `watched_at`-საც **ერთი ადგილი** წერს
           (`HasStatus::applyStatusKey()`): ორი ასლი მაშინვე დაშორდებოდა,
           რადგან „დასრულებულის“ კრიტერიუმი ახლა `role`-ია და არა სახელი. */
        if ($request->filled('status')) {
            $series->applyStatusKey($request->string('status')->toString());
        }

        if ($request->has('is_favorite')) {
            $series->is_favorite = $request->boolean('is_favorite');
        }

        // ხილვადობა. ⚠️ `filled` და არა `has`: multipart-ზე ველი
        // შეიძლება ცარიელი მოვიდეს, რაც „არ შეცვალო"-ს ნიშნავს და არა `private`-ს.
        if ($request->filled('visibility')) {
            $series->visibility = $request->string('visibility')->toString();
        }

        // იხ. `MovieController`-ის იგივე ბლოკი: კვოტაში მხოლოდ ხელით
        // ატვირთული პოსტერი ითვლება
        if ($request->boolean('remove_poster')) {
            // ⚠️ ურნა — ძველი ატვირთული ფაილი ურნაში; TMDB-ის/გალერეის ფაილს ხელი არ ეხება
            ColumnTrash::capture($series, 'poster_path', 'poster_source');
            $series->poster_path = null;
            $series->poster_source = null;
        }

        if ($request->hasFile('poster')) {
            // ⚠️ ურნა — ძველი ატვირთული ფაილი ურნაში; TMDB-ის/გალერეის ფაილს ხელი არ ეხება
            // ⚠️ ჯერ ახალი ფაილი: 413-ზე (კვოტა) ძველი ხელუხლებელი რჩება და ურნაში არ ხვდება
            $stored = $this->meter->storeUpload($request->user(), $request->file('poster'), StorageFolder::SERIES_POSTERS);
            ColumnTrash::capture($series, 'poster_path', 'poster_source');
            $series->poster_path = $stored;
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
