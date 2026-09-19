<?php

namespace App\Models\Concerns;

use App\Models\MediaWatch;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Carbon;

/**
 * **ხელახლა ნახვის ჟურნალი (FEAT-14).**
 *
 * ⚠️ **`watched_at` რჩება და „ბოლო ნახვას" ნიშნავს.** მისი წაშლა ყველა
 * ფილტრს, სორტირებას, `MatchService`-ს, `PurgeService`-სა და
 * სტატისტიკას გადაწერას მოითხოვდა; სამაგიეროდ ის ერთადერთი წყაროდან
 * იწერება — `syncWatchedAt()` — რადგან ორი ადგილი ერთი ფაქტისთვის
 * ზუსტად ის ხაფანგია, რომელსაც `Book::syncProgress()` ებრძვის.
 *
 * ⚠️ **პირველ რიგს სტატუსი ქმნის და არა ღილაკი.** „ნანახად მოვნიშნე"
 * უკვე ნახვაა — მისი ცალკე ჩაწერის მოთხოვნა ჟურნალს ყველასთვის
 * ცარიელს დატოვებდა და მისი ფასი მხოლოდ მეორე ნახვიდან დაიწყებოდა.
 */
trait HasWatchLog
{
    /**
     * პირველი რიგი — `watched_at`-ის შევსებისთანავე.
     *
     * ⚠️ **მოვლენაზე დგას და არა `HasStatus::applyStatus()`-ში.** იქ
     * ჩანაწერს **ჯერ id არ აქვს** (ახალი ჩანაწერი სტატუსით იქმნება), ე.ი.
     * პოლიმორფული რიგი ვერსად მიება; აქ კი ორივე გზა — შექმნაც და
     * განახლებაც — ერთსა და იმავე ადგილს გადის.
     *
     * ⚠️ **`saveQuietly()` მოვლენებს არ ისვრის**, ე.ი. `syncWatchedAt()`
     * აქ უკან არ ბრუნდება — რეკურსია სქემითაა გამორიცხული.
     *
     * ⚠️ **პირობა `wasChanged`-ზეა და არა „ყოველ შენახვაზე შეამოწმე"** —
     * თორემ ყოველი `save()` ერთ ზედმეტ query-ს გააკეთებდა მაშინაც,
     * როცა ნახვას არაფერი შეხებია.
     */
    protected static function bootHasWatchLog(): void
    {
        static::saved(function ($record) {
            if (! $record->watched_at || ! ($record->wasChanged('watched_at') || $record->wasRecentlyCreated)) {
                return;
            }

            $record->watches()->firstOrCreate(
                ['user_id' => $record->user_id, 'watched_at' => $record->watched_at],
            );
        });
    }

    public function watches(): MorphMany
    {
        return $this->morphMany(MediaWatch::class, 'watchable')->orderByDesc('watched_at');
    }

    /**
     * ახალი ნახვა.
     *
     * ⚠️ **`firstOrCreate` იმავე წამზე და არა ბრმა `create`** — სტატუსის
     * ორჯერ მინიჭება (ფორმის ხელახალი შენახვა, მასობრივი ცვლილება)
     * იმავე მომენტს მეორედ ჩაწერდა და „ორჯერ ვნახე"-ს გამოიგონებდა.
     */
    public function logWatch(?Carbon $at = null, ?string $note = null): MediaWatch
    {
        $at ??= now();

        $watch = $this->watches()->firstOrCreate(
            ['user_id' => $this->user_id, 'watched_at' => $at],
            ['note' => $note],
        );

        $this->syncWatchedAt();

        return $watch;
    }

    /**
     * `watched_at` = ყველაზე გვიანი ნახვა.
     *
     * ⚠️ **`saveQuietly()`** — ეს ტექნიკური შედეგია და არა მომხმარებლის
     * რედაქტირება; `save()` აუდიტ-ლოგს „განახლდა: watched_at" მწკრივს
     * მიაწერდა ყოველ ნახვაზე.
     *
     * ⚠️ **ცარიელ ჟურნალზე `null`-ია და არა „არ შეეხო"** — ბოლო ნახვის
     * წაშლა სწორედ იმას ნიშნავს, რომ ჩანაწერი ნანახი აღარაა.
     */
    public function syncWatchedAt(): void
    {
        $latest = $this->watches()->max('watched_at');

        if ((string) $this->watched_at?->toDateTimeString() === (string) $latest) {
            return;
        }

        $this->watched_at = $latest;
        $this->saveQuietly();
    }
}
