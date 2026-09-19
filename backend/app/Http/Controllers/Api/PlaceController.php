<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlaceResource;
use App\Models\Place;
use App\Services\Places\NominatimClient;
use App\Services\Storage\StorageMeter;
use App\Support\Like;
use App\Support\StorageFolder;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * ადგილების მოდული (`place`, FEAT-26).
 *
 * მფლობელობა — `BelongsToUser` global scope (სხვისი ჩანაწერი 404), უფლებები —
 * `permission:place` middleware.
 *
 * ⚠️ **წყარო OSM Nominatim-ია და უფასოა** — გასაღები არ სჭირდება, ე.ი.
 * კანდიდატების ნაკადი (§12-ის `candidates → lookup`) აქ ნამდვილად მუშაობს,
 * განსხვავებით კურსებისგან.
 *
 * ⚠️ **„წყარო არ პასუხობს" ≠ „ვერაფერი ვიპოვე"**: პირველი **503
 * `nominatim_unavailable`**-ია, მეორე — 200 ცარიელი სიით. ცარიელი სია
 * „ასეთი ადგილი არ არსებობს"-ად იკითხება და ხელით შევსებას აჩერებს.
 */
class PlaceController extends Controller
{
    public function __construct(
        private StorageMeter $meter,
        private NominatimClient $nominatim,
    ) {}

    public function index(Request $request)
    {
        $query = Place::query()->with('category')->withCount(['files', 'galleryImages']);

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
                ->orWhere('description', 'like', Like::contains($q))
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

    /** Nominatim-ის კანდიდატები (§12-ის ფორმა) — ჩანაწერს არ ქმნის */
    public function candidates(Request $request)
    {
        $data = $request->validate(['query' => ['required', 'string', 'max:255']]);

        $results = $this->nominatim->search($data['query']);

        return $this->blocked() ?? response()->json(['results' => $results]);
    }

    /** ერთი კანდიდატი → ფორმის სქემა (ჩანაწერს ისიც არ ქმნის) */
    public function lookup(Request $request)
    {
        $data = $request->validate([
            'osm_id' => ['required', 'string', 'max:60'],
            'osm_type' => ['required', 'string', 'max:20'],
            'query' => ['required', 'string', 'max:255'],
        ]);

        $draft = $this->nominatim->find($data['osm_type'], $data['osm_id'], $data['query']);

        return $draft
            ? response()->json(['draft' => $draft])
            : ($this->blocked() ?? response()->json(['message' => 'not_found'], 404));
    }

    public function store(Request $request)
    {
        $place = new Place;
        $this->apply($place, $request, $this->validated($request));
        $place->save();

        return (new PlaceResource($place->refresh()->load('category')->loadCount(['files', 'galleryImages'])))
            ->response()->setStatusCode(201);
    }

    public function update(Request $request, Place $place)
    {
        $this->apply($place, $request, $this->validated($request, $place));
        $place->save();

        return new PlaceResource($place->load('category')->loadCount(['files', 'galleryImages']));
    }

    public function destroy(Place $place)
    {
        // ⚠️ **კალათა (FEAT-11)** — `delete()` კი არა, `moveToTrash()`
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
        return $this->nominatim->blocked()
            ? response()->json(['message' => 'nominatim_unavailable'], 503)
            : null;
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
            'description' => ['nullable', 'string', 'max:5000'],
            'category_id' => [
                ...$must,
                'integer',
                Rule::exists('place_categories', 'id')->where('user_id', $request->user()->id),
            ],
            'tags' => ['nullable', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],
            'status' => [...$must, Rule::in(Place::STATUSES)],
            'rating' => ['nullable', 'numeric', 'min:0', 'max:10'],
            'is_favorite' => ['nullable', 'boolean'],
            'visibility' => ['nullable', Rule::in(['private', 'public'])],
            'visited_at' => ['nullable', 'date'],
            'photo' => ['nullable', 'image', 'max:4096'],
            'remove_photo' => ['nullable', 'boolean'],
        ]);
    }

    private function apply(Place $place, Request $request, array $data): void
    {
        foreach (['name', 'address', 'city', 'country', 'description', 'osm_id', 'osm_type'] as $field) {
            if (array_key_exists($field, $data)) {
                $place->{$field} = $data[$field] ?: null;
            }
        }
        foreach (['lat', 'lng', 'rating'] as $field) {
            if (array_key_exists($field, $data)) {
                // ⚠️ `?:` აქ არასწორი იქნებოდა — კოორდინატი 0 ნამდვილია
                $place->{$field} = ($data[$field] === '' || $data[$field] === null) ? null : $data[$field];
            }
        }
        if (array_key_exists('category_id', $data)) {
            $place->category_id = $data['category_id'] ?: null;
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
            $place->deletePhoto();
            $place->photo_path = null;
        }

        if ($request->hasFile('photo')) {
            // 17.3 — `storeUpload()` ატვირთვამდე ამოწმებს კვოტას (ამოწურვაზე 413)
            $place->deletePhoto();
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
