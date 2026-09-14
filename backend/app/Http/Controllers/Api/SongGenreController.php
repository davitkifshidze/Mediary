<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SongGenreResource;
use App\Models\Song;
use App\Models\SongGenre;
use App\Support\DictionaryRecords;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * მუსიკის ჟანრების მართვა — per-user CRUD + თანმიმდევრობა.
 * სტრუქტურა `VideoTypeController`-ის იდენტურია (ერთი და იგივე ლექსიკონის
 * შაბლონი), წაშლისას სიმღერები **არ იკარგება**: `move_to` ან „ჟანრის გარეშე".
 *
 * ⚠️ განსხვავება წიგნის/ბორდგეიმის ლექსიკონისგან: კავშირი **pivot-ია**
 * (`song_genre_song`, `DECISIONS.md` §5), ე.ი. წაშლაზე `move_to` ჟანრს
 * **ამატებს** სიმღერებს და არა სვეტს ცვლის — სიმღერას სხვა ჟანრებიც აქვს.
 */
class SongGenreController extends Controller
{
    public function index(Request $request)
    {
        // ლენივი დეფაულტები: ახალი ანგარიშიც და მოგვიანებით ჩართული მოდულიც
        SongGenre::ensureDefaults($request->user()->id);

        return SongGenreResource::collection($this->ordered()->get());
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $genre = SongGenre::create([
            'key' => SongGenre::makeKey($request->user()->id, $data['name_en'] ?: $data['name_ka']),
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? null,
            'sort_order' => (int) SongGenre::max('sort_order') + 1,
        ]);

        return (new SongGenreResource($genre))->response()->setStatusCode(201);
    }

    public function update(Request $request, SongGenre $songGenre)
    {
        $data = $this->validated($request);

        $songGenre->fill([
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'icon' => $data['icon'] ?? $songGenre->icon,
        ])->save();

        return new SongGenreResource($songGenre);
    }

    /**
     * წაშლა; `move_to` — რომელ ჟანრზე გადავიდნენ ეს სიმღერები.
     *
     * ⚠️ pivot-ზე „გადატანა" = **მიმაგრება** (`syncWithoutDetaching`), თორემ
     * სიმღერის დანარჩენი ჟანრები ჩუმად წაიშლებოდა. თვითონ ძველი კავშირი
     * `song_genre_song`-ის cascade-ით ქრება.
     */
    public function destroy(Request $request, SongGenre $songGenre)
    {
        $data = $request->validate(DictionaryRecords::rules(
            $request,
            Rule::exists('song_genres', 'id')->where('user_id', $request->user()->id),
        ));

        // ეტაპი 8 — ჩანაწერებიც იშლება, **მოდელის გავლით** (ფაილი, კვოტა, აუდიტი).
        // ⚠️ pivot-ზე ეს ის ჩანაწერიცაა, რომელსაც სხვა ჟანრიც აქვს — UI ამას ცხადად ამბობს
        if ($request->boolean('delete_records')) {
            $deleted = DictionaryRecords::delete(Song::whereKey($songGenre->songs()->pluck('songs.id')->all()));
            $songGenre->delete();

            return response()->json(['moved' => 0, 'deleted' => $deleted]);
        }

        $moveTo = DictionaryRecords::moveTarget($data, $songGenre->id);

        $songIds = $songGenre->songs()->pluck('songs.id')->all();
        $moved = 0;

        if ($moveTo && $songIds) {
            SongGenre::whereKey($moveTo)->first()?->songs()->syncWithoutDetaching($songIds);
            $moved = count($songIds);
        }

        $songGenre->delete();

        return response()->json(['moved' => $moved, 'deleted' => 0]);
    }

    /** გადალაგება — მოწოდებული id-ების რიგი ხდება `sort_order` */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => [
                'integer',
                Rule::exists('song_genres', 'id')->where('user_id', $request->user()->id),
            ],
        ]);

        foreach ($data['ids'] as $i => $id) {
            SongGenre::whereKey($id)->update(['sort_order' => $i + 1]);
        }

        return SongGenreResource::collection($this->ordered()->get());
    }

    /* ---------- დამხმარეები ---------- */

    private function ordered()
    {
        return SongGenre::query()->withCount('songs')->orderBy('sort_order')->orderBy('id');
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name_ka' => ['required', 'string', 'max:80'],
            'name_en' => ['required', 'string', 'max:80'],
            'icon' => ['nullable', 'string', 'max:60'],
        ]);
    }
}
