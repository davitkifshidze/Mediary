<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlaylistResource;
use App\Models\Playlist;
use App\Models\Song;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * პლეილისტები — **სიმღერების** დალაგებული ნაკრები (`song` მოდული).
 *
 * ⚠️ 2026-09-03-მდე პლეილისტი ვიდეოებს იკრებდა; სიმღერა ახლა საკუთარი
 * ცხრილი და მოდულია, ე.ი. pivot-იც `playlist_song`-ია.
 *
 * თანმიმდევრობის ორი დონე, ორი endpoint:
 *  · `POST /playlists/reorder`           — პლეილისტების რიგი;
 *  · `PUT  /playlists/{playlist}/songs`  — სიმღერების **სრული** სია, რიგითვე.
 *
 * ⚠️ სიმღერების endpoint განზრახ `PUT`-ია და არა `POST`: `EnsureModulePermission`
 * მეთოდიდან გამოიყვანს `create`-ს და update-ის უფლების მქონე user-ს
 * ცრუ 403 დაუბრუნდებოდა (იხ. `UPDATE_ENDPOINTS`-ის ხაფანგი `CLAUDE.md`-ში).
 * ერთი endpoint დამატებას, მოშორებასა და გადალაგებას ერთად ფარავს — ფრონტს
 * სია ისედაც ხელთ აქვს.
 */
class PlaylistController extends Controller
{
    public function index()
    {
        return PlaylistResource::collection($this->ordered()->get());
    }

    public function show(Playlist $playlist)
    {
        return new PlaylistResource($playlist->load('songs.genres'));
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $playlist = Playlist::create($data + [
            // ახალი პლეილისტი ბოლოში მიდგება
            'sort_order' => Playlist::nextOrderFor($request->user()->id),
        ]);

        // `visibility`-ის ბაზისეული default მოდელზე ჯერ არ ასახულა → refresh
        return (new PlaylistResource($playlist->refresh()->loadCount('songs')))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, Playlist $playlist)
    {
        $playlist->fill($this->validated($request, $playlist))->save();

        return new PlaylistResource($playlist->loadCount('songs'));
    }

    public function destroy(Playlist $playlist)
    {
        // pivot-ს FK-ის cascade შლის — სიმღერები ხელუხლებელი რჩება
        $playlist->delete();

        return response()->noContent();
    }

    /** გადალაგება — მოწოდებული id-ების რიგი ხდება `sort_order` */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => [
                'integer',
                Rule::exists('playlists', 'id')->where('user_id', $request->user()->id),
            ],
        ]);

        foreach ($data['ids'] as $i => $id) {
            Playlist::whereKey($id)->update(['sort_order' => $i + 1]);
        }

        return PlaylistResource::collection($this->ordered()->get());
    }

    /**
     * პლეილისტის სიმღერები — **სრული სია, მოწოდებული რიგით**.
     * დამატება, მოშორება და drag & drop ერთი და იმავე რექვესთია.
     *
     * ⚠️ id-ები `Song`-ის `owner` scope-ში ფილტრდება, ე.ი. სხვისი სიმღერის
     * id ჩუმად გამოვარდება და არა შეცდომად — ისე, როგორც ჟანრების მიბმაზეა.
     */
    public function setSongs(Request $request, Playlist $playlist)
    {
        $data = $request->validate([
            'song_ids' => ['present', 'array'],
            'song_ids.*' => ['integer'],
        ]);

        $playlist->songs()->sync($this->orderedPivot($data['song_ids']));

        return new PlaylistResource($playlist->load('songs.genres'));
    }

    /**
     * მეორე მიმართულება („სიმღერის მიკუთვნება ერთ ან რამდენიმე პლეილისტზე")
     * — სიმღერის ფორმიდან.
     *
     * ახალ პლეილისტში სიმღერა **ბოლოში** მიდგება; სადაც უკვე იყო, პოზიციას
     * ინარჩუნებს — `syncWithoutDetaching` არ გამოდგება, რადგან მოშორებაც სჭირდება.
     */
    public function setForSong(Request $request, Song $song)
    {
        $data = $request->validate([
            'playlist_ids' => ['present', 'array'],
            'playlist_ids.*' => ['integer'],
        ]);

        $wanted = Playlist::whereIn('id', array_map('intval', $data['playlist_ids']))
            ->pluck('id')
            ->all();

        $current = $song->playlists()->pluck('playlists.id')->all();

        foreach (array_diff($current, $wanted) as $id) {
            $song->playlists()->detach($id);
        }

        foreach (array_diff($wanted, $current) as $id) {
            $song->playlists()->attach($id, ['sort_order' => $this->nextPositionIn((int) $id)]);
        }

        return PlaylistResource::collection(
            $this->ordered()->whereIn('id', $wanted)->get(),
        );
    }

    /* ---------- დამხმარეები ---------- */

    private function ordered()
    {
        return Playlist::query()->withCount('songs')->orderBy('sort_order')->orderBy('id');
    }

    /**
     * `sync()`-ის მასივი — id => pivot. მოწოდებული რიგი ხდება `sort_order`.
     *
     * @param  array<int, mixed>  $ids
     * @return array<int, array{sort_order: int}>
     */
    private function orderedPivot(array $ids): array
    {
        // dedup-ი რიგის შენარჩუნებით: ერთი სიმღერა ერთ პლეილისტში ერთხელაა
        $unique = array_values(array_unique(array_map('intval', $ids)));

        // `owner` scope — სხვისი სიმღერა აქ ვერ მოხვდება
        $mine = Song::whereIn('id', $unique)->pluck('id')->all();

        $pivot = [];
        $position = 1;

        foreach ($unique as $id) {
            if (in_array($id, $mine, true)) {
                $pivot[$id] = ['sort_order' => $position++];
            }
        }

        return $pivot;
    }

    /** მითითებულ პლეილისტში ბოლო პოზიცია + 1 */
    private function nextPositionIn(int $playlistId): int
    {
        return (int) DB::table('playlist_song')
            ->where('playlist_id', $playlistId)
            ->max('sort_order') + 1;
    }

    /**
     * სახელი ერთ ანგარიშზე უნიკალურია (ცხრილზე იგივე შეზღუდვაა) —
     * ვალიდაცია 500-ის ნაცვლად გასაგებ 422-ს აბრუნებს.
     */
    private function validated(Request $request, ?Playlist $playlist = null): array
    {
        $data = $request->validate([
            'name' => [
                'required',
                'string',
                'max:120',
                Rule::unique('playlists', 'name')
                    ->where('user_id', $request->user()->id)
                    ->ignore($playlist?->getKey()),
            ],
            'visibility' => ['nullable', 'in:private,public'],
        ]);

        // null-ს არ ვწერთ: ცხრილის default (`private`) უფრო სწორია
        return array_filter($data, fn ($value) => $value !== null);
    }
}
