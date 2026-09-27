<?php

namespace App\Models\Concerns;

use App\Models\AuditLog;
use App\Services\Audit\AuditLogger;
use App\Support\TrashDomain;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;

/**
 * **კალათა (FEAT-11)** — წაშლილი ჩანაწერი სიიდან ქრება, ბაზიდან არა.
 *
 * ⚠️ **`delete()` განზრახ **არ** არის გადაფარებული და ეს გადაწყვეტილების
 * მთავარი ნაწილია.** `SoftDeletes`-ის მსგავსი გადაფარება ერთდროულად
 * შეცვლიდა **ყველა** წაშლას პროექტში — `PurgeService`-ს (რომელიც
 * ცხადად `delete()`-ს იძახის, რომ მოვლენები გაისროლოს და ფაილები
 * გათავისუფლდეს), ანგარიშის წაშლას (BUG-21), ლექსიკონის წაშლის
 * „ჩანაწერებიც წაშალე"-ს და ყველა კასკადს. ამიტომ კალათაში გადატანა
 * **ცხადი მოქმედებაა** (`moveToTrash()`) და მას მხოლოდ მოდულის
 * `destroy()` იძახის.
 *
 * ⚠️ **გამომდინარე წესი, რომელიც უნდა დარჩეს:** *ჩვეულებრივი წაშლა
 * კალათაშია, აკრეფილი `DELETE`-ის უკან — ნამდვილი.* `/purge` და
 * ლექსიკონის „ჩანაწერებიც წაშალე" ტიპიზებულ დადასტურებაზე დგანან, ე.ი.
 * იქ მომხმარებელმა უკვე თქვა, რომ შედეგს იღებს; კალათა კი შემთხვევით
 * დაჭერას იცავს.
 *
 * ⚠️ **scope `trash` ჰქვია** (`owner`-ის რიგში) და მისი გამორთვა ცხადია:
 * `withoutGlobalScope('trash')`. სამი ადგილი მართლა უნდა ხედავდეს
 * წაშლილს — თვითონ კალათა, `/purge` და ანგარიშის წაშლა.
 */
trait HasTrash
{
    /** @var list<string> */
    protected array $trashCasts = ['trashed_at' => 'datetime'];

    protected static function bootHasTrash(): void
    {
        static::addGlobalScope('trash', function (Builder $q) {
            $q->whereNull($q->getModel()->getTable().'.trashed_at');
        });
    }

    /**
     * ⚠️ **`casts()`-ის ნაცვლად `initializeHasTrash()`** — მოდელებს
     * საკუთარი `casts()` აქვთ და ტრეიტის მეთოდი მას **გადაფარავს**
     * (PHP-ის ტრეიტების წესით მოდელის საკუთარი მეთოდი იმარჯვებს, ე.ი.
     * ჩვენი ჩუმად აღარ გამოიძახება). ინიციალიზაცია კი ყოველთვის ეშვება.
     */
    public function initializeHasTrash(): void
    {
        $this->mergeCasts($this->trashCasts);
    }

    public function trashed(): bool
    {
        return $this->trashed_at !== null;
    }

    /**
     * კალათაში გადატანა.
     *
     * ⚠️ **`saveQuietly()` და არა `save()`** — ეს მომხმარებლის რედაქტირება
     * არ არის, ე.ი. `AuditObserver`-ის „განახლდა: trashed_at" მწკრივი
     * ჟურნალს ატყუებდა.
     *
     * ⚠️ **ჟურნალი სწორედ ამიტომ იწერება აქ, ხელით.** `deleted` მოვლენა
     * არ ისვრება (ჩანაწერი ხომ არ იშლება), ე.ი. ლოგი სხვაგვარად **სულ
     * არაფერს იტყოდა** — „ვინ და როდის წაშალა" 30 დღით უცნობი დარჩებოდა,
     * მაშინ როცა ეს ზუსტად ის კითხვაა, რომლისთვისაც ჟურნალი არსებობს.
     * ერთ ადგილას წერია, რადგან ათივე დომენს იგივე სჭირდება.
     */
    public function moveToTrash(): bool
    {
        if ($this->trashed()) {
            return false;
        }

        $this->trashed_at = now();
        $saved = $this->saveQuietly();

        if ($saved) {
            app(AuditLogger::class)->model($this, AuditLog::ACTION_DELETE, $this->attributesToArray(), ['trashed' => true]);
            $this->afterTrashChange(true);
        }

        return $saved;
    }

    /**
     * აღდგენა.
     *
     * ⚠️ **ფაილებსა და მიბმებს არაფერი სჭირდებათ** — ისინი არასდროს
     * წაშლილა: კალათა სტრიქონს ტოვებს ადგილზე, ე.ი. `<module>_files`,
     * `<module>_notes`, გალერეა, ჟანრების pivot და კვოტის მრიცხველი
     * ხელუხლებელია. სწორედ ეს არის მიზეზი, რის გამოც კალათა ნამდვილი
     * წაშლა **არ** არის.
     */
    public function restoreFromTrash(): bool
    {
        if (! $this->trashed()) {
            return false;
        }

        $this->trashed_at = null;
        $saved = $this->saveQuietly();

        if ($saved) {
            app(AuditLogger::class)->model($this, AuditLog::ACTION_RESTORE, null, ['trashed' => false]);
            $this->afterTrashChange(false);
        }

        return $saved;
    }

    /**
     * **ცხადი კაკვი ურნაში გადატანისა და აღდგენის შემდეგ** (Tasks §29, ეტაპი 2).
     *
     * ⚠️ `saveQuietly()` მოვლენებს არ ისვრის (ეს განზრახაა — იხ. ზემოთ),
     * ე.ი. ის, რაც წაშლილის მდგომარეობაზეა დამოკიდებული, თვითონ უნდა
     * გადაითვალოს: ყურების ჟურნალზე „ბოლო ნახვა" (`syncWatchedAt()`),
     * შეხსენებაზე — `next_at` (ვადა ამასობაში შეიძლება გავიდა). ცარიელი
     * ნაგულისხმევი, რომ ყველა მოდელს არ დასჭირდეს.
     */
    protected function afterTrashChange(bool $trashed): void {}

    /** კალათაში მყოფი ჩანაწერები — scope-ის გარეშე */
    public static function onlyTrashed(): Builder
    {
        return static::withoutGlobalScope('trash')->whereNotNull('trashed_at');
    }

    /**
     * **ერთი ანგარიშის ურნა — ყველა global scope-ის გარეშე** (Tasks §29).
     *
     * ⚠️ `owner`-ის გარდა ფოტოს `album_lock`-იც ითიშება: ჩაკეტილი ალბომის
     * ფოტო ურნაშიც ურნაშია — გვერდი მას ბუნდოვნად ხატავს (`AlbumLock`-ის
     * წესი), მაგრამ სიიდან არ ქრება. მფლობელი ცხადი `user_id`-ით იჭრება.
     */
    public static function trashOf(int $userId): Builder
    {
        $table = (new static)->getTable();

        return static::withoutGlobalScopes()
            ->whereNotNull("{$table}.trashed_at")
            ->where("{$table}.user_id", $userId);
    }

    /**
     * ვადაგასული ჩანაწერები.
     *
     * ⚠️ **ყველა global scope ითიშება** — `owner` (გასუფთავება კონსოლიდან
     * ეშვება, სადაც `Auth::id()` ცარიელია, რექვესთიდან კი ერთ მომხმარებელზე
     * დაიჭრებოდა) და ფოტოს `album_lock`-იც (Tasks §29): scope-ის გარეშე
     * ჩაკეტილი ალბომის ურნაში მყოფი ფოტო **ვერასდროს** წაიშლებოდა, ე.ი.
     * დისკს და კვოტას სამუდამოდ დაიკავებდა.
     */
    public static function expiredTrash(?int $days = null): Builder
    {
        return static::trashedBefore(now()->subDays($days ?? TrashDomain::KEEP_DAYS));
    }

    /**
     * ურნაში მოცემულ მომენტამდე მოხვედრილი — ყველა ანგარიშის (Tasks §29.6:
     * ვადა თითო ანგარიშისაა, ე.ი. ზღვარს და ანგარიშებს `TrashBin` ირჩევს).
     */
    public static function trashedBefore(CarbonInterface $before): Builder
    {
        $table = (new static)->getTable();

        return static::withoutGlobalScopes()
            ->whereNotNull("{$table}.trashed_at")
            ->where("{$table}.trashed_at", '<=', $before);
    }
}
