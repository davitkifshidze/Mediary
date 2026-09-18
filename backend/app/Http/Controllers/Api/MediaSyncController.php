<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Sync\ItemSyncer;
use App\Support\MediaDomain;
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
        ]);

        // მხოლოდ ჩართული მოდულების დომენები (I3) — გეგმა ორივე დომენს ერთდროულად ეხება,
        // ამიტომ route-ზე `module:` middleware არ დგას და ფილტრი აქ ხდება
        $types = MediaDomain::enabledFor($request->user(), $data['types'] ?? null);
        $ids = $data['ids'] ?? [];
        $missingOnly = $request->boolean('missing_media_only');

        $items = [];
        $withoutTmdb = 0;

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
            return response()->json(['message' => 'tmdb_not_configured'], 503);
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
            'error' => $result['error'],
            'title' => $item->title_ka ?: ($item->title_en ?: '#'.$item->id),
        ]);
    }
}
