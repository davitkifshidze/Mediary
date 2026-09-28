<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\RunBatchItem;
use App\Models\BatchItem;
use App\Models\User;
use App\Services\Cast\CastPool;
use App\Services\Credentials\CredentialStore;
use App\Services\Notify\Notifier;
use App\Services\Translation\ItemTranslator;
use App\Support\BackgroundProcess;
use App\Support\CredentialProviders;
use App\Support\MediaDomain;
use App\Support\MissingCredential;
use App\Support\NotificationType;
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
    /**
     * ერთ პარტიაში რამდენი ერთეული ეტევა.
     *
     * ⚠️ **1000-დან 5000-მდე აიწია მსახიობების გამო** (Tasks §39): ცოცხალ
     * ბაზაში ერთი ანგარიშის ბიბლიოთეკა 3530 მსახიობია, ე.ი. „ვისაც ჯერ არ
     * განახლებია" პირველ გაშვებაზე 1000-ზე ბევრად მეტია და გადაცემა 422-ით
     * ჩავარდებოდა. რეალური საზღვარი ერთი INSERT-ის ზომაა — იხ. `INSERT_CHUNK`.
     */
    private const MAX_ITEMS = 5000;

    /**
     * **რამდენი job იწერება ერთ INSERT-ში.**
     *
     * ⚠️ `Batch::add()` მთელ სიას **ერთი** INSERT-ით წერს (`DatabaseQueue::bulk`),
     * ერთი job კი ~800 ბაიტია — ამ მანქანაზე `max_allowed_packet` 1 MB-ია,
     * ე.ი. ~1270-ზე მეტი ერთეული ერთ რექვესთში **MySQL-ის შეცდომით** ჩავარდებოდა
     * (sqlite-ის ტესტებს ეს ზღვარი საერთოდ არ აქვს და ვერ დაინახავდა).
     * 500 ცალი ~400 KB-ია — ორმაგი მარაგი.
     */
    private const INSERT_CHUNK = 500;

    /**
     * ⚠️ **worker-ის სიცოცხლის ჭერი.** `--stop-when-empty` მას რიგის
     * ამოწურვისთანავე აჩერებს, `--max-time` კი უკიდურესი შემთხვევის
     * დაზღვევაა: გაჭედილი job-ის გამო პროცესი სამუდამოდ არ უნდა დარჩეს
     * (ზუსტად ის, რაც ვიდეოს ჩამოწერას დაემართა — §B1).
     */
    private const WORKER_MAX_SECONDS = 3600;

    public function store(Request $request, BackgroundProcess $background)
    {
        /* Tasks §39 — ⚠️ **მსახიობის ერთეულს დომენი არ აქვს** (`type: 'actor'`):
           `cast_members` გლობალური ლექსიკონია და მედია-დომენად ვერ ჩაჯდება. */
        $castKind = $request->input('kind') === RunBatchItem::KIND_CAST;

        $data = $request->validate([
            'kind' => ['required', Rule::in(RunBatchItem::KINDS)],
            'items' => ['required', 'array', 'min:1', 'max:'.self::MAX_ITEMS],
            'items.*.type' => ['required', Rule::in($castKind ? [RunBatchItem::ACTOR] : MediaDomain::TYPES)],
            'items.*.id' => ['required', 'integer', 'min:1'],
            'options' => ['nullable', 'array'],
        ]);

        $user = $request->user();

        if ($castKind) {
            /* ⚠️ მსახიობს მოდული არ აქვს — „ვის შეუძლია" ჩართული მედია-მოდული
               წყვეტს, ზუსტად ისე, როგორც `/cast/sync/plan`-ზე. */
            if (! CastPool::typesFor($user)) {
                return response()->json(['message' => 'module_disabled'], 403);
            }
        } else {
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
        }

        /* Tasks §30.6 — ⚠️ **გასაღებიც აქვე მოწმდება, უფლების გვერდით.**
           §30-იდან გასაღები მხოლოდ მომხმარებლისაა, ე.ი. მის გარეშე 300-ერთეულიანი
           პარტია 300-ჯერ ერთსა და იმავე მიზეზზე ჩავარდებოდა — და ეს მხოლოდ
           ბოლოს გამოჩნდებოდა. თარგმანს ერთი წყაროც ჰყოფნის (TMDB ან Gemini). */
        if ($missing = $this->missingCredential($data['kind'], $data['options'] ?? [])) {
            return MissingCredential::response($missing);
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

        /* ⚠️ **ნაწილებად** (იხ. `INSERT_CHUNK`): პირველი ნაწილი პარტიას ქმნის,
           დანარჩენი `add()`-ით ემატება — **worker-ის გაშვებამდე**, ე.ი. პარტია
           მანამდე ვერ „დასრულდება", სანამ ყველა ერთეული ჩაწერილი არ არის. */
        $chunks = array_chunk($jobs, self::INSERT_CHUNK);

        $batch = Bus::batch(array_shift($chunks))
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
            /* FEAT-19 — ⚠️ **`finally` და არა `then`**: `allowFailures()`-ის
               პირობებში `then` მხოლოდ სუფთა გავლაზე ისვრის, ე.ი. სწორედ ის
               პარტია, რომელსაც ყველაზე მეტად სჭირდება შეტყობინება (ერთი
               ჩავარდნა სამასიდან), ჩუმად დამთავრდებოდა.
               ⚠️ **`$user->getKey()` და არა `$user`**: callback სერიალიზდება
               `job_batches`-ში და მთელი მოდელის ჩაკერვა იქ მის იმ დროინდელ
               ასლს გაყინავდა. */
            ->finally(function (Batch $done) use ($user, $data) {
                app(Notifier::class)->send(User::find($user->getKey()), NotificationType::BATCH_DONE, [
                    'kind' => $data['kind'],
                    'total' => $done->totalJobs,
                    'failed' => $done->failedJobs,
                ]);
            })
            ->dispatch();

        foreach ($chunks as $chunk) {
            $batch = $batch->add($chunk);
        }

        if (! $this->startWorker($background)) {
            // ⚠️ პარტია იშლება: ჩაწერილი, მაგრამ არასდროს გაშვებული რიგი
            // „მუშაობს"-ად გამოჩნდებოდა და სამუდამოდ 0%-ზე იდგებოდა
            $batch->cancel();

            return response()->json(['message' => 'worker_unavailable'], 503);
        }

        return response()->json($this->payload($batch->fresh()), 202);
    }

    /**
     * რომელი წყაროს გასაღები აკლია ამ ოპერაციას; `null` — არაფერი.
     *
     * ⚠️ სინქრონი, გალერეა და მსახიობი TMDB-ზე დგანან; თარგმანი კი არჩეულ
     * წყაროებზე — ერთი მაინც უნდა მუშაობდეს (`ItemTranslator`-ის წესი).
     */
    private function missingCredential(string $kind, array $options): ?string
    {
        if ($kind !== 'translate') {
            return CredentialStore::configured(CredentialProviders::TMDB) ? null : CredentialProviders::TMDB;
        }

        $sources = array_values(array_intersect(ItemTranslator::SOURCES, (array) ($options['sources'] ?? [])))
            ?: ItemTranslator::SOURCES;

        foreach ($sources as $source) {
            $provider = $source === 'gemini' ? CredentialProviders::GEMINI : CredentialProviders::TMDB;

            if (CredentialStore::configured($provider)) {
                return null;
            }
        }

        return $sources === ['gemini'] ? CredentialProviders::GEMINI : CredentialProviders::TMDB;
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
     * **თითო ერთეულის შედეგი** (Tasks FEAT-03).
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
