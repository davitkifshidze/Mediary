<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CastMember;
use App\Models\CastMemberSyncPref;
use App\Models\SyncRun;
use App\Models\SyncRunItem;
use App\Services\Batch\BatchLauncher;
use App\Services\Cast\CastPool;
use App\Services\Sync\SyncFacts;
use App\Services\Sync\SyncHistory;
use App\Services\Sync\SyncOverview;
use App\Services\Sync\SyncResume;
use App\Support\MediaDomain;
use App\Support\RecordLocks;
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
 *
 * ⚠️ **გაშვებას მდგომარეობა აქვს** (მიმდინარეობს · გაწყდა · დასრულდა — `SyncResume`) და
 * გაწყვეტილი **გრძელდება**: `resume()` უშვებს მხოლოდ იმას, რასაც შედეგი არ აქვს
 * (ან, `only=failed`, მხოლოდ ჩავარდნილებს) — იმავე პარამეტრებით და იმავე გაშვებაში,
 * ფონური პარტიით, რომ ჩანართის დახურვამ ხელმეორედ აღარ გაწყვიტოს. რაზე და რით
 * გაეშვა, გაშვებაზე ინახება: პარტიაზე სერვერი წერს, ბრაუზერის რიგი კი `store()`-ით
 * აგზავნის.
 */
class SyncRunController extends Controller
{
    /** გაშვებების სია ჩადგმული სიაა — გვერდზე 10 */
    private const PER_PAGE = 10;

    private const PER_PAGE_MAX = 100;

    /** სინქრონიზაციის გვერდის ბარათები: მონაცემები · სეზონები და სერიები · მსახიობები */
    private const OVERVIEW_KINDS = [SyncHistory::KIND_SYNC, SyncHistory::KIND_EPISODES, SyncHistory::KIND_CAST];

    /** სინქრონიზაციის გვერდი ამდენ დაუსრულებელ გაშვებას აჩვენებს — ბოლო გაშვებებიდან */
    private const OFFERED = 3;

    private const OFFERED_AMONG = 20;

    /** გაგრძელებული გაშვების ერთეულებს შორის პაუზის ჭერი — `RunBatchItem`-ის ჭერის ტოლი */
    private const MAX_DELAY_MS = 5000;

    public function __construct(private readonly SyncResume $resume) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'kind' => ['sometimes', Rule::in(SyncHistory::KINDS)],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::PER_PAGE_MAX],
        ]);

        $runs = SyncRun::query()
            ->forList()
            ->when(isset($data['kind']), fn (Builder $q) => $q->where('kind', $data['kind']))
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->paginate((int) ($data['per_page'] ?? self::PER_PAGE));

        $stats = $this->stats($runs->getCollection());

        return response()->json([
            'data' => $runs->getCollection()->map(fn (SyncRun $run) => $this->payload($run, $stats))->values(),
            'meta' => ['current_page' => $runs->currentPage(), 'last_page' => $runs->lastPage(), 'per_page' => $runs->perPage(), 'total' => $runs->total()],
        ]);
    }

    /**
     * **სინქრონიზაციის გვერდების ბარათები**: თითო სახეობაზე რამდენია გასაშვები
     * (`SyncOverview`) და რა დააბრუნა მისმა ბოლო გაშვებამ; თან — ისტორიაში სულ რამდენი
     * გაშვებაა და რომელია ბოლო.
     *
     * `type` — მოდულის გვერდი (`/series/sync`): რიცხვები და ბოლო გაშვებები მხოლოდ ამ
     * მოდულზე. ⚠️ მსახიობების ბოლო გაშვება მოდულით არ იფილტრება — მისი ერთეული
     * მსახიობია და არა ჩანაწერი; ისტორიის ჯამი და ბოლო გაშვებაც ყოველთვის მთლიანია.
     *
     * `unfinished` — დაუსრულებელი გაშვებები: გაწყვეტილი, რომლის გაგრძელებაც შეიძლება
     * (გვერდი მას თვითონ სთავაზობს), და სერვერზე ფონურად მიმდინარე — გაგრძელებული გაშვება
     * გვერდიდან არ ქრება, სანამ მიდის. ბრაუზერის რიგით მიმდინარე აქ არ არის: ის თავის
     * ჩანართში, რიგის პანელში ჩანს. მოდულის გვერდზე — რომელთა გეგმაშიც ეს მოდულია (და
     * მსახიობებისა).
     */
    public function overview(Request $request, SyncOverview $overview): JsonResponse
    {
        $data = $request->validate(['type' => ['sometimes', MediaDomain::rule()]]);
        $type = $data['type'] ?? null;

        $recent = fn () => SyncRun::query()->forList()->orderByDesc('updated_at')->orderByDesc('id');
        $last = [];

        foreach (self::OVERVIEW_KINDS as $kind) {
            $last[$kind] = $recent()
                ->where('kind', $kind)
                ->when(
                    $type !== null && $kind !== SyncHistory::KIND_CAST,
                    fn (Builder $q) => $q->whereHas('items', fn (Builder $item) => $item->visible()->where('type', $type)),
                )
                ->first();
        }

        $latest = $recent()->first();
        $stats = $this->stats(collect($last)->push($latest)->filter());
        $shape = fn (?SyncRun $run) => $run ? $this->payload($run, $stats) : null;

        return response()->json([
            'pending' => $overview->pending($request->user(), $type),
            'last' => array_map($shape, $last),
            'runs' => SyncRun::query()->count(),
            'latest' => $shape($latest),
            // თარგმანის გაშვებები თარგმანის გვერდებისაა — აქ მხოლოდ ამ გვერდის სახეობები
            'unfinished' => $this->unfinishedRuns(self::OVERVIEW_KINDS, $type),
        ]);
    }

    /**
     * **ერთი სახეობის დაუსრულებელი გაშვებები და მისი ისტორიის ჯამი** — თარგმანის გვერდების
     * ბარათებისთვის (`kind=translate`): რამდენი გაშვებაა, რომელია ბოლო და რომელი ელის
     * გაგრძელებას. `type` — მოდულის გვერდი.
     */
    public function unfinished(Request $request): JsonResponse
    {
        $data = $request->validate([
            'kind' => ['required', Rule::in(SyncHistory::KINDS)],
            'type' => ['sometimes', MediaDomain::rule()],
        ]);

        $runs = fn () => SyncRun::query()->forList()->where('kind', $data['kind']);
        $latest = $runs()->orderByDesc('updated_at')->orderByDesc('id')->first();

        return response()->json([
            'runs' => $runs()->count(),
            'latest' => $latest ? $this->payload($latest, $this->stats([$latest])) : null,
            'unfinished' => $this->unfinishedRuns([$data['kind']], $data['type'] ?? null),
        ]);
    }

    /**
     * დაუსრულებელი გაშვებები ბოლო გაშვებებიდან: გაწყვეტილი, რომლის გაგრძელებაც შეიძლება, და
     * სერვერზე ფონურად მიმდინარე. ⚠️ ორივე მხოლოდ იმას აქვს, რასაც დაგეგმილი სია აქვს;
     * მოდულის გვერდზე — რომლის გეგმაშიც ეს მოდულია (მსახიობის ერთეული ყველა მოდულისაა).
     *
     * @param  list<string>  $kinds
     * @return Collection<int, array<string, mixed>>
     */
    private function unfinishedRuns(array $kinds, ?string $type): Collection
    {
        $candidates = SyncRun::query()
            ->whereIn('kind', $kinds)
            ->whereNotNull('plan')
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->limit(self::OFFERED_AMONG)
            ->get()
            ->filter(fn (SyncRun $run) => $type === null
                || array_key_exists($type, $run->plan ?? [])
                || array_key_exists(SyncHistory::ACTOR, $run->plan ?? []));

        $stats = $this->stats($candidates);

        return $candidates
            ->map(fn (SyncRun $run) => $this->payload($run, $stats))
            ->filter(fn (array $run) => $run['resumable'] || $run['stoppable'])
            ->take(self::OFFERED)
            ->values();
    }

    /**
     * **ბრაუზერის რიგის გაშვების დასაწყისი**: რაზე და რით ეშვება. რიგი ამას ერთხელ
     * აგზავნის, ერთეულებამდე — სერვერმა რომ იცოდეს, რა დარჩა, თუ რიგი გაწყდება
     * (ფონურ პარტიაზე იგივეს `BatchController::store()` წერს).
     *
     * ⚠️ აქ არაფერი ეშვება და არცერთი ჩანაწერი არ იკითხება — იწერება მხოლოდ ტიპი და id.
     * უფლებას ერთეულის მოთხოვნა ამოწმებს, გაგრძელებისას კი `resume()`.
     */
    public function store(Request $request, SyncHistory $history): JsonResponse
    {
        $data = $request->validate([
            'key' => ['required', 'uuid'],
            'kind' => ['required', Rule::in(SyncHistory::KINDS)],
            'items' => ['required', 'array', 'min:1', 'max:'.SyncHistory::MAX_TOTAL],
            'items.*.type' => ['required', Rule::in([...MediaDomain::TYPES, SyncHistory::ACTOR])],
            'items.*.id' => ['required', 'integer', 'min:1'],
            'params' => ['sometimes', 'nullable', 'array'],
        ]);

        $run = $history->open(
            (int) $request->user()->getKey(),
            $data['key'],
            $data['kind'],
            SyncHistory::SOURCE_QUEUE,
            $data['items'],
            $data['params'] ?? [],
        );

        abort_unless($run, 422);

        return response()->json(['data' => $this->payload($run, $this->stats([$run]), true)], 201);
    }

    public function show(SyncRun $run): JsonResponse
    {
        return response()->json(['data' => $this->payload($run, $this->stats([$run]), true)]);
    }

    /**
     * **გაწყვეტილი გაშვების გაგრძელება** — მხოლოდ ის, რასაც შედეგი არ აქვს; `only=failed` —
     * მხოლოდ ჩავარდნილების თავიდან გაშვება. იმავე პარამეტრებით და იმავე გაშვებაში:
     * ახალი პარტიის ერთეულები შედეგს ამ გაშვების გასაღებით წერენ.
     *
     * ⚠️ **მიმდინარე გაშვება არ გრძელდება** (409) — ერთეულები ორჯერ გაეშვებოდა.
     * ⚠️ **ძველ გაშვებას გაგრძელება არ აქვს** (409): რაზე და რით გაეშვა, მასზე არ ინახება.
     * ⚠️ წაშლილი ან შეჩერებული ჩანაწერი პარტიაში მიდის და იქ **გამოიტოვება მიზეზით** —
     * ისტორიაში ჩანს, რატომ არ გაეშვა, და გაშვება სრულდება.
     * ⚠️ უფლება და წყაროს გასაღები აქვე მოწმდება — ზუსტად ისე, როგორც ახალ პარტიაზე.
     */
    public function resume(Request $request, SyncRun $run, BatchLauncher $launcher, SyncHistory $history): JsonResponse
    {
        $data = $request->validate([
            'only' => ['sometimes', 'nullable', Rule::in(['failed'])],
            'delay_ms' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:'.self::MAX_DELAY_MS],
        ]);

        $failedOnly = ($data['only'] ?? null) === 'failed';

        if ($this->resume->of($run)['state'] === SyncRun::RUNNING) {
            return response()->json(['message' => 'sync_run_running'], 409);
        }

        if ($run->params === null || (! $failedOnly && $run->plan === null)) {
            return response()->json(['message' => 'sync_run_not_resumable'], 409);
        }

        $items = $failedOnly ? $this->resume->failed($run) : $this->resume->remaining($run);

        if ($items === []) {
            return response()->json(['message' => 'sync_run_nothing_left'], 409);
        }

        $user = $request->user();
        $options = [...$run->params, 'delay_ms' => (int) ($data['delay_ms'] ?? 0)];

        if ($denied = $launcher->denies($user, $run->kind, $items, $options)) {
            return $denied;
        }

        // წინა პარტია (გათიშული სერვერის ნარჩენი) აღარ უნდა გაეშვას ახლის გვერდით
        $this->resume->liveBatch($run)?->cancel();

        $batch = $launcher->dispatch($user, $run->kind, $items, $options, $run->key);
        $history->attach($run, $batch->id);

        if (! $launcher->start($batch)) {
            return response()->json(['message' => 'worker_unavailable'], 503);
        }

        return response()->json(['data' => $this->payload($run, $this->stats([$run]), true)], 202);
    }

    /**
     * **გაშვების გაჩერება.** ფონური პარტია უქმდება (დარჩენილი ერთეულები აღარ გაეშვება);
     * ბრაუზერის რიგის გაშვება „გაჩერებულად" ინიშნება — რიგმა თვითონ იცის, რომ გაჩერდა,
     * სერვერი კი სხვაგვარად მხოლოდ დუმილით მიხვდებოდა.
     */
    public function stop(SyncRun $run, SyncHistory $history): JsonResponse
    {
        $this->resume->liveBatch($run)?->cancel();
        $history->stop($run);

        return response()->json(['data' => $this->payload($run, $this->stats([$run]), true)]);
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
        // ჩაკეტილი მსახიობი ფილმის „მსახიობები: დაემატა …"-შიც არ ჩანს
        $hiddenActors = RecordLocks::hiddenIds((new CastMember)->getMorphClass());

        return response()->json([
            'data' => $items->getCollection()->map(fn (SyncRunItem $item) => [
                'id' => $item->getKey(),
                'type' => $item->type,
                'record_id' => (int) $item->record_id,
                'title' => $item->title,
                'result' => $item->result,
                'reason' => $item->reason,
                'changes' => $item->changes ?? [],
                // რა რით შეიცვალა: ძველი → ახალი, სიაზე — რა დაემატა და რა მოაკლდა
                'details' => SyncFacts::readable($item->details ?? [], $hiddenActors),
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
     * გაშვებების რიცხვები: რამდენი ერთეული რა შედეგით და რომელ ტიპზე (ერთი query), და
     * მდგომარეობა — მიმდინარეობს · გაწყდა · დასრულდა — იმით, რამდენი დარჩა (`SyncResume`).
     *
     * @param  iterable<SyncRun>  $runs
     * @return array<int, array{counts?: array<string, int>, types?: list<string>, state: string, left: int}>
     */
    private function stats(iterable $runs): array
    {
        $stats = $this->resume->describe($runs);

        if ($stats === []) {
            return $stats;
        }

        $rows = SyncRunItem::query()
            ->visible()
            ->whereIn('sync_run_id', array_keys($stats))
            ->selectRaw('sync_run_id, type, result, count(*) as n')
            ->groupBy('sync_run_id', 'type', 'result')
            ->toBase()
            ->get();

        $types = [];

        foreach ($rows as $row) {
            $run = (int) $row->sync_run_id;
            $stats[$run]['counts'][$row->result] = ($stats[$run]['counts'][$row->result] ?? 0) + (int) $row->n;
            $types[$run][$row->type] = true;
        }

        foreach ($types as $run => $seen) {
            $stats[$run]['types'] = array_keys($seen);
        }

        return $stats;
    }

    /**
     * @param  array<int, array{counts?: array<string, int>, types?: list<string>, state: string, left: int}>  $stats
     * @param  bool  $full  ერთი გაშვების პასუხი — თან პარამეტრები (რით გაეშვა)
     * @return array<string, mixed>
     */
    private function payload(SyncRun $run, array $stats, bool $full = false): array
    {
        $stat = $stats[$run->getKey()] ?? ['state' => SyncRun::FINISHED, 'left' => 0];
        $counts = [];

        foreach (SyncHistory::RESULTS as $result) {
            $counts[$result] = (int) ($stat['counts'][$result] ?? 0);
        }

        $interrupted = $stat['state'] === SyncRun::INTERRUPTED;

        return [
            'key' => $run->key,
            'kind' => $run->kind,
            'source' => $run->source,
            // დაგეგმილი ერთეულები; `done` — რამდენს აქვს შედეგი (შეწყვეტილ გაშვებაზე ნაკლებია)
            'total' => max((int) $run->total, array_sum($counts)),
            'done' => array_sum($counts),
            // რამდენი დარჩა გასაშვები და რა მდგომარეობაშია გაშვება
            'left' => $stat['left'],
            'state' => $stat['state'],
            // „გაგრძელება": გაწყდა და ინახება, რაზე და რით გაეშვა (ძველ გაშვებებს არ აქვს)
            'resumable' => $interrupted && $run->hasPlan() && $run->params !== null,
            // „ჩავარდნილების თავიდან გაშვება": ჩავარდნილი აქვს, პარამეტრები ინახება და არ მიმდინარეობს
            'retryable' => $stat['state'] !== SyncRun::RUNNING && $counts[SyncHistory::FAILED] > 0 && $run->params !== null,
            // „შეჩერება": მიმდინარეობს და ფონური პარტია ატარებს — ბრაუზერის რიგს სერვერი ვერ აჩერებს
            'stoppable' => $stat['state'] === SyncRun::RUNNING && $run->batch_id !== null,
            'counts' => $counts,
            // რომელ მოდულებს შეეხო (`movie` · `series` · `anime` · `actor`)
            'types' => $stat['types'] ?? [],
            'started_at' => $run->created_at?->toIso8601String(),
            'last_at' => $run->updated_at?->toIso8601String(),
            ...($full ? ['params' => $run->params] : []),
        ];
    }
}
