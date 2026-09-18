<?php

namespace App\Jobs;

use App\Models\Anime;
use App\Models\BatchItem;
use App\Models\Movie;
use App\Models\Series;
use App\Models\User;
use App\Services\Gallery\GalleryFetcher;
use App\Services\Sync\ItemSyncer;
use App\Services\Translation\ItemTranslator;
use App\Support\MediaDomain;
use App\Support\SourceLog;
use Illuminate\Bus\Batchable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Auth;
use Throwable;

/**
 * **რიგის ერთი ერთეული სერვერის მხარეს** (აუდიტი 2026-09-14, §D1).
 *
 * ⚠️ **პრობლემა, რომელსაც ეს ხსნის:** სინქრონი, გალერეა და თარგმანი
 * **ბრაუზერის ტაბში** ტრიალებდა (`ui/queue.tsx` თითო ჩანაწერზე ერთ მოკლე
 * რექვესთს აგზავნის). 300-ჩანაწერიანი გაშვება ჩერდებოდა ტაბის დახურვაზე,
 * ქსელის გაწყვეტაზე ან ლეპტოპის დაძინებაზე — და დარჩენილი ჩანაწერები
 * უბრალოდ არ მუშავდებოდა.
 *
 * ⚠️ **`Auth::onceUsingId()` ამ ფაილში ყველაზე მნიშვნელოვანი ხაზია.**
 * მთელი აპლიკაცია `BelongsToUser`-ის global scope-ზე დგას, ის კი
 * `Auth::id()`-ს კითხულობს. worker-ს სესია **არ აქვს**, ე.ი. ავტორიზაციის
 * გარეშე გაშვებული job **ყველა მომხმარებლის** ჩანაწერს დაინახავდა — და
 * სინქრონი მათ გადააწერდა. სწორედ ამიტომ არსებობს `media:redownload --user=`
 * (CLI-ზე იგივე პრობლემაა) და სწორედ ამიტომ ეს job მომხმარებელს ცხადად
 * „იცვამს".
 *
 * ⚠️ **ერთი ერთეული = ერთი job.** მთელი გეგმა ერთ job-ად რომ იყოს,
 * ერთი ჩავარდნილი ჩანაწერი მთელს ჩააგდებდა, პროგრესი კი მხოლოდ
 * „დაიწყო/დამთავრდა" იქნებოდა. `Bus::batch()` თითოს ცალკე ითვლის —
 * ზუსტად ის მოდელი, რაც SPA-ს რიგს აქვს.
 *
 * ⚠️ **`tries = 1`** — გამეორება აქ მავნეა: სინქრონი TMDB-ს ურეკავს და
 * თარგმანი Gemini-ს კვოტას ხარჯავს. ჩავარდნა ერთხელ ჩაიწერება და
 * მომხმარებელი თვითონ წყვეტს, გაუშვას თუ არა ხელახლა.
 */
class RunBatchItem implements ShouldQueue
{
    use Batchable, Queueable;

    /** მხარდაჭერილი ოპერაციები — SPA-ს რიგის იმავე სახელებით */
    public const KINDS = ['sync', 'gallery', 'translate'];

    public int $tries = 1;

    /** ერთ ერთეულს წუთებიც შეიძლება დასჭირდეს (გალერეა ათეულ ფოტოს წერს) */
    public int $timeout = 600;

    public function __construct(
        public readonly int $userId,
        public readonly string $kind,
        public readonly string $type,
        public readonly int $recordId,
        public readonly array $options = [],
    ) {}

    public function handle(
        ItemSyncer $syncer,
        ItemTranslator $translator,
        GalleryFetcher $gallery,
    ): void {
        if ($this->batch()?->cancelled()) {
            return;
        }

        $user = User::find($this->userId);

        if (! $user) {
            // ⚠️ რიგი აქ ვერ დაიწერება — `user_id` უცხო გასაღებია და ანგარიში აღარაა
            /* ⚠️ ჩავარდნა არ არის (ანგარიში წაიშალა), მაგრამ **უხმო** არც
               უნდა იყოს: სხვაგვარად პარტია „შესრულებულად" ითვლება და
               „რატომ არაფერი მოხდა" პასუხგაუცემელია (Tasks BUG-08). */
            SourceLog::failed('batch:'.$this->kind, 'user_missing', ['user' => $this->userId]);

            return;
        }

        /* ⚠️ იხ. კლასის შენიშვნა — ამის გარეშე `owner` scope გამორთულია და
           ოპერაცია სხვისი ჩანაწერის გადაწერასაც შეძლებდა.

           ⚠️ **`setUser()` და არა `onceUsingId()`**: აპლიკაციის ნაგულისხმევი
           guard **sanctum**-ია (`RequestGuard`), ხოლო `onceUsingId()`
           მხოლოდ `SessionGuard`-ს აქვს — გამოძახება `BadMethodCallException`-ით
           ვარდებოდა. `setUser()` ორივე ტიპის guard-ს აქვს და სწორედ ის
           აისახება `Auth::id()`-ზე, რომელსაც global scope კითხულობს. */
        Auth::setUser($user);

        /* ⚠️ **რიგი job-ის დასაწყისში იწერება** (Tasks FEAT-03) და არა ბოლოს:
           ჩავარდნისას გამონაკლისი გადაისვრება, ე.ი. ბოლოში ჩაწერა
           **ჩავარდნილ ერთეულს საერთოდ არ დააფიქსირებდა** — ზუსტად ის, რის
           ჩვენებაც ამ ცხრილს სურს. */
        $item = $this->track();

        try {
            /* ⚠️ **`OK` მხოლოდ მაშინ, როცა სამუშაო მართლა შესრულდა.** `run()`
               გამოტოვებაზე ნორმალურად ბრუნდება, ე.ი. უპირობო `OK` ახლახან
               დაწერილ `skipped`-ს **გადააწერდა** — და სია იტყოდა, რომ
               წაშლილი ჩანაწერი დამუშავდა. */
            if ($this->run($user, $syncer, $translator, $gallery, $item)) {
                $item?->update(['status' => BatchItem::OK]);
            }
        } catch (Throwable $e) {
            /* ⚠️ **`saveQuietly`-ს აქ აზრი არ აქვს, `update` სჭირდება**: ეს
               რიგი `AuditRegistry`-ში არაა (ის მიწოდების ჟურნალია და არა
               მომხმარებლის ქმედება — `NOT_LOGGED`-ის იგივე წესი). */
            $item?->update([
                'status' => BatchItem::FAILED,
                // ⚠️ მხოლოდ შეტყობინება: stack trace `sources.log`-შია და
                // მისი UI-ში გამოტანა შიდა ბილიკებს გაამხელდა
                'error' => mb_substr($e->getMessage(), 0, 500),
            ]);
            SourceLog::threw('batch:'.$this->kind, $e, [
                'type' => $this->type,
                'id' => $this->recordId,
            ]);

            /* ⚠️ **გადასროლა აუცილებელია** (Tasks BUG-08). აქამდე
               გამონაკლისი აქ კვდებოდა, ე.ი. `$batch->failedJobs` **ყოველთვის
               0-ია**, `processedJobs == totalJobs` და `failed_jobs` ცარიელი:
               SPA „300/300 დასრულდა"-ს აჩვენებდა იმ გაშვებაზეც, სადაც ყველა
               TMDB call 401-ს დაბრუნდა — ზუსტად ის უხმო გამოტოვება,
               რომელსაც ეს პროექტი ყველაზე მძიმე ბაგად თვლის.

               ⚠️ **პარტიას ეს არ აჩერებს**: `BatchController` `allowFailures()`-ს
               უკვე აყენებს, ე.ი. დანარჩენი ერთეულები მაინც სრულდება — ის
               ერთადერთი მიზეზი, რის გამოც გადასროლა თავიდან „საშიშად" ჩანდა,
               უკვე გათვალისწინებული იყო.

               ⚠️ **`tries = 1` რჩება**: გამეორება აქ მავნეა (TMDB-ის
               მოთხოვნა, Gemini-ს კვოტა) — ჩავარდნა ერთხელ ჩაიწერება და
               ხელახლა გაშვება მომხმარებლის გადაწყვეტილებაა. */
            throw $e;
        }
    }

    /**
     * **ამ ერთეულის რიგი** (Tasks FEAT-03).
     *
     * ⚠️ `batch()` `null`-ია, როცა job პარტიის გარეშე გაეშვა (ტესტი,
     * ხელით dispatch) — მაშინ ჩასაწერი ადგილი არ არსებობს და ეს
     * ჩავარდნა არაა.
     */
    private function track(): ?BatchItem
    {
        $batchId = $this->batch()?->id;

        return $batchId === null ? null : BatchItem::create([
            'batch_id' => $batchId,
            'user_id' => $this->userId,
            'kind' => $this->kind,
            'type' => $this->type,
            'record_id' => $this->recordId,
            'status' => BatchItem::RUNNING,
        ]);
    }

    private function run(
        User $user,
        ItemSyncer $syncer,
        ItemTranslator $translator,
        GalleryFetcher $gallery,
        ?BatchItem $item = null,
    ): bool {
        $record = $this->record();

        if (! $record) {
            /* ⚠️ **`skipped` და არა `failed`** (Tasks FEAT-03): წაშლილი ან
               სხვისი ჩანაწერი კანონიერი გამოტოვებაა — „ჩავარდნად" ჩათვლა
               მომხმარებელს ხელახლა გაშვებას ურჩევდა იქ, სადაც გასაშვები
               აღარაფერია. */
            $item?->update(['status' => BatchItem::SKIPPED, 'error' => 'record_not_found']);
            /* ⚠️ ესეც კანონიერი გამოტოვებაა (ჩანაწერი გეგმასა და გაშვებას
               შორის წაიშალა, ან სხვისია და `owner` scope-მა დამალა) — და
               ესეც ლოგშია, იმავე მიზეზით. `skipped`/`failed`-ის ცალკე
               დათვლა ცალკე ტასქია (FEAT-03). */
            SourceLog::failed('batch:'.$this->kind, 'record_not_found', [
                'type' => $this->type,
                'id' => $this->recordId,
            ]);

            return false;
        }

        // ⚠️ სათაური **გაშვების მომენტში** იწერება: ჩანაწერი მოგვიანებით
        // შეიძლება წაიშალოს, სიაში კი „რა იყო ეს" უნდა დარჩეს
        $item?->update(['title' => $this->titleOf($record)]);

        match ($this->kind) {
            'sync' => $syncer->sync($record, [
                'fields' => $this->options['fields'] ?? [],
                'media' => (bool) ($this->options['media'] ?? false),
                'overwrite' => (bool) ($this->options['overwrite'] ?? false),
                'only_missing' => (bool) ($this->options['only_missing'] ?? false),
            ]),
            'translate' => $translator->translate(
                $record,
                $this->options['sources'] ?? ItemTranslator::SOURCES,
                (bool) ($this->options['review'] ?? false),
            ),
            // ⚠️ `options()` ნედლ შესატანს ნაგულისხმევებით ავსებს — იგივე გზა,
            // რასაც `GalleryController::fetch()` გადის
            'gallery' => $gallery->fetch($user, $record, $gallery->options($this->options)),
            default => null,
        };

        return true;
    }

    /**
     * ⚠️ **ჩანაწერი `Auth`-ის დაყენების შემდეგ იტვირთება** — ე.ი. `owner`
     * scope უკვე მოქმედებს და სხვისი id **ვერაფერს იპოვის** (null → გამოტოვება).
     * ეს მეორე ღობეა იმავე შეცდომაზე, რასაც `onceUsingId()` ხურავს.
     */
    /** სიაში საჩვენებელი სახელი — ორივე ენა ან რაც არის */
    private function titleOf(object $record): ?string
    {
        foreach (['title_ka', 'title_en', 'title'] as $field) {
            if (! empty($record->{$field})) {
                return mb_substr((string) $record->{$field}, 0, 200);
            }
        }

        return null;
    }

    private function record(): ?object
    {
        if (! MediaDomain::has($this->type)) {
            return null;
        }

        /** @var class-string<Movie|Series|Anime> $model */
        $model = MediaDomain::model($this->type);

        return $model::find($this->recordId);
    }
}
