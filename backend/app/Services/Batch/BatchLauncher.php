<?php

namespace App\Services\Batch;

use App\Jobs\RunBatchItem;
use App\Models\User;
use App\Services\Cast\CastPool;
use App\Services\Credentials\CredentialStore;
use App\Services\Notify\Notifier;
use App\Services\Translation\ItemTranslator;
use App\Support\BackgroundProcess;
use App\Support\CredentialProviders;
use App\Support\MissingCredential;
use App\Support\NotificationType;
use Illuminate\Bus\Batch;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Bus;

/**
 * **ფონური პარტიის გამშვები** — ერთი გზა ორი შესასვლელისთვის: ახალი პარტია
 * (`POST /batches`) და გაწყვეტილი სინქრონიზაციის გაგრძელება
 * (`POST /sync/runs/{run}/resume`). ორივე ერთსა და იმავე შემოწმებებს გადის და ერთნაირ
 * პარტიას წერს — ორი ასლი პირველივე ცვლილებაზე დაშორდებოდა.
 *
 * ⚠️ **worker ავტომატურად ეშვება** (`queue:work --stop-when-empty`) —
 * `BackgroundProcess`-ით, ზუსტად ისე, როგორც `yt-dlp` ეშვება: მუდმივად გაშვებული
 * მეოთხე პროცესი არ სჭირდება, worker რიგს ამოწურავს და თვითონ ითიშება. თუ
 * `popen`/`exec` გამორთულია, პარტია უქმდება და გამომძახებელი **503
 * `worker_unavailable`**-ს აბრუნებს — არა ჩუმად გაჩერებულ პარტიას.
 */
class BatchLauncher
{
    /**
     * ერთ პარტიაში რამდენი ერთეული ეტევა.
     *
     * ⚠️ **1000-დან 5000-მდე აიწია მსახიობების გამო**: ცოცხალ ბაზაში ერთი ანგარიშის
     * ბიბლიოთეკა 3530 მსახიობია, ე.ი. „ვისაც ჯერ არ განახლებია" პირველ გაშვებაზე
     * 1000-ზე ბევრად მეტია და გადაცემა 422-ით ჩავარდებოდა. რეალური საზღვარი ერთი
     * INSERT-ის ზომაა — იხ. `INSERT_CHUNK`.
     */
    public const MAX_ITEMS = 5000;

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
     * (ზუსტად ის, რაც ვიდეოს ჩამოწერას დაემართა).
     */
    private const WORKER_MAX_SECONDS = 3600;

    public function __construct(private readonly BackgroundProcess $background) {}

    /**
     * **უფლება და გასაღები — პარტიის ჩაწერამდე**; `null` — გაშვება ნებადართულია.
     *
     * ⚠️ **უფლება აქ მოწმდება და არა job-ში.** ოპერაცია არსებულ ჩანაწერს ცვლის, ე.ი.
     * მოდული და `update` სჭირდება — იგივე წესი, რაც `/media/sync/{type}/{id}`-ს.
     * job-ში შემოწმება გვიანია: მაშინ პასუხი უკვე გაცემულია და უარი არსად ჩანს.
     * ⚠️ **მსახიობის ერთეულს მოდული არ აქვს** — „ვის შეუძლია" ჩართული მედია-მოდული
     * წყვეტს, ზუსტად ისე, როგორც `/cast/sync/plan`-ზე.
     * ⚠️ **გასაღებიც აქვე მოწმდება**: გასაღები მხოლოდ მომხმარებლისაა, ე.ი. მის გარეშე
     * 300-ერთეულიანი პარტია 300-ჯერ ერთსა და იმავე მიზეზზე ჩავარდებოდა — და ეს მხოლოდ
     * ბოლოს გამოჩნდებოდა. თარგმანს ერთი წყაროც ჰყოფნის (TMDB ან Gemini).
     *
     * @param  list<array{type: string, id: int|string}>  $items
     * @param  array<string, mixed>  $options
     */
    public function denies(User $user, string $kind, array $items, array $options): ?JsonResponse
    {
        if ($kind === RunBatchItem::KIND_CAST) {
            if (! CastPool::typesFor($user)) {
                return response()->json(['message' => 'module_disabled'], 403);
            }
        } else {
            foreach (array_unique(array_column($items, 'type')) as $type) {
                if (! $user->hasModule($type) || ! $user->hasPermission($type, 'update')) {
                    return response()->json([
                        'message' => 'forbidden_permission',
                        'permission' => "{$type}.update",
                    ], 403);
                }
            }
        }

        if ($missing = $this->missingCredential($kind, $options)) {
            return MissingCredential::response($missing);
        }

        return null;
    }

    /**
     * **პარტიის ჩაწერა** — worker-ის გაშვებამდე (`start()`).
     *
     * `$runKey` — სინქრონიზაციის გაშვება, რომელსაც ეს პარტია **აგრძელებს**: ერთეულების
     * შედეგი იმავე გაშვებაში იწერება (`RunBatchItem::remember()`) და დასრულების
     * შეტყობინებაც მას ხსნის. მის გარეშე გაშვების გასაღები თვითონ პარტიის id-ია.
     *
     * @param  list<array{type: string, id: int|string}>  $items
     * @param  array<string, mixed>  $options
     */
    public function dispatch(User $user, string $kind, array $items, array $options, ?string $runKey = null): Batch
    {
        $userId = (int) $user->getKey();

        $jobs = array_map(
            fn (array $item) => new RunBatchItem(
                userId: $userId,
                kind: $kind,
                type: (string) $item['type'],
                recordId: (int) $item['id'],
                options: $options,
            ),
            $items,
        );

        /* ⚠️ **ნაწილებად** (იხ. `INSERT_CHUNK`): პირველი ნაწილი პარტიას ქმნის,
           დანარჩენი `add()`-ით ემატება — **worker-ის გაშვებამდე**, ე.ი. პარტია
           მანამდე ვერ „დასრულდება", სანამ ყველა ერთეული ჩაწერილი არ არის. */
        $chunks = array_chunk($jobs, self::INSERT_CHUNK);

        $pending = Bus::batch(array_shift($chunks))
            ->name($kind)
            // ⚠️ ერთი ჩანაწერის ჩავარდნა დანარჩენებს არ აჩერებს — SPA-ს რიგის ქცევა
            ->allowFailures()
            /* **მფლობელი პარტიაშივე ჩაიწერება**.
               ⚠️ `Illuminate\Bus\Batch` **Eloquent-მოდელი არ არის**, ე.ი.
               `EnsureRecordOwnership` მას ვერ ხედავს და `BelongsToUser`-იც
               არ ეხება — სხვისი UUID-ით პროგრესის კითხვა და მიმდინარე
               პარტიის გაუქმება შესაძლებელი იყო. `withOption()` `job_batches.options`-ში
               ჯდება, ე.ი. ცალკე ცხრილი არ სჭირდება. */
            ->withOption('user_id', $userId);

        if ($runKey !== null) {
            $pending->withOption('run', $runKey);
        }

        /* ⚠️ **`finally` და არა `then`**: `allowFailures()`-ის
           პირობებში `then` მხოლოდ სუფთა გავლაზე ისვრის, ე.ი. სწორედ ის
           პარტია, რომელსაც ყველაზე მეტად სჭირდება შეტყობინება (ერთი
           ჩავარდნა სამასიდან), ჩუმად დამთავრდებოდა.
           ⚠️ **id და არა `$user`**: callback სერიალიზდება `job_batches`-ში და
           მთელი მოდელის ჩაკერვა იქ მის იმ დროინდელ ასლს გაყინავდა. */
        $batch = $pending
            ->finally(function (Batch $done) use ($userId, $kind) {
                app(Notifier::class)->send(User::find($userId), NotificationType::BATCH_DONE, [
                    'kind' => $kind,
                    'total' => $done->totalJobs,
                    'failed' => $done->failedJobs,
                    // გაშვების გასაღები — შეტყობინება „სინქრონიზაციის შედეგებში" ამ გაშვებას ხსნის
                    'run' => $done->options['run'] ?? $done->id,
                ]);
            })
            ->dispatch();

        foreach ($chunks as $chunk) {
            $batch = $batch->add($chunk);
        }

        return $batch;
    }

    /**
     * **worker-ის გაშვება მოთხოვნისამებრ**; `false` — ვერ გაეშვა და პარტია გაუქმდა.
     *
     * ⚠️ **`--stop-when-empty` არის ის, რაც მუდმივ პროცესს ზედმეტს ხდის.**
     * worker რიგს ამოწურავს და ითიშება; მომდევნო პარტია ახალს გაუშვებს.
     * ⚠️ **პარალელური worker-ები უვნებელია**: ისინი ერთსა და იმავე რიგს
     * კითხულობენ, ხოლო job-ის „დაჭერა" ბაზის დონეზეა (`reserved_at`) —
     * ორჯერ დამუშავება გამორიცხულია.
     * ⚠️ **ვერ გაშვებულზე პარტია უქმდება**: ჩაწერილი, მაგრამ არასდროს გაშვებული რიგი
     * „მუშაობს"-ად გამოჩნდებოდა და სამუდამოდ 0%-ზე იდგებოდა.
     */
    public function start(Batch $batch): bool
    {
        $started = $this->background->dispatch([
            PHP_BINARY,
            base_path('artisan'),
            'queue:work',
            '--stop-when-empty',
            '--tries=1',
            '--max-time='.self::WORKER_MAX_SECONDS,
        ]);

        if (! $started) {
            $batch->cancel();
        }

        return $started;
    }

    /**
     * რომელი წყაროს გასაღები აკლია ამ ოპერაციას; `null` — არაფერი.
     *
     * ⚠️ სინქრონი, გალერეა და მსახიობი TMDB-ზე დგანან; თარგმანი კი არჩეულ
     * წყაროებზე — ერთი მაინც უნდა მუშაობდეს (`ItemTranslator`-ის წესი).
     *
     * @param  array<string, mixed>  $options
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
}
