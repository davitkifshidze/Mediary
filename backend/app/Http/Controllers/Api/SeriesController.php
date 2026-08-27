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
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class SeriesController extends Controller
{
    /** სერიალების სია (ფილტრი: status, genre, favorite, q, sort) */
    public function index(Request $request)
    {
        $query = Series::query()->with('genres');

        if ($status = $request->string('status')->toString()) {
            $query->where('status', $status);
        }

        if ($request->boolean('favorite')) {
            $query->where('is_favorite', true);
        }

        if ($request->string('source')->toString() === 'synced') {
            $query->where('sync_status', 'synced');
        }

        if ($genre = $request->string('genre')->toString()) {
            $query->whereHas('genres', fn ($q) => $q->where('slug', $genre));
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

        return SeriesListResource::collection($query->get());
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
            return response()->json(['message' => 'TMDB_API_KEY არ არის კონფიგურირებული backend/.env-ში.'], 503);
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
        if ($series->poster_source === 'upload' && $series->poster_path) {
            Storage::disk('public')->delete($series->poster_path);
        }
        $series->delete();

        return response()->noContent();
    }

    /* ---------- დამხმარეები ---------- */

    private function applyData(Series $series, Request $request): void
    {
        // translation ველები (title_*, description_*) ცალკე მუშავდება — იხ. applyTranslations()
        foreach (['year', 'ge_url', 'rating', 'runtime', 'seasons', 'episodes'] as $field) {
            if ($request->has($field)) {
                $series->{$field} = $request->input($field) ?: null;
            }
        }

        if ($request->has('imdb_id')) {
            $imdb = $request->string('imdb_id')->toString() ?: null;
            $series->imdb_id = $imdb;
            $series->imdb_url = $imdb ? "https://www.imdb.com/title/{$imdb}/" : null;
        }

        if ($request->filled('status')) {
            $series->status = $request->string('status')->toString();
            if ($series->status === 'watched' && ! $series->watched_at) {
                $series->watched_at = now();
            }
            if ($series->status !== 'watched') {
                $series->watched_at = null;
            }
        }

        if ($request->has('is_favorite')) {
            $series->is_favorite = $request->boolean('is_favorite');
        }

        if ($request->boolean('remove_poster')) {
            if ($series->poster_source === 'upload' && $series->poster_path) {
                Storage::disk('public')->delete($series->poster_path);
            }
            $series->poster_path = null;
            $series->poster_source = null;
        }

        if ($request->hasFile('poster')) {
            if ($series->poster_source === 'upload' && $series->poster_path) {
                Storage::disk('public')->delete($series->poster_path);
            }
            $series->poster_path = $request->file('poster')->store('posters', 'public');
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
            if ($attrs) {
                $series->translations()->updateOrCreate(['locale' => $loc], $attrs);
            }
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
