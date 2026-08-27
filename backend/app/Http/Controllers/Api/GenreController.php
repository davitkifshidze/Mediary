<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\GenreResource;
use App\Models\Genre;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class GenreController extends Controller
{
    /** ჟანრები ფილმების რაოდენობით */
    public function index()
    {
        $genres = Genre::query()
            ->withCount('movies')
            ->get()
            // name_en თარგმანის accessor-ია — დალაგება კოლექციაზე
            ->sortBy([
                ['movies_count', 'desc'],
                ['name_en', 'asc'],
            ])
            ->values();

        return GenreResource::collection($genres);
    }

    /** ახალი ჟანრი */
    public function store(Request $request)
    {
        $data = $this->validateNames($request);

        $base = Str::slug($data['name_en'] ?? '') ?: Str::slug($data['name_ka'] ?? '');
        if (! $base) {
            $base = 'g-'.substr(md5(($data['name_en'] ?? '').($data['name_ka'] ?? '')), 0, 8);
        }
        $slug = $base;
        $i = 2;
        while (Genre::where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i;
            $i++;
        }

        $genre = Genre::create(['slug' => $slug]);
        $genre->setTranslation('en', $data['name_en'] ?? $data['name_ka']);
        $genre->setTranslation('ka', $data['name_ka'] ?? null);

        return (new GenreResource($genre->loadCount('movies')))->response()->setStatusCode(201);
    }

    /** რედაქტირება — მხოლოდ სახელები (slug უცვლელი რჩება TMDB-სინქრონის სტაბილურობისთვის) */
    public function update(Request $request, Genre $genre)
    {
        $data = $this->validateNames($request);

        if (array_key_exists('name_en', $data) && $data['name_en'] !== null) {
            $genre->setTranslation('en', $data['name_en']);
        }
        if (array_key_exists('name_ka', $data)) {
            // ცარიელი → ka თარგმანის წაშლა
            if ($data['name_ka']) {
                $genre->setTranslation('ka', $data['name_ka']);
            } else {
                $genre->translations()->where('locale', 'ka')->delete();
                $genre->load('translations');
            }
        }

        return new GenreResource($genre->loadCount('movies'));
    }

    /**
     * წაშლა.
     * თუ ფილმებია მიბმული — 409, სანამ არ მიეთითება:
     *   - reassign_to=<genre_id>  → მიბმული ფილმები გადავა ამ ჟანრზე,
     *   - force=1                 → უბრალოდ მოეხსნება (ფილმები დარჩება უჟანროდ).
     */
    public function destroy(Request $request, Genre $genre)
    {
        $count = $genre->movies()->count();

        if ($count > 0) {
            $reassignTo = $request->input('reassign_to');
            $force = $request->boolean('force');

            if ($reassignTo) {
                $target = Genre::where('id', $reassignTo)->where('id', '!=', $genre->id)->first();
                if (! $target) {
                    return response()->json(['message' => 'invalid_reassign_target'], 422);
                }
                $movieIds = $genre->movies()->pluck('movies.id')->all();
                $target->movies()->syncWithoutDetaching($movieIds);
            } elseif (! $force) {
                return response()->json([
                    'message' => 'genre_in_use',
                    'movies_count' => $count,
                ], 409);
            }
        }

        // genre_movie.genre_id აქვს cascadeOnDelete — pivot-ი თავად წაიშლება
        $genre->delete();

        return response()->noContent();
    }

    private function validateNames(Request $request): array
    {
        $data = $request->validate([
            'name_en' => ['nullable', 'string', 'max:100'],
            'name_ka' => ['nullable', 'string', 'max:100'],
        ]);

        if (empty($data['name_en']) && empty($data['name_ka'])) {
            throw ValidationException::withMessages([
                'name_ka' => 'ჟანრის სახელი აუცილებელია.',
            ]);
        }

        return $data;
    }
}
