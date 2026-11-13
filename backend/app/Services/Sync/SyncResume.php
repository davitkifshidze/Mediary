<?php

namespace App\Services\Sync;

use App\Models\SyncRun;
use App\Models\SyncRunItem;
use App\Support\AppTime;
use Illuminate\Bus\Batch;
use Illuminate\Support\Facades\Bus;

/**
 * **გაშვების მდგომარეობა და რა დარჩა გასაშვები.**
 *
 * გაშვება ორნაირად წყდება: ბრაუზერის რიგი — ჩანართის დახურვით, გვერდის გადატვირთვით
 * ან „შეჩერებით"; ფონური პარტია — „შეწყვეტით" ან სერვერის გათიშვით. მდგომარეობა
 * სამია: **მიმდინარეობს** · **გაწყდა** (ერთეულები დარჩა და გაშვება აღარ მიდის) ·
 * **დასრულდა**.
 *
 * ⚠️ **„დარჩა" ჩაკეტილ ერთეულსაც ითვლის** — რიცხვი შედეგის მქონე **ყველა** რიგიდან
 * მოდის (`visible()`-ის გარეშე): თორემ ჩაკეტილი ჩანაწერის ერთეული სამუდამოდ
 * „გასაშვებად" დარჩებოდა და დასრულებული გაშვება გაწყვეტილად გამოჩნდებოდა. აქედან
 * მხოლოდ რიცხვი გამოდის — არც სათაური, არც მნიშვნელობა.
 * ⚠️ **ცოცხალია თუ არა, ორნაირად დგინდება.** ფონურ პარტიაზე — თვითონ პარტიით
 * (გაუქმებული ან ამოწურული აღარ მიდის) და დუმილით: გათიშული სერვერის პარტია ბაზაში
 * „მომლოდინედ" რჩება, მაგრამ შედეგი აღარ მოდის. ბრაუზერის რიგზე სერვერმა მხოლოდ ბოლო
 * ერთეულის დრო იცის — რიგი ცოცხალია, სანამ არ გაჩერებულა (`stopped_at`) და
 * ბოლო ერთეულიდან ორი წუთი არ გასულა.
 */
class SyncResume
{
    /** ბრაუზერის რიგი: ამდენი წამის დუმილის შემდეგ გაშვება გაწყვეტილია (ერთეული წამებს გრძელდება) */
    public const QUEUE_SILENCE = 120;

    /** ფონური პარტია: ერთ ერთეულს 10 წუთი აქვს (`RunBatchItem::$timeout`) — ამაზე მეტი დუმილი გაჩერებაა */
    public const BATCH_SILENCE = 900;

    /**
     * გაშვებების მდგომარეობა ერთად — სიისთვის: ერთი query შედეგების დასათვლელად და
     * პარტიის კითხვა მხოლოდ იქ, სადაც რამე დარჩა.
     *
     * @param  iterable<SyncRun>  $runs
     * @return array<int, array{state: string, left: int}> გაშვების id → მდგომარეობა და დარჩენილი
     */
    public function describe(iterable $runs): array
    {
        $runs = collect($runs)->filter()->keyBy(fn (SyncRun $run) => $run->getKey());

        if ($runs->isEmpty()) {
            return [];
        }

        $recorded = SyncRunItem::query()
            ->whereIn('sync_run_id', $runs->keys()->all())
            ->selectRaw('sync_run_id, count(*) as n')
            ->groupBy('sync_run_id')
            ->toBase()
            ->pluck('n', 'sync_run_id');

        $described = [];

        foreach ($runs as $id => $run) {
            $left = max(0, (int) $run->total - (int) ($recorded[$id] ?? 0));
            /* ⚠️ ყველა ერთეულს შედეგი აქვს, მაგრამ პარტია მაინც შეიძლება მიდიოდეს — ჩავარდნილების
               თავიდან გაშვება არსებულ შედეგებს ახლით ცვლის. პარტიის გარეშე კი „არაფერი დარჩა"
               დასრულებაა და მეტი კითხვა არ სჭირდება. */
            $alive = ($left > 0 || $run->batch_id !== null) && $this->alive($run);

            $described[$id] = [
                'state' => $alive ? SyncRun::RUNNING : ($left === 0 ? SyncRun::FINISHED : SyncRun::INTERRUPTED),
                'left' => $left,
            ];
        }

        return $described;
    }

    /** @return array{state: string, left: int} */
    public function of(SyncRun $run): array
    {
        return $this->describe([$run])[$run->getKey()];
    }

    /**
     * დაგეგმილიდან რას არ აქვს შედეგი — „გაგრძელება" ზუსტად ამას უშვებს.
     *
     * ⚠️ წაშლილი ან შეჩერებული („აღარ გაეშვას") ჩანაწერი აქ **არ იფილტრება**: ერთეული
     * თვითონ გამოტოვებს მას მიზეზით (`RunBatchItem` — `record_not_found`, `sync_paused`)
     * და ეს ისტორიაში ჩანს; აქ რომ ჩუმად ამოვარდნილიყო, გაშვება ვერასდროს დასრულდებოდა.
     *
     * @return list<array{type: string, id: int}>
     */
    public function remaining(SyncRun $run): array
    {
        $done = [];

        foreach (SyncRunItem::query()->where('sync_run_id', $run->getKey())->toBase()->get(['type', 'record_id']) as $item) {
            $done[$item->type][(int) $item->record_id] = true;
        }

        $left = [];

        foreach ($run->plan ?? [] as $type => $ids) {
            foreach ($ids as $id) {
                if (! isset($done[$type][(int) $id])) {
                    $left[] = ['type' => (string) $type, 'id' => (int) $id];
                }
            }
        }

        return $left;
    }

    /**
     * ჩავარდნილი ერთეულები — „ჩავარდნილების თავიდან გაშვება". ⚠️ `visible()`: რაც
     * გვერდზე არ ჩანს (ჩაკეტილი ჩანაწერი), ღილაკიც არ უშვებს.
     *
     * @return list<array{type: string, id: int}>
     */
    public function failed(SyncRun $run): array
    {
        return SyncRunItem::query()
            ->visible()
            ->where('sync_run_id', $run->getKey())
            ->where('result', SyncHistory::FAILED)
            ->orderBy('id')
            ->toBase()
            ->get(['type', 'record_id'])
            ->map(fn ($item) => ['type' => (string) $item->type, 'id' => (int) $item->record_id])
            ->all();
    }

    /** პარტია, რომელიც გაშვებას ახლა ავსებს — თუ ჯერ კიდევ მიდის */
    public function liveBatch(SyncRun $run): ?Batch
    {
        if ($run->batch_id === null) {
            return null;
        }

        $batch = Bus::findBatch($run->batch_id);

        // ⚠️ ჩავარდნილი ერთეული Laravel-ისთვის „მომლოდინეა" — ამოწურვა `pending − failed`-ით ითვლება
        return $batch !== null && ! $batch->cancelled() && $batch->pendingJobs - $batch->failedJobs > 0 ? $batch : null;
    }

    private function alive(SyncRun $run): bool
    {
        $silent = $run->updated_at === null ? PHP_INT_MAX : (int) abs(AppTime::now()->diffInSeconds($run->updated_at));

        if ($run->batch_id !== null) {
            return $silent < self::BATCH_SILENCE && $this->liveBatch($run) !== null;
        }

        return $run->stopped_at === null && $silent < self::QUEUE_SILENCE;
    }
}
