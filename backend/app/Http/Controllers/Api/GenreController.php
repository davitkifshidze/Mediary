<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ApprovalRequestResource;
use App\Http\Resources\GenreResource;
use App\Models\ApprovalRequest;
use App\Models\Genre;
use App\Services\Genres\GenreRemover;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class GenreController extends Controller
{
    /**
     * ჟანრები **ყველა** მედია-დომენის რაოდენობით (`movies_count`,
     * `series_count`, `animes_count`). `type` მხოლოდ დალაგებაზე მოქმედებს —
     * რომელი რაოდენობით დაიხარისხოს; სამივე რიცხვი ყოველთვის ბრუნდება.
     */
    public function index(Request $request)
    {
        // ⚠️ სვეტის სახელი **რელაციისაა** და არა დომენის (`anime` → `animes_count`)
        $sortKey = match ($request->input('type')) {
            'series' => 'series_count',
            'anime' => 'animes_count',
            default => 'movies_count',
        };

        $genres = Genre::query()
            ->withCount(['movies', 'series', 'animes'])
            ->get()
            // name_en თარგმანის accessor-ია — დალაგება კოლექციაზე
            ->sortBy([
                [$sortKey, 'desc'],
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

        return (new GenreResource($genre->loadCount(['movies', 'series', 'animes'])))->response()->setStatusCode(201);
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

        return new GenreResource($genre->loadCount(['movies', 'series', 'animes']));
    }

    /**
     * წაშლა.
     * თუ ჩანაწერებია მიბმული (ფილმები **ან** სერიალები) — 409, სანამ არ მიეთითება:
     *   - reassign_to=<genre_id>  → მიბმული ჩანაწერები გადავა ამ ჟანრზე,
     *   - force=1                 → უბრალოდ მოეხსნება (ჩანაწერები დარჩება უჟანროდ).
     *
     * ⚠️ ჟანრი **გლობალურია**: ჩვეულებრივი მომხმარებლის წაშლა პირდაპირ არ სრულდება,
     * არამედ ადმინთან მიდის დასადასტურებლად (202 + მოთხოვნა). super_admin — მაშინვე.
     */
    public function destroy(Request $request, Genre $genre, GenreRemover $remover)
    {
        $reassignTo = $request->filled('reassign_to') ? (int) $request->input('reassign_to') : null;
        $force = $request->boolean('force');

        if (! $request->user()->isSuperAdmin()) {
            return $this->requestDeletion($request, $genre, $remover, $reassignTo, $force);
        }

        $result = $remover->remove($genre, $reassignTo, $force);

        if (! $result['ok']) {
            return response()->json([
                'message' => $result['reason'],
                'movies_count' => $result['movies_count'] ?? 0,
                'series_count' => $result['series_count'] ?? 0,
            ], $result['reason'] === 'genre_in_use' ? 409 : 422);
        }

        return response()->noContent();
    }

    /** user-ის წაშლის თხოვნა → ApprovalRequest (pending) */
    private function requestDeletion(Request $request, Genre $genre, GenreRemover $remover, ?int $reassignTo, bool $force)
    {
        $existing = ApprovalRequest::where('user_id', $request->user()->id)
            ->where('type', ApprovalRequest::TYPE_GENRE_DELETE)
            ->where('genre_id', $genre->id)
            ->pending()
            ->first();

        $counts = $remover->globalCounts($genre);

        $req = $existing ?: ApprovalRequest::create([
            'user_id' => $request->user()->id,
            'type' => ApprovalRequest::TYPE_GENRE_DELETE,
            'genre_id' => $genre->id,
            'message' => $request->input('message'),
            'status' => 'pending',
            'payload' => [
                'reassign_to' => $reassignTo,
                'force' => $force,
                'name_ka' => $genre->name_ka,
                'name_en' => $genre->name_en,
            ] + $counts,
        ]);

        return response()->json([
            'message' => 'approval_required',
            'request' => new ApprovalRequestResource($req->load(['genre'])),
        ], 202);
    }

    private function validateNames(Request $request): array
    {
        $data = $request->validate([
            'name_en' => ['nullable', 'string', 'max:100'],
            'name_ka' => ['nullable', 'string', 'max:100'],
        ]);

        if (empty($data['name_en']) && empty($data['name_ka'])) {
            throw ValidationException::withMessages([
                'name_ka' => 'genre_name_required',
            ]);
        }

        return $data;
    }
}
