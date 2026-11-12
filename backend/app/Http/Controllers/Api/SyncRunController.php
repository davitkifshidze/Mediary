<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CastMember;
use App\Models\CastMemberSyncPref;
use App\Models\SyncRun;
use App\Models\SyncRunItem;
use App\Services\Cast\CastPool;
use App\Services\Sync\SyncHistory;
use App\Support\MediaDomain;
use App\Support\RichText;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

/**
 * **„სინქრონიზაციის შედეგები"** — გაშვებების ისტორია და თითო გაშვების ერთეულები.
 *
 * ⚠️ **გაშვება მისამართში გასაღებითაა** (`key`, UUID) და არა id-ით: პარტიის
 * შეტყობინებამ და ბრაუზერის რიგმა გაშვების რიგის id არ იციან — გასაღები კი
 * ორივესთვის ცნობილია. გაშვება ყოველთვის ჩემია (`owner` scope) — სხვისი 404-ია.
 *
 * ⚠️ **ჩაკეტილი (ამ სესიაში დაუხსნელი) ჩანაწერის ერთეული არსად ჩანს** — არც სიაში,
 * არც რიცხვებში, არც ძებნაში: სათაური ისტორიაში ასლადაა და დამალული ჩანაწერის
 * შიგთავსი სერვერს არ უნდა ტოვებდეს (`SyncRunItem::scopeVisible()`).
 *
 * ⚠️ „ამათზე აღარ გაეშვას" იმავე გადამრთველს წერს, რასაც ჩანაწერის გვერდი —
 * `sync_paused` (მოდელით, ე.ი. ჟურნალშიც ჩანს) და მსახიობზე ჩემს
 * `cast_member_sync_prefs`-ს; ახალი მექანიზმი არ ჩნდება.
 */
class SyncRunController extends Controller
{
    /** გაშვებების სია ჩადგმული სიაა — გვერდზე 10 */
    private const PER_PAGE = 10;

    private const PER_PAGE_MAX = 100;

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'kind' => ['sometimes', Rule::in(SyncHistory::KINDS)],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::PER_PAGE_MAX],
        ]);

        $runs = SyncRun::query()
            ->when(isset($data['kind']), fn (Builder $q) => $q->where('kind', $data['kind']))
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->paginate((int) ($data['per_page'] ?? self::PER_PAGE));

        $stats = $this->stats($runs->getCollection()->modelKeys());

        return response()->json([
            'data' => $runs->getCollection()->map(fn (SyncRun $run) => $this->payload($run, $stats))->values(),
            'meta' => ['current_page' => $runs->currentPage(), 'last_page' => $runs->lastPage(), 'per_page' => $runs->perPage(), 'total' => $runs->total()],
        ]);
    }

    public function show(SyncRun $run): JsonResponse
    {
        return response()->json(['data' => $this->payload($run, $this->stats([$run->getKey()]))]);
    }

    /** გაშვების ერთეულები — შედეგის ფილტრით, სათაურით ძებნით, გვერდებად */
    public function items(Request $request, SyncRun $run): JsonResponse
    {
        $data = $request->validate([
            'result' => ['sometimes', Rule::in(SyncHistory::RESULTS)],
            'q' => ['sometimes', 'nullable', 'string', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::PER_PAGE_MAX],
        ]);

        $items = SyncRunItem::query()
            ->visible()
            ->where('sync_run_id', $run->getKey())
            ->when(isset($data['result']), fn (Builder $q) => $q->where('result', $data['result']))
            ->when(filled($data['q'] ?? null), fn (Builder $q) => RichText::whereWords($q, 'title', (string) $data['q']))
            ->orderBy('id')
            ->paginate((int) ($data['per_page'] ?? self::PER_PAGE));

        $state = $this->recordState($request, $items->getCollection());

        return response()->json([
            'data' => $items->getCollection()->map(fn (SyncRunItem $item) => [
                'id' => $item->getKey(),
                'type' => $item->type,
                'record_id' => (int) $item->record_id,
                'title' => $item->title,
                'result' => $item->result,
                'reason' => $item->reason,
                'changes' => $item->changes ?? [],
                // ჩანაწერი ისევ არსებობს (ბმული) და მასზე „აღარ განაახლო" ახლა ჩართულია თუ არა
                'exists' => isset($state[$item->type][(int) $item->record_id]),
                'paused' => (bool) ($state[$item->type][(int) $item->record_id] ?? false),
            ])->values(),
            'meta' => ['current_page' => $items->currentPage(), 'last_page' => $items->lastPage(), 'per_page' => $items->perPage(), 'total' => $items->total()],
        ]);
    }

    /**
     * **„ამათზე აღარ გაეშვას" / „ისევ გაეშვას"** — მონიშნულ ერთეულებზე (`items`) ან
     * გაშვების ყველა ჩავარდნილზე (`failed`).
     *
     * ⚠️ უფლება აქვე მოწმდება (პარტიის წესი): ჩანაწერის შეჩერება მისი რედაქტირებაა,
     * ე.ი. მოდული და `update` სჭირდება; მსახიობზე — რომელიმე ჩართული მედია-მოდული.
     * ⚠️ წაშლილი ან ამ სესიაში დამალული ჩანაწერი უბრალოდ გამოტოვებულია.
     */
    public function pause(Request $request, SyncRun $run): JsonResponse
    {
        $data = $request->validate([
            'paused' => ['required', 'boolean'],
            'failed' => ['sometimes', 'boolean'],
            'items' => ['required_without:failed', 'array', 'max:'.self::PER_PAGE_MAX * 10],
            'items.*' => ['integer', 'min:1'],
        ]);

        $user = $request->user();
        $paused = (bool) $data['paused'];

        $items = SyncRunItem::query()
            ->visible()
            ->where('sync_run_id', $run->getKey())
            ->when(
                (bool) ($data['failed'] ?? false),
                fn (Builder $q) => $q->where('result', SyncHistory::FAILED),
                fn (Builder $q) => $q->whereIn('id', $data['items'] ?? []),
            )
            ->get(['type', 'record_id'])
            ->groupBy('type');

        $changed = 0;

        foreach ($items as $type => $rows) {
            $ids = $rows->pluck('record_id')->map(fn ($id) => (int) $id)->unique()->values()->all();

            if ($type === SyncHistory::ACTOR) {
                if (! CastPool::typesFor($user)) {
                    return response()->json(['message' => 'module_disabled'], 403);
                }

                $changed += $this->pauseActors((int) $user->getKey(), $ids, $paused);

                continue;
            }

            if (! MediaDomain::has((string) $type)) {
                continue;
            }

            if (! $user->hasModule($type) || ! $user->hasPermission($type, 'update')) {
                return response()->json(['message' => 'forbidden_permission', 'permission' => "{$type}.update"], 403);
            }

            // მოდელით და არა მასობრივი `update`-ით — ცვლილება ჟურნალში ჩანს, როგორც ჩანაწერის გვერდიდან
            foreach (MediaDomain::model($type)::query()->whereIn('id', $ids)->where('sync_paused', ! $paused)->get() as $record) {
                $record->sync_paused = $paused;
                $record->save();
                $changed++;
            }
        }

        return response()->json(['changed' => $changed]);
    }

    /**
     * @param  list<int>  $ids
     */
    private function pauseActors(int $userId, array $ids, bool $paused): int
    {
        $prefs = CastMemberSyncPref::withoutGlobalScope('owner')->where('user_id', $userId);

        if (! $paused) {
            return (int) (clone $prefs)->whereIn('cast_member_id', $ids)->delete();
        }

        $have = (clone $prefs)->whereIn('cast_member_id', $ids)->pluck('cast_member_id')->map(fn ($id) => (int) $id)->all();
        $new = array_values(array_diff($ids, $have));

        foreach ($new as $id) {
            CastMemberSyncPref::withoutGlobalScope('owner')->create(['user_id' => $userId, 'cast_member_id' => $id, 'paused_at' => now()]);
        }

        return count($new);
    }

    /**
     * გვერდის ერთეულების ჩანაწერები: არსებობს თუ არა და შეჩერებულია თუ არა —
     * თითო ტიპზე ერთი query.
     *
     * @param  Collection<int, SyncRunItem>  $items
     * @return array<string, array<int, bool>> ტიპი → ჩანაწერის id → შეჩერებულია
     */
    private function recordState(Request $request, Collection $items): array
    {
        $state = [];

        foreach ($items->groupBy('type') as $type => $rows) {
            $ids = $rows->pluck('record_id')->map(fn ($id) => (int) $id)->unique()->values()->all();

            if ($type === SyncHistory::ACTOR) {
                $paused = CastMemberSyncPref::withoutGlobalScope('owner')
                    ->where('user_id', $request->user()->getKey())
                    ->whereIn('cast_member_id', $ids)
                    ->pluck('cast_member_id')
                    ->flip();

                foreach (CastMember::query()->whereIn('id', $ids)->pluck('id') as $id) {
                    $state[$type][(int) $id] = $paused->has($id);
                }

                continue;
            }

            if (MediaDomain::has((string) $type)) {
                foreach (MediaDomain::model($type)::query()->whereIn('id', $ids)->pluck('sync_paused', 'id') as $id => $paused) {
                    $state[$type][(int) $id] = (bool) $paused;
                }
            }
        }

        return $state;
    }

    /**
     * გაშვებების რიცხვები ერთი query-ით: რამდენი ერთეული რა შედეგით და რომელ ტიპზე.
     *
     * @param  list<int>  $runIds
     * @return array<int, array{counts: array<string, int>, types: list<string>}>
     */
    private function stats(array $runIds): array
    {
        $stats = [];

        if ($runIds === []) {
            return $stats;
        }

        $rows = SyncRunItem::query()
            ->visible()
            ->whereIn('sync_run_id', $runIds)
            ->selectRaw('sync_run_id, type, result, count(*) as n')
            ->groupBy('sync_run_id', 'type', 'result')
            ->toBase()
            ->get();

        foreach ($rows as $row) {
            $run = (int) $row->sync_run_id;
            $stats[$run]['counts'][$row->result] = ($stats[$run]['counts'][$row->result] ?? 0) + (int) $row->n;
            $stats[$run]['types'][$row->type] = true;
        }

        foreach ($stats as $run => $stat) {
            $stats[$run]['types'] = array_keys($stat['types']);
        }

        return $stats;
    }

    /**
     * @param  array<int, array{counts: array<string, int>, types: list<string>}>  $stats
     * @return array<string, mixed>
     */
    private function payload(SyncRun $run, array $stats): array
    {
        $counts = [];

        foreach (SyncHistory::RESULTS as $result) {
            $counts[$result] = (int) ($stats[$run->getKey()]['counts'][$result] ?? 0);
        }

        return [
            'key' => $run->key,
            'kind' => $run->kind,
            'source' => $run->source,
            // დაგეგმილი ერთეულები; `done` — რამდენს აქვს შედეგი (შეწყვეტილ გაშვებაზე ნაკლებია)
            'total' => max((int) $run->total, array_sum($counts)),
            'done' => array_sum($counts),
            'counts' => $counts,
            // რომელ მოდულებს შეეხო (`movie` · `series` · `anime` · `actor`)
            'types' => $stats[$run->getKey()]['types'] ?? [],
            'started_at' => $run->created_at?->toIso8601String(),
            'last_at' => $run->updated_at?->toIso8601String(),
        ];
    }
}
