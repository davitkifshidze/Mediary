<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Sync\ItemSyncer;
use App\Support\CredentialProviders;
use App\Support\MediaDomain;
use App\Support\MissingCredential;
use App\Support\SyncOutcome;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * მასობრივი სინქრონი — სათითაოდ (Tasks J2/J3/J4).
 *
 * `php artisan serve` ერთდროულად ერთ რექვესთს ემსახურება, ამიტომ ერთი გრძელი
 * ციკლი მთელ აპლიკაციას ბლოკავს. აქ ციკლს **ფრონტი** მართავს: `plan` აბრუნებს
 * რიგს, შემდეგ თითო ჩანაწერზე ერთი მოკლე რექვესთი მიდის — ასე პროგრესიც ჩანს
 * და გაჩერებაც შესაძლებელია.
 */
class MediaSyncController extends Controller
{
    /** გაზომილი ტემპი — მიახლოებითი დროის შესაფასებლად */
    private const ITEMS_PER_MINUTE = 10.5;

    /** ფილტრები → დასამუშავებელი ჩანაწერების რიგი */
    public function plan(Request $request, ItemSyncer $syncer)
    {
        $data = $request->validate([
            'types' => ['nullable', 'array'],
            'types.*' => [MediaDomain::rule()],
            /* §6.4 — სტატუსი per-user ლექსიკონია, ე.ი. მისი სია კოდში აღარ დგას.
               ფილტრი **გასაღებით** მოდის; უცნობი გასაღები უბრალოდ ცარიელ
               შედეგს იძლევა (ეს ფილტრია და არა წაშლის სკოუპი). */
            'status' => ['nullable', 'string', 'max:60'],
            'favorite' => ['nullable', 'boolean'],
            'genres' => ['nullable', 'array'],
            'genres.*' => ['string'],
            'ids' => ['nullable', 'array'],
            'missing_media_only' => ['nullable', 'boolean'],
            // Tasks §31.2 — დამუშავებულების (წარმატებით განახლებული/უცვლელი) დამალვა
            'hide_processed' => ['nullable', 'boolean'],
        ]);

        // მხოლოდ ჩართული მოდულების დომენები (I3) — გეგმა ორივე დომენს ერთდროულად ეხება,
        // ამიტომ route-ზე `module:` middleware არ დგას და ფილტრი აქ ხდება
        $types = MediaDomain::enabledFor($request->user(), $data['types'] ?? null);
        $ids = $data['ids'] ?? [];
        $missingOnly = $request->boolean('missing_media_only');

        $hideProcessed = $request->boolean('hide_processed');
        $items = [];
        $withoutTmdb = 0;
        $paused = 0;
        $processed = 0;
        foreach ($types as $type) {
            $query = MediaDomain::query($type);

            if (! empty($data['status'])) {
                $query->statusKey($data['status']);
            }
            if ($request->boolean('favorite')) {
                $query->where('is_favorite', true);
            }
            if (! empty($data['genres'])) {
                $query->whereHas('genres', fn ($q) => $q->whereIn('slug', $data['genres']));
            }
            if (! empty($ids[$type])) {
                $query->whereIn('id', array_map('intval', $ids[$type]));
            }

            /* Tasks §31.3 — „აღარ განაახლო" გეგმაში არ ზის; §31.2 — დამუშავებული (წარმატებით
               განახლებული ან უცვლელი) `hide_processed`-ზე იმალება, ცარიელი და ჩავარდნილი კი
               რჩება — ისინი დამუშავებულად არ ითვლება. ⚠️ `clone` — `count()` builder-ს
               ადგილზე ცვლის. */
            $paused += (clone $query)->where('sync_paused', true)->count();
            $query->where('sync_paused', false);
            if ($hideProcessed) {
                $processed += (clone $query)->whereNotNull('last_synced_at')->whereNotIn('last_sync_result', SyncOutcome::RETRY)->count();
                $query->where(fn ($w) => $w->whereNull('last_synced_at')->orWhereIn('last_sync_result', SyncOutcome::RETRY));
            }
            $rows = $query->with(['translations', 'cast'])->orderBy('id')->get();

            foreach ($rows as $row) {
                // tmdb_id-ის გარეშე სინქრონი შეუძლებელია — ჩუმად არ ვაგდებთ, ვითვლით
                if (! $row->tmdb_id) {
                    $withoutTmdb++;

                    continue;
                }
                if ($missingOnly && ! $syncer->mediaMissing($row)) {
                    continue;
                }
                $items[] = [
                    'type' => $type,
                    'id' => $row->id,
                    'title' => $row->title_ka ?: ($row->title_en ?: '#'.$row->id),
                    'year' => $row->year,
                ];
            }
        }

        return response()->json([
            'items' => $items,
            'count' => count($items),
            'eta_seconds' => (int) ceil(count($items) * 60 / self::ITEMS_PER_MINUTE),
            'skipped_without_tmdb' => $withoutTmdb,
            // Tasks §31 — რამდენი დაიმალა და რამდენია შეჩერებული (ფანჯარა ამას ციფრით ამბობს)
            'skipped_processed' => $processed,
            'skipped_paused' => $paused,
            /* Tasks §30.6 — ⚠️ **გეგმა თვითონ ამბობს, რომ გასაღები არ მაქვს**:
               §30-იდან ის ანგარიშისაა, ე.ი. მის გარეშე ფანჯარა გაშვებამდე უნდა
               თქვას „ჩაწერე" — და არა 300 ერთნაირი ჩავარდნის შემდეგ. */
            'tmdb' => $syncer->configured(),
        ]);
    }

    /**
     * ერთი ჩანაწერის სინქრონი.
     * per-item შეცდომა 200-ით ბრუნდება (`ok:false` + `error`), რომ ფრონტის ციკლი
     * არ გაწყდეს — მიზეზი ლოგშიც იწერება (J5).
     */
    public function item(Request $request, string $type, int $id, ItemSyncer $syncer)
    {
        if (! MediaDomain::has($type)) {
            return response()->json(['message' => 'invalid_type'], 422);
        }

        if (! $syncer->configured()) {
            return MissingCredential::response(CredentialProviders::TMDB);
        }

        $data = $request->validate([
            'media' => ['nullable', 'boolean'],
            'only_missing' => ['nullable', 'boolean'],
            'overwrite' => ['nullable', 'boolean'],
            'fields' => ['nullable', 'array'],
            'fields.*' => ['in:'.implode(',', ItemSyncer::FIELDS)],
        ]);

        $item = MediaDomain::model($type)::find($id);
        if (! $item) {
            return response()->json(['message' => 'not_found'], 404);
        }

        $result = $syncer->sync($item, [
            'fields' => $data['fields'] ?? [],
            'media' => $request->boolean('media'),
            'overwrite' => $request->boolean('overwrite'),
            'only_missing' => $request->boolean('only_missing'),
        ]);

        if (! $result['ok']) {
            Log::warning('sync failed', ['type' => $type, 'id' => $id, 'error' => $result['error']]);
        }

        return response()->json([
            'ok' => $result['ok'],
            'skipped' => $result['skipped'],
            'changed' => $result['changed'],
            // Tasks §31.4 — ოთხი შედეგი ცალკე (`SyncOutcome`)
            'result' => $result['result'],
            'error' => $result['error'],
            'title' => $item->title_ka ?: ($item->title_en ?: '#'.$item->id),
        ]);
    }

    /**
     * Tasks §31.3 — „აღარ განაახლო": გეგმები (სინქრონი, თარგმანი, გალერეა) და worker-ი
     * შეჩერებულ ჩანაწერს გამოტოვებენ; დეტალის ერთეულოვანი ღილაკი მაინც მუშაობს.
     * ⚠️ `PATCH` — არსებული ჩანაწერის ცვლილებაა (`update` უფლება), ე.ი. ლოგშიც ჩანს.
     */
    public function pause(Request $request, string $type, int $id)
    {
        if (! MediaDomain::has($type)) {
            return response()->json(['message' => 'invalid_type'], 422);
        }

        $data = $request->validate(['paused' => ['required', 'boolean']]);

        $item = MediaDomain::model($type)::find($id);
        if (! $item) {
            return response()->json(['message' => 'not_found'], 404);
        }

        $item->sync_paused = (bool) $data['paused'];
        $item->save();

        return response()->json(['ok' => true, 'sync_paused' => (bool) $item->sync_paused]);
    }
}
