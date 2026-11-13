<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\RunBatchItem;
use App\Models\BatchItem;
use App\Models\SyncRun;
use App\Services\Batch\BatchLauncher;
use App\Services\Sync\SyncHistory;
use App\Support\MediaDomain;
use Illuminate\Bus\Batch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Validation\Rule;

/**
 * **ფონური პარტია — „დახურე ტაბი და დაასრულებს".**
 *
 * ⚠️ **რას ხსნის.** სინქრონი, გალერეა და თარგმანი დღემდე **ბრაუზერის ტაბში**
 * ტრიალებს (`ui/queue.tsx` თითო ჩანაწერზე ერთ მოკლე რექვესთს აგზავნის):
 * 300-ჩანაწერიანი გაშვება ჩერდება ტაბის დახურვაზე, ქსელის გაწყვეტაზე ან
 * ლეპტოპის დაძინებაზე. აქ იგივე გეგმა **სერვერს** გადაეცემა.
 *
 * ⚠️ **კლიენტის რიგი არ იშლება და ეს განზრახაა.** ის თითო ჩანაწერზე
 * მყისიერ უკუკავშირს იძლევა („რომელია ახლა", „რა შეიცვალა") და პაუზასაც
 * მართავს — ეს ფონურ გაშვებას არ აქვს. ორივე ერთსა და იმავე სერვისებს
 * იძახებს, ე.ი. შედეგი იდენტურია; განსხვავება მხოლოდ ისაა, **ვინ ატრიალებს
 * ციკლს**. სწორედ ამიტომ ეს **დამატებითი** ღილაკია და არა ჩანაცვლება.
 *
 * ⚠️ **შემოწმებები, პარტიის ჩაწერა და worker-ის გაშვება `BatchLauncher`-შია** —
 * გაწყვეტილი სინქრონიზაციის გაგრძელება (`SyncRunController::resume()`) იმავე გზით
 * მიდის. worker-ის გარეშე პასუხი **503 `worker_unavailable`**-ია და არა ჩუმად
 * გაჩერებული პარტია — იგივე წესი, რაც `ytdlp_unavailable`-ს აქვს.
 */
class BatchController extends Controller
{
    public function store(Request $request, BatchLauncher $launcher, SyncHistory $history)
    {
        /* ⚠️ **მსახიობის ერთეულს დომენი არ აქვს** (`type: 'actor'`):
           `cast_members` გლობალური ლექსიკონია და მედია-დომენად ვერ ჩაჯდება. */
        $castKind = $request->input('kind') === RunBatchItem::KIND_CAST;

        $data = $request->validate([
            'kind' => ['required', Rule::in(RunBatchItem::KINDS)],
            'items' => ['required', 'array', 'min:1', 'max:'.BatchLauncher::MAX_ITEMS],
            'items.*.type' => ['required', Rule::in(match (true) {
                $castKind => [RunBatchItem::ACTOR],
                // სეზონი მხოლოდ სერიალსა და ანიმეს აქვს
                $request->input('kind') === RunBatchItem::KIND_EPISODES => MediaDomain::TV_TYPES,
                // თარგმანში მსახიობიც ერთეულია — ქართული სახელი და ბიოგრაფია
                $request->input('kind') === 'translate' => [...MediaDomain::TYPES, RunBatchItem::ACTOR],
                default => MediaDomain::TYPES,
            })],
            'items.*.id' => ['required', 'integer', 'min:1'],
            'options' => ['nullable', 'array'],
            // ბრაუზერის რიგმა დარჩენილი სერვერს გადასცა — შედეგი იმავე გაშვებაში გროვდება
            'run' => ['sometimes', 'nullable', 'uuid'],
        ]);

        $user = $request->user();
        $options = $data['options'] ?? [];

        if ($denied = $launcher->denies($user, $data['kind'], $data['items'], $options)) {
            return $denied;
        }

        $tracked = in_array($data['kind'], SyncHistory::KINDS, true);
        /* გაშვება, რომელსაც ეს პარტია აგრძელებს: ჩემი უნდა იყოს (`owner` scope) და იმავე
           სახეობის — სხვა შემთხვევაში პარტია ახალი გაშვებაა, როგორც ყოველთვის */
        $continued = $tracked && filled($data['run'] ?? null)
            ? SyncRun::query()->where('key', $data['run'])->where('kind', $data['kind'])->first()
            : null;

        $batch = $launcher->dispatch($user, $data['kind'], $data['items'], $options, $continued?->key);

        if (! $launcher->start($batch)) {
            return response()->json(['message' => 'worker_unavailable'], 503);
        }

        // ისტორია: ახალ გაშვებას — რაზე და რით გაეშვა; გაგრძელებულს — რომელი პარტია ავსებს ახლა
        if ($continued) {
            $history->attach($continued, $batch->id);
        } elseif ($tracked) {
            $history->open((int) $user->getKey(), $batch->id, $data['kind'], SyncHistory::SOURCE_BATCH, $data['items'], $options, $batch->id);
        }

        return response()->json($this->payload($batch->fresh()), 202);
    }

    /** პარტიის მდგომარეობა — SPA ამას ეკითხება, სანამ მიმდინარეობს */
    public function show(Request $request, string $batch)
    {
        return response()->json($this->payload($this->mine($request, $batch)));
    }

    /** გაუქმება — დარჩენილი ერთეულები აღარ გაეშვება */
    public function destroy(Request $request, string $batch)
    {
        $this->mine($request, $batch)->cancel();

        return response()->json($this->payload(Bus::findBatch($batch)));
    }

    /**
     * **ჩემი პარტია, თორემ 404**.
     *
     * ⚠️ პასუხი **404-ია და არა 403** — „ეს პარტია არსებობს" თვითონაც
     * ინფორმაციაა (პროექტის არსებული წესი).
     *
     * ⚠️ **მფლობელის გარეშე დარჩენილი პარტიაც 404-ია.** ასეთი მხოლოდ ამ
     * გასწორებამდე შექმნილი შეიძლება იყოს, და უსაფრთხოების შემოწმებამ
     * უცნობზე უარი უნდა თქვას და არა დაუშვას; პარტია წუთებში სრულდება,
     * ე.ი. ასეთი რიგი დიდხანს არ ცოცხლობს.
     */
    private function mine(Request $request, string $batch): Batch
    {
        $found = Bus::findBatch($batch);

        abort_unless($found, 404);
        abort_unless(
            isset($found->options['user_id'])
                && (int) $found->options['user_id'] === (int) $request->user()->getKey(),
            404,
        );

        return $found;
    }

    /**
     * ⚠️ **`pending` და არა „სულ − დამუშავებული"**: Laravel-ის `Batch`-ს
     * ორივე რიცხვი თვითონ აქვს, ხოლო ხელით გამოკლება ჩავარდნილებს ორჯერ
     * ჩათვლიდა.
     */
    private function payload(?Batch $batch): array
    {
        if (! $batch) {
            return ['id' => null, 'finished' => true];
        }

        /* ⚠️ **ჩავარდნილი ერთეული Laravel-ისთვის „მომლოდინეა"** და ეს მისი
           ქცევაა, არა ჩვენი: `incrementFailedJobs()` `pending_jobs`-ს **არ**
           ამცირებს (job თეორიულად ხელახლა გასაშვებია), ხოლო `markAsFinished()`
           მხოლოდ `pendingJobs === 0`-ზე ეშვება. ე.ი. ერთი ჩავარდნილი
           ერთეულის მქონე პარტია **სამუდამოდ „მიმდინარედ"** დარჩებოდა — ზუსტად
           ის უხმო ჩაკიდება, რაც `download_status = running`-მა ორჯერ ასწავლა.

           პასუხი Laravel-ისავე ლექსიკონიდანაა: `allJobsHaveRanExactlyOnce()`
           = `pending − failed === 0`. `tries = 1`, ე.ი. „გაშვებული" აქ
           „დამთავრებულის" ტოლია. */
        $ran = max(0, $batch->totalJobs - $batch->pendingJobs) + $batch->failedJobs;

        return [
            'id' => $batch->id,
            'kind' => $batch->name,
            'total' => $batch->totalJobs,
            // ⚠️ ჩავარდნილი აქედან გამოკლებულია — თორემ „დარჩა 1" ეწერებოდა
            // მაშინაც, როცა დარჩენილი არაფერია
            'pending' => max(0, $batch->pendingJobs - $batch->failedJobs),
            'processed' => $batch->processedJobs(),
            'failed' => $batch->failedJobs,
            'progress' => $batch->totalJobs > 0 ? (int) round($ran / $batch->totalJobs * 100) : 0,
            'cancelled' => $batch->cancelled(),
            'finished' => $batch->finished() || $batch->pendingJobs - $batch->failedJobs <= 0,
            'items' => $this->items($batch->id),
        ];
    }

    /**
     * **თითო ერთეულის შედეგი**.
     *
     * ⚠️ აქამდე პასუხი მხოლოდ `processed/total` იყო, ე.ი. „**რომელი**
     * ჩანაწერი და **რატომ** ჩავარდა" მხოლოდ `sources.log`-ში ჩანდა — მაშინ,
     * როცა კლიენტური რიგი იმავე ოპერაციაზე თითოზე შედეგს აჩვენებს. ორ
     * რეჟიმს ერთი ოპერაციის ორი სხვადასხვა პასუხი ჰქონდა.
     *
     * ⚠️ **`BelongsToUser`-ის scope უკვე ფილტრავს** — `mine()` პარტიის
     * მფლობელობას ცალკე ამოწმებს, ე.ი. აქ მეორე `where` ზედმეტია და
     * ორი წყარო ერთ წესზე გაშორდებოდა.
     *
     * ⚠️ **`running` რიგებიც ბრუნდება**: სწორედ ისინი აჩვენებენ, რა
     * მუშავდება ახლა — უამისოდ სია მხოლოდ დასრულების შემდეგ გაჩნდებოდა.
     *
     * @return list<array<string, mixed>>
     */
    private function items(string $batchId): array
    {
        return BatchItem::where('batch_id', $batchId)
            ->orderBy('id')
            ->get(['type', 'record_id', 'status', 'title', 'error'])
            ->map(fn (BatchItem $item) => [
                'type' => $item->type,
                'id' => (int) $item->record_id,
                'title' => $item->title,
                'status' => $item->status,
                'error' => $item->error,
            ])
            ->all();
    }
}
