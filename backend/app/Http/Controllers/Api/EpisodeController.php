<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Episodes\EpisodeProgress;
use App\Services\Episodes\EpisodeSync;
use App\Support\MediaDomain;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * **FEAT-09 — სეზონები და ეპიზოდები.**
 *
 * `GET|POST|PATCH /api/media/episodes/{type}/{id}` — `/media/sync/{type}/{id}`-ის
 * იგივე ფორმა: **ერთი** endpoint ორივე TV-დომენზე (სერიალი · ანიმე) და
 * არა ორი თითქმის იდენტური მარშრუტი.
 *
 * ⚠️ **ფილმი აქ ვერ მოხვდება.** `MediaDomain::TV_TYPES` სწორედ ამ
 * კითხვის ერთადერთი პასუხია — ფილმს სეზონი არ აქვს და `/tv/*`-ზე
 * TMDB-იც ვერაფერს ეტყვის.
 *
 * ⚠️ **`sync` ცალკე მოქმედებაა და ავტომატურად არ ეშვება**: ეპიზოდების
 * სია სეზონზე ერთი TMDB-გამოძახებაა, ე.ი. ჩვეულებრივ სინქრონში ჩაშენება
 * მთელ ბიბლიოთეკაზე ასეულ რექვესთს ნიშნავდა — იხ. `EpisodeSync`.
 */
class EpisodeController extends Controller
{
    public function __construct(
        private readonly EpisodeSync $sync,
        private readonly EpisodeProgress $progress,
    ) {}

    /** სეზონები + ჩემი მონიშვნები + პროგრესი */
    public function index(Request $request, string $type, int $id)
    {
        $record = $this->record($type, $id);

        return response()->json($this->payload($request, $record));
    }

    /**
     * ეპიზოდების ჩამოტანა TMDB-იდან.
     *
     * ⚠️ **წყაროს ჩავარდნა 503-ია და არა 500** — „TMDB არ პასუხობს" და
     * „ასეთი სერიალი არ არსებობს" სხვადასხვა ფაქტია (`bgg_unavailable`-ის
     * წესი), ხოლო `no_tmdb_id` საერთოდ **422**-ია: ხელით შექმნილ
     * სერიალზე ეს მოთხოვნა უაზროა და არა გატეხილი.
     */
    public function store(Request $request, string $type, int $id)
    {
        $record = $this->record($type, $id);
        $result = $this->sync->sync($record);

        if (! $result['ok']) {
            return response()->json(
                ['message' => $result['error']],
                $result['error'] === 'no_tmdb_id' ? 422 : 503,
            );
        }

        return response()->json([
            'synced' => ['seasons' => $result['seasons'], 'episodes' => $result['episodes']],
            ...$this->payload($request, $record->refresh()),
        ]);
    }

    /**
     * მონიშვნა/მოხსნა — ერთი ეპიზოდი, სია, ან მთელი სეზონი.
     *
     * ⚠️ **`PATCH` და არა `POST`**: არსებულ ჩანაწერს ვცვლით, და POST-ს
     * `EnsureModulePermission` `create`-ად წაიკითხავდა — მხოლოდ
     * რედაქტირების უფლების მქონე როლი ცრუ 403-ს მიიღებდა.
     */
    public function update(Request $request, string $type, int $id)
    {
        $record = $this->record($type, $id);

        $data = $request->validate([
            'watched' => ['required', 'boolean'],
            'episode_ids' => ['nullable', 'array', 'max:2000'],
            'episode_ids.*' => ['integer'],
            'season' => ['nullable', 'integer', 'min:0'],
        ]);

        $ids = $data['episode_ids'] ?? [];

        /* მთელი სეზონი — id-ების სია სერვერზე იგება და არა კლიენტზე:
           ბრაუზერს მხოლოდ ჩატვირთული გვერდი აქვს, სეზონი კი სრული უნდა იყოს. */
        if (isset($data['season'])) {
            $ids = collect($this->progress->overview($request->user(), $record)['seasons'])
                ->firstWhere('season', (int) $data['season'])['episodes'] ?? [];
            $ids = array_column($ids, 'id');
        }

        $changed = $this->progress->mark($request->user(), $record, $ids, (bool) $data['watched']);

        $payload = $this->payload($request, $record);

        // სტატუსი პროგრესიდან — მხოლოდ წინ (`todo` → `doing` → `done`)
        $role = $this->progress->syncStatus(
            $request->user(),
            $record,
            $payload['watched'],
            $payload['total'],
        );

        return response()->json([
            'changed' => $changed,
            'status_role' => $role,
            ...$payload,
        ]);
    }

    private function payload(Request $request, Model $record): array
    {
        return $this->progress->overview($request->user(), $record);
    }

    /**
     * ჩანაწერი — მხოლოდ TV-დომენები და მხოლოდ ჩემი.
     *
     * ⚠️ **`owner` scope-ს ვენდობით და ეს აქ სწორია**: მოთხოვნა ყოველთვის
     * რექვესთიდან მოდის, ე.ი. `Auth::id()` სავსეა, და სხვისი ჩანაწერი
     * **404-ია** — პროექტის არსებული წესი („ეს ჩანაწერი არსებობს"
     * თვითონაც ინფორმაციაა).
     */
    private function record(string $type, int $id): Model
    {
        abort_unless(in_array($type, MediaDomain::TV_TYPES, true), 404);

        $model = MediaDomain::model($type);

        return $model::findOrFail($id);
    }
}
