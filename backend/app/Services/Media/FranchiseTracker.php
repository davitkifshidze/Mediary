<?php

namespace App\Services\Media;

use App\Models\FranchisePart;
use App\Models\FranchiseReminder;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Services\Notify\Notifier;
use App\Services\Tmdb\TmdbClient;
use App\Support\NotificationType;
use App\Support\SourceLog;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Throwable;

/**
 * **ფრანჩაიზის ნაწილები: რა არსებობს, რა მაქვს და რა მაკლია.**
 *
 * ერთი ადგილი სამი კითხვისთვის:
 *  · `refresh()` — TMDB-ის ნაწილების სია `franchise_parts`-ში (გლობალური ფაქტები);
 *  · `notifyMissing()` — ბიბლიოთეკასთან შედარება → თითო დაუმატებელ ნაწილზე **ერთი**
 *    შეტყობინება, სამუდამოდ ერთი (`franchise_reminders.notified_at`);
 *  · `gaps()` / `parts()` — ფილმის გვერდის ბლოკი და სიის ფრანჩაიზის ჯგუფი იმავე ცხრილს
 *    კითხულობს, TMDB-ს აღარ.
 *
 * ⚠️ **როდის მოწმდება**: ფილმის დამატებისას და სინქრონიზაციისას მაშინვე (`track()`),
 * და ღამით ერთხელ ყველა ფრანჩაიზზე (`franchises:check`). უფრო ხშირი გადამოწმება არ
 * კეთდება — ახალი ნაწილი წელიწადში ერთხელ თუ ცხადდება.
 *
 * ⚠️ **„მაქვს" ურნასაც და ჩაკეტილსაც ითვლის**: ურნაში მყოფი ან ჩაკეტილი ნაწილი
 * დაუმატებელი არ არის. ფრანჩაიზი კი, რომლის ყველა ჩემი ნაწილი ჩაკეტილია, საერთოდ არ
 * მოწმდება — შეტყობინება მის არსებობას გაამხელდა.
 */
class FranchiseTracker
{
    /** დამატებისა და სინქრონის შემდეგ ამ ხნის განმავლობაში ფრანჩაიზი ხელახლა არ იკითხება */
    public const FRESH_MINUTES = 60;

    private ?string $routeBase = null;

    public function __construct(private TmdbClient $tmdb, private Notifier $notifier) {}

    /**
     * ფრანჩაიზის ნაწილების განახლება TMDB-დან.
     *
     * @return bool ცხრილში ამ ფრანჩაიზის ნაწილები არის (ახლა ჩაიწერა ან ჯერ კიდევ ახალია)
     */
    public function refresh(int $collectionId, int $maxAgeMinutes = self::FRESH_MINUTES): bool
    {
        $last = FranchisePart::where('tmdb_collection_id', $collectionId)->max('checked_at');

        if ($last && Carbon::parse($last)->gt(now()->subMinutes($maxAgeMinutes))) {
            return true;
        }

        if (! $this->tmdb->configured()) {
            return (bool) $last;
        }

        $data = $this->tmdb->collection($collectionId);

        // შეცდომის პასუხს ნაწილების სია არ აქვს — რაც ჩაწერილია, ხელუხლებელი რჩება
        if (! is_array($data['parts'] ?? null)) {
            return (bool) $last;
        }

        $now = now();
        $seen = [];

        foreach ($data['parts'] ?? [] as $part) {
            if (empty($part['id'])) {
                continue;
            }

            $date = (string) ($part['release_date'] ?? '');

            FranchisePart::updateOrCreate(
                ['tmdb_collection_id' => $collectionId, 'tmdb_id' => (int) $part['id']],
                [
                    'collection_name' => $data['name'] ?? null,
                    'title' => (string) ($part['title'] ?? ($part['original_title'] ?? '')),
                    'release_date' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? $date : null,
                    'tmdb_poster' => $part['poster_path'] ?? null,
                    'overview' => $part['overview'] ?? null,
                    'rating' => isset($part['vote_average']) ? round((float) $part['vote_average'], 1) : null,
                    'checked_at' => $now,
                ],
            );
            $seen[] = (int) $part['id'];
        }

        // TMDB-მ ნაწილი ფრანჩაიზიდან ამოიღო — ჩვენთანაც ქრება
        FranchisePart::where('tmdb_collection_id', $collectionId)->whereNotIn('tmdb_id', $seen)->delete();

        return $seen !== [];
    }

    /**
     * ფილმი დაემატა ან დასინქრონდა: მისი ფრანჩაიზი მაშინვე მოწმდება.
     *
     * ⚠️ ჩავარდნა ჩუმია — ფრანჩაიზის შემოწმება ფილმის დამატებას არ უნდა აჩერებდეს.
     */
    public function track(Movie $movie): void
    {
        $collection = (int) $movie->tmdb_collection_id;
        $owner = $collection ? User::find($movie->user_id) : null;

        if (! $owner) {
            return;
        }

        try {
            // ეს ნაწილი უკვე ჩემია — მასზე დაწერილი „აკლია" აღარ არის სწორი
            if ($movie->tmdb_id) {
                $this->forget($owner, $collection, (int) $movie->tmdb_id);
            }

            if ($this->refresh($collection)) {
                $this->notifyMissing($owner, [$collection]);
            }
        } catch (Throwable $e) {
            SourceLog::threw('tmdb', $e, ['step' => 'franchise', 'collection' => $collection]);
        }
    }

    /**
     * ბიბლიოთეკასთან შედარება → თითო დაუმატებელ ნაწილზე ერთი შეტყობინება.
     *
     * @param  list<int>|null  $only  მხოლოდ ეს ფრანჩაიზები (`null` — ყველა, რაც ბიბლიოთეკაშია)
     * @return int რამდენი შეტყობინება გაიგზავნა
     */
    public function notifyMissing(User $user, ?array $only = null): int
    {
        if (! $user->hasModule('movie')) {
            return 0;
        }

        $anchors = $this->anchors($user, $only);

        if ($anchors->isEmpty()) {
            return 0;
        }

        $collections = $anchors->keys()->all();
        $owned = $this->ownedTmdbIds($user);
        $reminders = FranchiseReminder::where('user_id', $user->id)->whereIn('tmdb_collection_id', $collections)->get();
        $mutedFranchises = $reminders->where('tmdb_id', FranchiseReminder::WHOLE)->whereNotNull('muted_at')->pluck('tmdb_collection_id')->flip();
        $known = $reminders->where('tmdb_id', '!=', FranchiseReminder::WHOLE)->keyBy(fn (FranchiseReminder $r) => "{$r->tmdb_collection_id}:{$r->tmdb_id}");

        $sent = 0;

        $parts = FranchisePart::whereIn('tmdb_collection_id', $collections)->orderBy('release_date')->orderBy('id')->get();

        foreach ($parts as $part) {
            $reminder = $known->get("{$part->tmdb_collection_id}:{$part->tmdb_id}");

            if (
                $owned->has($part->tmdb_id)
                || $mutedFranchises->has($part->tmdb_collection_id)
                || $reminder?->muted_at
                || $reminder?->notified_at
            ) {
                continue;
            }

            $this->notifier->send($user, NotificationType::FRANCHISE_PART, [
                'tmdb_id' => $part->tmdb_id,
                'title_en' => $part->title,
                'title_ka' => null,
                'collection_id' => $part->tmdb_collection_id,
                'collection_name' => $part->collection_name,
                'date' => $part->release_date?->format('Y-m-d'),
                'poster' => $part->posterUrl(),
                // ჩემი ნაწილის გვერდი — იქ ფრანჩაიზის ბლოკია, საიდანაც აკლებული ემატება
                'path' => $this->routeBase().'/'.$anchors[$part->tmdb_collection_id],
            ]);

            FranchiseReminder::updateOrCreate(
                ['user_id' => $user->id, 'tmdb_collection_id' => $part->tmdb_collection_id, 'tmdb_id' => $part->tmdb_id],
                ['notified_at' => now()],
            );
            $sent++;
        }

        return $sent;
    }

    /**
     * „აღარ შემახსენო" — ერთ ნაწილზე ან (`$tmdbId = 0`) მთელ ფრანჩაიზზე; `false` — ისევ შემახსენე.
     *
     * ⚠️ გამორთვა ამ ნაწილის / ფრანჩაიზის უკვე მოსულ შეტყობინებებსაც აშორებს — „აღარ
     * შემახსენო" სიაში დარჩენილ შეხსენებასთან ერთად აზრს კარგავდა.
     */
    public function mute(User $user, int $collectionId, int $tmdbId = FranchiseReminder::WHOLE, bool $muted = true): void
    {
        FranchiseReminder::updateOrCreate(
            ['user_id' => $user->id, 'tmdb_collection_id' => $collectionId, 'tmdb_id' => $tmdbId],
            ['muted_at' => $muted ? now() : null],
        );

        if ($muted) {
            $this->forget($user, $collectionId, $tmdbId);
        }
    }

    /** ფრანჩაიზი მთლიანად გაჩუმებულია? */
    public function muted(User $user, int $collectionId): bool
    {
        return FranchiseReminder::where('user_id', $user->id)
            ->where('tmdb_collection_id', $collectionId)
            ->where('tmdb_id', FranchiseReminder::WHOLE)
            ->whereNotNull('muted_at')
            ->exists();
    }

    /**
     * ფრანჩაიზის ნაწილები ყურების რიგით (გამოსვლის თარიღი; უთარიღო ბოლოში).
     *
     * @return Collection<int, FranchisePart>
     */
    public function parts(int $collectionId): Collection
    {
        return FranchisePart::where('tmdb_collection_id', $collectionId)
            ->get()
            ->sortBy(fn (FranchisePart $part) => [$part->release_date === null ? 1 : 0, $part->release_date?->format('Y-m-d') ?? '', $part->tmdb_id])
            ->values();
    }

    /**
     * **რა მაკლია ამ ფრანჩაიზებში** — სიის ფრანჩაიზის ჯგუფის მკრთალი ბარათები.
     * გაჩუმებული ფრანჩაიზი და გაჩუმებული ნაწილი სიაშიც არ ჩანს.
     *
     * @param  list<int>  $collections
     * @return Collection<int, Collection<int, FranchisePart>> ფრანჩაიზის id → დაუმატებელი ნაწილები
     */
    public function gaps(User $user, array $collections): Collection
    {
        if ($collections === []) {
            return collect();
        }

        $owned = $this->ownedTmdbIds($user);
        $muted = FranchiseReminder::where('user_id', $user->id)
            ->whereIn('tmdb_collection_id', $collections)
            ->whereNotNull('muted_at')
            ->get()
            ->mapWithKeys(fn (FranchiseReminder $r) => ["{$r->tmdb_collection_id}:{$r->tmdb_id}" => true]);

        return FranchisePart::whereIn('tmdb_collection_id', $collections)
            ->get()
            ->reject(fn (FranchisePart $part) => $owned->has($part->tmdb_id)
                || $muted->has("{$part->tmdb_collection_id}:".FranchiseReminder::WHOLE)
                || $muted->has("{$part->tmdb_collection_id}:{$part->tmdb_id}"))
            ->groupBy('tmdb_collection_id');
    }

    /**
     * ჩემი ფილმების TMDB id-ები — ურნისა და ჩაკეტილის ჩათვლით.
     *
     * @return Collection<int, int> tmdb_id → ჩანაწერის id
     */
    public function ownedTmdbIds(User $user): Collection
    {
        return Movie::withoutGlobalScopes(['owner', 'record_lock', 'trash'])
            ->where('user_id', $user->id)
            ->whereNotNull('tmdb_id')
            ->toBase()
            ->pluck('id', 'tmdb_id');
    }

    /**
     * ფრანჩაიზი → ჩემი (ჩაუკეტავი, ურნის გარეთ მყოფი) ნაწილი, რომელზეც შეტყობინება მიდის.
     *
     * @param  list<int>|null  $only
     * @return Collection<int, int>
     */
    private function anchors(User $user, ?array $only): Collection
    {
        return Movie::withoutGlobalScope('owner')
            ->withoutLockedBy($user->id)
            ->where('user_id', $user->id)
            ->whereNotNull('tmdb_collection_id')
            ->when($only !== null, fn ($q) => $q->whereIn('tmdb_collection_id', $only))
            ->orderBy('id')
            ->toBase()
            ->pluck('id', 'tmdb_collection_id');
    }

    /** ამ ნაწილის (ან მთელი ფრანჩაიზის) „აკლია" შეტყობინებების მოცილება */
    private function forget(User $user, int $collectionId, int $tmdbId): void
    {
        $user->notifications()
            ->where('type', NotificationType::FRANCHISE_PART)
            ->get()
            ->filter(fn ($n) => (int) ($n->data['collection_id'] ?? 0) === $collectionId
                && ($tmdbId === FranchiseReminder::WHOLE || (int) ($n->data['tmdb_id'] ?? 0) === $tmdbId))
            ->each->delete();
    }

    private function routeBase(): string
    {
        return $this->routeBase ??= rtrim((string) Module::where('key', 'movie')->value('route_base'), '/');
    }
}
