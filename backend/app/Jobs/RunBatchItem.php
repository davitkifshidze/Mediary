<?php

namespace App\Jobs;

use App\Models\Anime;
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

        try {
            $this->run($user, $syncer, $translator, $gallery);
        } catch (Throwable $e) {
            /* ⚠️ **გამონაკლისი გარეთ არ გადის.** ერთი ჩანაწერის ჩავარდნა
               მთელ პარტიას არ უნდა აჩერებდეს (`Bus::batch()`-ის
               `allowFailures()`-ის იგივე აზრი) — მიზეზი ლოგშია. */
            SourceLog::threw('batch:'.$this->kind, $e, [
                'type' => $this->type,
                'id' => $this->recordId,
            ]);
        }
    }

    private function run(
        User $user,
        ItemSyncer $syncer,
        ItemTranslator $translator,
        GalleryFetcher $gallery,
    ): void {
        $record = $this->record();

        if (! $record) {
            return;
        }

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
    }

    /**
     * ⚠️ **ჩანაწერი `Auth`-ის დაყენების შემდეგ იტვირთება** — ე.ი. `owner`
     * scope უკვე მოქმედებს და სხვისი id **ვერაფერს იპოვის** (null → გამოტოვება).
     * ეს მეორე ღობეა იმავე შეცდომაზე, რასაც `onceUsingId()` ხურავს.
     */
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
