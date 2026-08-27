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
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MovieController extends Controller
{
    /** ფილმების სია (ფილტრი: status, genre, favorite, q, sort) */
    public function index(Request $request)
    {
        $query = Movie::query()->with('genres');

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

        $movies = $query->get();
        Movie::annotateFranchise($movies);

        return MovieListResource::collection($this->clusterByFranchise($movies));
    }

    /**
     * ფრანჩაიზის ნაწილები გვერდიგვერდ — კლასტერი დგება მისი პირველი (sort-ით)
     * ნაწილის პოზიციაზე; შიგნით ნაწილები წლის მიხედვით. უკოლექციო ფილმი ადგილზე რჩება.
     */
    private function clusterByFranchise($movies)
    {
        $byCollection = $movies
            ->filter(fn ($m) => $m->tmdb_collection_id)
            ->sortBy([['year', 'asc'], ['id', 'asc']])
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
            return response()->json(['message' => 'TMDB_API_KEY არ არის კონფიგურირებული backend/.env-ში.'], 503);
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
        if ($movie->poster_source === 'upload' && $movie->poster_path) {
            Storage::disk('public')->delete($movie->poster_path);
        }
        $movie->delete();

        return response()->noContent();
    }

    /* ---------- დამხმარეები ---------- */

    private function applyData(Movie $movie, Request $request): void
    {
        // translation ველები (title_*, description_*) ცალკე მუშავდება — იხ. applyTranslations()
        foreach (['year', 'ge_url', 'rating', 'runtime'] as $field) {
            if ($request->has($field)) {
                $movie->{$field} = $request->input($field) ?: null;
            }
        }

        if ($request->has('imdb_id')) {
            $imdb = $request->string('imdb_id')->toString() ?: null;
            $movie->imdb_id = $imdb;
            $movie->imdb_url = $imdb ? "https://www.imdb.com/title/{$imdb}/" : null;
        }

        if ($request->filled('status')) {
            $movie->status = $request->string('status')->toString();
            if ($movie->status === 'watched' && ! $movie->watched_at) {
                $movie->watched_at = now();
            }
            if ($movie->status !== 'watched') {
                $movie->watched_at = null;
            }
        }

        if ($request->has('is_favorite')) {
            $movie->is_favorite = $request->boolean('is_favorite');
        }

        if ($request->boolean('remove_poster')) {
            if ($movie->poster_source === 'upload' && $movie->poster_path) {
                Storage::disk('public')->delete($movie->poster_path);
            }
            $movie->poster_path = null;
            $movie->poster_source = null;
        }

        if ($request->hasFile('poster')) {
            if ($movie->poster_source === 'upload' && $movie->poster_path) {
                Storage::disk('public')->delete($movie->poster_path);
            }
            $movie->poster_path = $request->file('poster')->store('posters', 'public');
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
            if ($attrs) {
                $movie->translations()->updateOrCreate(['locale' => $loc], $attrs);
            }
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
