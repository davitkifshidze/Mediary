<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlaceResource;
use App\Models\GalleryImage;
use App\Models\Place;
use App\Services\Places\PlaceSearch;
use App\Services\Serp\WebImageImporter;
use App\Services\Stats\LibraryStats;
use App\Services\Storage\StorageMeter;
use App\Support\ColumnTrash;
use App\Support\GalleryParent;
use App\Support\Like;
use App\Support\Rating;
use App\Support\RichText;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * ადგილების მოდული (`place`).
 *
 * მფლობელობა — `BelongsToUser` global scope (სხვისი ჩანაწერი 404), უფლებები —
 * `permission:place` middleware.
 *
 * ⚠️ **წყარო OSM Nominatim-ია და უფასოა** — გასაღები არ სჭირდება, ე.ი.
 * კანდიდატების ნაკადი (`candidates → lookup`) აქ ნამდვილად მუშაობს,
 * განსხვავებით კურსებისგან.
 *
 * ⚠️ **„წყარო არ პასუხობს" ≠ „ვერაფერი ვიპოვე"**: პირველი **503
 * `places_unavailable`**-ია, მეორე — 200 ცარიელი სიით. ცარიელი სია
 * „ასეთი ადგილი არ არსებობს"-ად იკითხება და ხელით შევსებას აჩერებს.
 *
 * ⚠️ **წყაროები `PlaceSearch`-შია** (Google Places → SerpApi →
 * Serper → Nominatim): წერისას შემოთავაზება (`live`, მხოლოდ Google), ცხადი
 * ძებნა, არჩეულის დეტალები, Google Maps-ის ბმული და უკუ-გეოკოდირება. შენახვისას
 * ტელეფონი, ვებგვერდი, საათები და წყაროს რეიტინგი ცალკე სვეტებია, წყაროს
 * ფოტოები კი (`gallery_urls`) ადგილის გალერეაში ჩამოდის — პირველი, თუ ფოტო ჯერ
 * არ გაქვს, მთავარი ხდება.
 */
class PlaceController extends Controller
{
    /** რამდენი ფოტო ჩამოვა გალერეაში ერთ შენახვაზე */
    private const GALLERY_URLS_MAX = 10;

    public function __construct(
        private StorageMeter $meter,
        private PlaceSearch $search,
    ) {}

    public function index(Request $request)
    {
        $query = Place::query()->with('category')->withCount(['files', 'galleryImages']);
        // სტატისტიკის ზოლიდან მოსული ჭრილი (თვე, წელი, შენი ქულა)
        LibraryStats::drill($query, 'place', $request);

        foreach ($this->slugList($request->string('status')->toString()) as $key) {
            $query->where('status', $key);
        }
        if ($request->boolean('favorite')) {
            $query->where('is_favorite', true);
        }

        /* ⚠️ კატეგორია **სვეტია** (ერთია ჩანაწერზე), ე.ი. `whereIn` (OR) და
           არა `whereHas` (AND) — მათი კვეთა ყოველთვის ცარიელი იქნებოდა. */
        if ($categories = $this->slugList($request->string('category_id')->toString())) {
            $query->whereIn('category_id', array_map('intval', $categories));
        }
        foreach ($this->slugList($request->string('tag')->toString()) as $tag) {
            $query->whereJsonContains('tags', $tag);
        }
        // ქვეყანა ერთ ჩანაწერზე ერთია — ისიც OR
        if ($countries = $this->slugList($request->string('country')->toString())) {
            $query->whereIn('country', $countries);
        }

        if ($q = $request->string('q')->toString()) {
            $query->where(fn (Builder $inner) => $inner
                ->where('name', 'like', Like::contains($q))
                ->orWhere('address', 'like', Like::contains($q))
                ->orWhere('city', 'like', Like::contains($q))
                ->orWhere('country', 'like', Like::contains($q))
                ->orWhere(fn ($words) => RichText::whereWords($words, 'description', $q)) // ფორმატის გარეშე
                ->orWhere('tags', 'like', Like::contains($q)));
        }

        match ($request->string('sort')->toString()) {
            'name' => $query->orderBy('name'),
            'oldest' => $query->orderBy('id'),
            'rating' => $query->orderByDesc('rating'),
            'visited' => $query->orderByDesc('visited_at'),
            default => $query->orderByDesc('id'),
        };

        return PlaceResource::collection($this->paginated($request, $query));
    }

    public function show(Place $place)
    {
        return new PlaceResource($place->load('category')->loadCount(['files', 'galleryImages']));
    }

    /**
     * ქვეყნების სია ფილტრისთვის — `GET /places/countries`.
     * ⚠️ ცალკე ლექსიკონი არ არსებობს (თამაშის `franchise`-ის წესი): ქვეყანა
     * ჩანაწერის საკუთარი სვეტია და სია მისგანვე აგრეგირდება.
     */
    public function countries()
    {
        return response()->json([
            'data' => Place::query()
                ->whereNotNull('country')
                ->selectRaw('country, count(*) as total')
                ->groupBy('country')
                ->orderByDesc('total')
                ->get()
                ->map(fn ($row) => ['name' => $row->country, 'count' => (int) $row->total])
                ->all(),
        ]);
    }

    /**
     * კანდიდატები — ჩანაწერს არ ქმნის. `live=1` — წერისას (მხოლოდ Google;
     * გასაღების გარეშე `live: false` და SPA ცხად ძებნაზე გადადის), თორემ —
     * წყაროების ჯაჭვი; `city` — ფორმის ქალაქი, მიკერძოებისთვის.
     */
    public function candidates(Request $request)
    {
        $data = $request->validate([
            'query' => ['required', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:190'],
            'live' => ['nullable', 'boolean'],
            'session' => ['nullable', 'string', 'max:100'],
        ]);

        if ($request->boolean('live')) {
            $results = $this->search->suggest($data['query'], $data['session'] ?? null);

            return $results === null
                ? response()->json(['results' => [], 'live' => false])
                : ($this->blocked() ?? response()->json(['results' => $results, 'source' => 'google', 'live' => true]));
        }

        $found = $this->search->search($data['query'], $data['city'] ?? null);

        return $this->blocked() ?? response()->json([...$found, 'live' => $this->search->live()]);
    }

    /**
     * ერთი კანდიდატი → ფორმის სრული მონახაზი (ჩანაწერს ისიც არ ქმნის).
     * `live` — Google-ის გასაღები გაქვს? (ფოტოების ამრჩევი მის გარეშე ამბობს, რომ სრული გალერია მისით მოდის)
     */
    public function lookup(Request $request)
    {
        $data = $request->validate([
            'source' => ['nullable', Rule::in(PlaceSearch::SOURCES)],
            'source_id' => ['nullable', 'string', 'max:300'],
            // ძველი ფორმა (Nominatim) — `osm_type` + `osm_id`
            'osm_id' => ['nullable', 'string', 'max:60'],
            'osm_type' => ['nullable', 'string', 'max:20'],
            'query' => ['nullable', 'string', 'max:255'],
            'session' => ['nullable', 'string', 'max:100'],
        ]);

        $source = $data['source'] ?? 'nominatim';
        $id = $data['source_id'] ?? (isset($data['osm_type'], $data['osm_id']) ? $data['osm_type'].':'.$data['osm_id'] : null);

        if ($id === null) {
            return response()->json(['message' => 'not_found'], 404);
        }

        $draft = $this->search->details($source, $id, (string) ($data['query'] ?? ''), $data['session'] ?? null);

        return $draft
            ? response()->json(['draft' => $draft, 'live' => $this->search->live()])
            : ($this->blocked() ?? response()->json(['message' => 'not_found'], 404));
    }

    /** Google Maps-ის ბმული (მოკლეც) → ფორმის მონახაზი */
    public function link(Request $request)
    {
        $data = $request->validate(['url' => ['required', 'string', 'max:2000', 'url']]);

        $draft = $this->search->fromLink($data['url']);

        return $draft
            ? response()->json(['draft' => $draft, 'live' => $this->search->live()])
            : ($this->blocked() ?? response()->json(['message' => 'map_link_unreadable'], 422));
    }

    /** პინის გადათრევა → მისამართი, ქალაქი, ქვეყანა */
    public function reverse(Request $request)
    {
        $data = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
        ]);

        $here = $this->search->reverse((float) $data['lat'], (float) $data['lng']);

        return $here
            ? response()->json(['address' => $here])
            : ($this->blocked() ?? response()->json(['message' => 'not_found'], 404));
    }

    public function store(Request $request)
    {
        $place = new Place;
        $data = $this->validated($request);
        $this->apply($place, $request, $data);
        $place->save();
        $this->importGallery($request, $place, $data['gallery_urls'] ?? []);

        return (new PlaceResource($place->refresh()->load('category')->loadCount(['files', 'galleryImages'])))
            ->response()->setStatusCode(201);
    }

    public function update(Request $request, Place $place)
    {
        $data = $this->validated($request, $place);
        $this->apply($place, $request, $data);
        $place->save();
        $this->importGallery($request, $place, $data['gallery_urls'] ?? []);

        return new PlaceResource($place->load('category')->loadCount(['files', 'galleryImages']));
    }

    public function destroy(Place $place)
    {
        // ⚠️ **კალათა** — `delete()` კი არა, `moveToTrash()`
        $place->moveToTrash();

        return response()->noContent();
    }

    public function toggleFavorite(Place $place)
    {
        $place->is_favorite = ! $place->is_favorite;
        $place->save();

        return new PlaceResource($place->load('category')->loadCount(['files', 'galleryImages']));
    }

    /**
     * სტატუსი ცალკე endpoint-ია — ბარათიდან ერთი კლიკია.
     * ⚠️ `visited_at`-ს **მხოლოდ `applyStatus()`** წერს.
     */
    public function setStatus(Request $request, Place $place)
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(Place::STATUSES)],
            // ძველი ვიზიტიც ჩაიწერება — თარიღი ცხადად გადმოცემადია
            'visited_at' => ['nullable', 'date'],
        ]);

        $place->applyStatus($data['status'], $data['visited_at'] ?? null);
        $place->save();

        return new PlaceResource($place->load('category')->loadCount(['files', 'galleryImages']));
    }

    /* ---------- დამხმარეები ---------- */

    private function blocked()
    {
        return $this->search->blocked()
            ? response()->json(['message' => 'places_unavailable'], 503)
            : null;
    }

    /**
     * **წყაროს ფოტოები ადგილის გალერეაში** (ვებძებნის იმავე იმპორტერით —
     * კვოტა, დუბლი, `SafeHttp`); ფოტო თუ ჯერ არ გაქვს, პირველი ჩამოსული მთავარი
     * ხდება (`GalleryController::setPrimary()`-ის წესი — ადგილს წყაროს სვეტი არ აქვს).
     * ⚠️ ჩავარდნა ადგილის შენახვას არ აჩერებს — ფოტო მეორეხარისხოვანია.
     *
     * @param  list<string>  $urls
     */
    private function importGallery(Request $request, Place $place, array $urls): void
    {
        if ($urls === []) {
            return;
        }

        $before = (int) $place->galleryImages()->withoutGlobalScope('owner')->max('id');

        app(WebImageImporter::class)->import(
            $request->user(),
            $place,
            array_map(fn (string $url) => ['original' => $url, 'engine' => 'places'], array_slice($urls, 0, self::GALLERY_URLS_MAX)),
            GalleryParent::category('place'),
        );

        if ($place->photo_path) {
            return;
        }

        $first = GalleryImage::query()
            ->withoutGlobalScope('owner')
            ->where('imageable_type', $place->getMorphClass())
            ->where('imageable_id', $place->getKey())
            ->where('id', '>', $before)
            ->orderBy('id')
            ->first();

        if ($first) {
            $place->photo_path = $first->path;
            $place->save();
        }
    }

    private function validated(Request $request, ?Place $place = null): array
    {
        /* ⚠️ სტატუსი და კატეგორია სავალდებულოა (2026-09-16-ის წესი).
           რედაქტირებისას `sometimes`: გამოტოვებული ველი ძველს ტოვებს,
           ცხადად ცარიელი კი 422-ია. */
        $must = $place ? ['sometimes', 'required'] : ['required'];

        return $request->validate([
            'name' => [$place ? 'sometimes' : 'required', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:500'],
            'city' => ['nullable', 'string', 'max:190'],
            'country' => ['nullable', 'string', 'max:190'],
            // ⚠️ საზღვრები ნამდვილია და არა თვითნებური — უამისოდ აკრეფის
            // შეცდომა („4142" ნაცვლად „41.42") ჩუმად ჩაიწერებოდა
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
            'osm_id' => ['nullable', 'string', 'max:60'],
            'osm_type' => ['nullable', 'string', 'max:20'],
            'description' => RichText::rules(),
            'category_id' => [
                ...$must,
                'integer',
                Rule::exists('place_categories', 'id')->whereNull('trashed_at')->where('user_id', $request->user()->id),
            ],
            'tags' => ['nullable', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],
            'status' => [...$must, Rule::in(Place::STATUSES)],
            // მთელი 1–10, დანარჩენი ოთხი მოდულის ზუსტი წესი
            'rating' => Rating::rules(),
            'is_favorite' => ['nullable', 'boolean'],
            'visibility' => ['nullable', Rule::in(['private', 'public'])],
            'visited_at' => ['nullable', 'date'],
            'photo' => ['nullable', ...UploadLimits::rule('primary', $request->user())],
            'remove_photo' => ['nullable', 'boolean'],
            // წყაროს ინფო (ტელეფონი, ვებგვერდი, საათები, წყაროს რეიტინგი 0–5)
            'phone' => ['nullable', 'string', 'max:60'],
            'website' => ['nullable', 'string', 'max:500', 'url'],
            'opening_hours' => ['nullable', 'array', 'max:14'],
            // ⚠️ `nullable` — ცარიელი ხაზი (TrimStrings → null) 422 კი არა, უბრალოდ იჭრება
            'opening_hours.*' => ['nullable', 'string', 'max:160'],
            'source_rating' => ['nullable', 'numeric', 'between:0,5'],
            'source_rating_count' => ['nullable', 'integer', 'min:0'],
            // წყაროს ფოტოები — გალერეაში ჩამოდის (`importGallery()`)
            'gallery_urls' => ['nullable', 'array', 'max:'.self::GALLERY_URLS_MAX],
            'gallery_urls.*' => ['string', 'max:2000', 'url'],
        ]);
    }

    private function apply(Place $place, Request $request, array $data): void
    {
        foreach (['name', 'address', 'city', 'country', 'description', 'osm_id', 'osm_type', 'phone', 'website'] as $field) {
            if (array_key_exists($field, $data)) {
                $place->{$field} = $data[$field] ?: null;
            }
        }
        foreach (['lat', 'lng', 'rating', 'source_rating', 'source_rating_count'] as $field) {
            if (array_key_exists($field, $data)) {
                // ⚠️ `?:` აქ არასწორი იქნებოდა — კოორდინატი 0 ნამდვილია
                $place->{$field} = ($data[$field] === '' || $data[$field] === null) ? null : $data[$field];
            }
        }
        if (array_key_exists('category_id', $data)) {
            $place->category_id = $data['category_id'] ?: null;
        }
        if (array_key_exists('opening_hours', $data)) {
            $hours = array_values(array_filter(array_map(fn ($line) => trim((string) $line), $data['opening_hours'] ?? []), fn ($line) => $line !== ''));
            $place->opening_hours = $hours ?: null;
        }
        if (! empty($data['visibility'])) {
            $place->visibility = $data['visibility'];
        }
        if (array_key_exists('tags', $data)) {
            $place->tags = Place::normalizeTags($data['tags'] ?? []);
        }
        if ($request->has('is_favorite')) {
            $place->is_favorite = $request->boolean('is_favorite');
        }

        if ($request->boolean('remove_photo')) {
            // ⚠️ ურნა — ძველი ატვირთული ფაილი ურნაში; TMDB-ის/გალერეის ფაილს ხელი არ ეხება
            ColumnTrash::capture($place, 'photo_path');
            $place->photo_path = null;
        }

        if ($request->hasFile('photo')) {
            // `storeUpload()` ატვირთვამდე ამოწმებს კვოტას (ამოწურვაზე 413)
            // ⚠️ ურნა — ძველი ატვირთული ფაილი ურნაში; TMDB-ის/გალერეის ფაილს ხელი არ ეხება
            ColumnTrash::capture($place, 'photo_path');
            $place->photo_path = $this->meter
                ->storeUpload($request->user(), $request->file('photo'), StorageFolder::PLACE_PHOTOS);
        }

        /* ⚠️ **ბოლოს და ერთი მეთოდით** — სტატუსი და `visited_at` ერთმანეთზეა
           დამოკიდებული, ე.ი. ორი დამოუკიდებელი მწერალი მათ ერთ დღეს
           ერთმანეთს დააშორებდა (`Book::syncProgress()`-ის ხაფანგი). */
        if (! empty($data['status']) || array_key_exists('visited_at', $data)) {
            $place->applyStatus(
                $data['status'] ?? $place->status ?? 'to_visit',
                $data['visited_at'] ?? null,
            );
        }
    }
}
