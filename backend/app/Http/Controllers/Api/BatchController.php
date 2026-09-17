<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\RunBatchItem;
use App\Support\BackgroundProcess;
use App\Support\MediaDomain;
use Illuminate\Bus\Batch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Validation\Rule;

/**
 * **ფონური პარტია — „დახურე ტაბი და დაასრულებს" (აუდიტი 2026-09-14, §D1).**
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
 * ⚠️ **worker ავტომატურად ეშვება** (`queue:work --stop-when-empty`) —
 * `BackgroundProcess`-ით, ზუსტად ისე, როგორც `yt-dlp` ეშვება (§7.1). ე.ი.
 * მუდმივად გაშვებული მეოთხე პროცესი **არ** სჭირდება: worker ამოწურავს
 * რიგს და თვითონ ითიშება. თუ `popen`/`exec` გამორთულია, პასუხი
 * **503 `worker_unavailable`**-ია და არა ჩუმად გაჩერებული პარტია —
 * იგივე წესი, რაც `ytdlp_unavailable`-ს აქვს.
 */
class BatchController extends Controller
{
    /** ერთ პარტიაში რამდენი ერთეული ეტევა — გეგმის ჭერი ისედაც არსებობს */
    private const MAX_ITEMS = 1000;

    /**
     * ⚠️ **worker-ის სიცოცხლის ჭერი.** `--stop-when-empty` მას რიგის
     * ამოწურვისთანავე აჩერებს, `--max-time` კი უკიდურესი შემთხვევის
     * დაზღვევაა: გაჭედილი job-ის გამო პროცესი სამუდამოდ არ უნდა დარჩეს
     * (ზუსტად ის, რაც ვიდეოს ჩამოწერას დაემართა — §B1).
     */
    private const WORKER_MAX_SECONDS = 3600;

    public function store(Request $request, BackgroundProcess $background)
    {
        $data = $request->validate([
            'kind' => ['required', Rule::in(RunBatchItem::KINDS)],
            'items' => ['required', 'array', 'min:1', 'max:'.self::MAX_ITEMS],
            'items.*.type' => ['required', Rule::in(MediaDomain::TYPES)],
            'items.*.id' => ['required', 'integer', 'min:1'],
            'options' => ['nullable', 'array'],
        ]);

        $user = $request->user();

        /* ⚠️ **უფლება აქვე მოწმდება და არა job-ში.** სამივე ოპერაცია
           არსებულ ჩანაწერს ცვლის, ე.ი. `update` სჭირდება — იგივე წესი,
           რაც `/media/sync/{type}/{id}`-ს (§A4). job-ში შემოწმება გვიანია:
           მაშინ პასუხი უკვე გაცემულია და უარი არსად ჩანს. */
        foreach (array_unique(array_column($data['items'], 'type')) as $type) {
            if (! $user->hasModule($type) || ! $user->hasPermission($type, 'update')) {
                return response()->json([
                    'message' => 'forbidden_permission',
                    'permission' => "{$type}.update",
                ], 403);
            }
        }

        $jobs = array_map(
            fn (array $item) => new RunBatchItem(
                userId: (int) $user->getKey(),
                kind: $data['kind'],
                type: $item['type'],
                recordId: (int) $item['id'],
                options: $data['options'] ?? [],
            ),
            $data['items'],
        );

        $batch = Bus::batch($jobs)
            ->name($data['kind'])
            // ⚠️ ერთი ჩანაწერის ჩავარდნა დანარჩენებს არ აჩერებს — SPA-ს რიგის ქცევა
            ->allowFailures()
            /* **მფლობელი პარტიაშივე ჩაიწერება** (Tasks SEC-09).
               ⚠️ `Illuminate\Bus\Batch` **Eloquent-მოდელი არ არის**, ე.ი.
               `EnsureRecordOwnership` მას ვერ ხედავს და `BelongsToUser`-იც
               არ ეხება — სხვისი UUID-ით პროგრესის კითხვა და მიმდინარე
               პარტიის გაუქმება შესაძლებელი იყო. `withOption()` `job_batches.options`-ში
               ჯდება, ე.ი. ცალკე ცხრილი არ სჭირდება. */
            ->withOption('user_id', (int) $user->getKey())
            ->dispatch();

        if (! $this->startWorker($background)) {
            // ⚠️ პარტია იშლება: ჩაწერილი, მაგრამ არასდროს გაშვებული რიგი
            // „მუშაობს"-ად გამოჩნდებოდა და სამუდამოდ 0%-ზე იდგებოდა
            $batch->cancel();

            return response()->json(['message' => 'worker_unavailable'], 503);
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
     * **ჩემი პარტია, თორემ 404** (Tasks SEC-09).
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

        return [
            'id' => $batch->id,
            'kind' => $batch->name,
            'total' => $batch->totalJobs,
            'pending' => $batch->pendingJobs,
            'processed' => $batch->processedJobs(),
            'failed' => $batch->failedJobs,
            'progress' => $batch->progress(),
            'cancelled' => $batch->cancelled(),
            'finished' => $batch->finished(),
        ];
    }

    /**
     * **worker-ის გაშვება მოთხოვნისამებრ.**
     *
     * ⚠️ **`--stop-when-empty` არის ის, რაც მუდმივ პროცესს ზედმეტს ხდის.**
     * worker რიგს ამოწურავს და ითიშება; მომდევნო პარტია ახალს გაუშვებს.
     * ე.ი. „გაუშვი მეოთხე პროცესი და არ დაგავიწყდეს" — რომელიც ამ თასქის
     * ერთადერთი რეალური წინაპირობა იყო — აღარ არსებობს.
     *
     * ⚠️ **პარალელური worker-ები უვნებელია**: ისინი ერთსა და იმავე რიგს
     * კითხულობენ, ხოლო job-ის „დაჭერა" ბაზის დონეზეა (`reserved_at`) —
     * ორჯერ დამუშავება გამორიცხულია.
     */
    private function startWorker(BackgroundProcess $background): bool
    {
        return $background->dispatch([
            PHP_BINARY,
            base_path('artisan'),
            'queue:work',
            '--stop-when-empty',
            '--tries=1',
            '--max-time='.self::WORKER_MAX_SECONDS,
        ]);
    }
}
