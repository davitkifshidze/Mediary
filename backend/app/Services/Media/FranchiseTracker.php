<?php

namespace App\Services\Media;

use App\Models\FranchisePart;
use App\Models\FranchiseReminder;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Services\Notify\Notifier;
use App\Services\Tmdb\TmdbClient;
use App\Support\AppTime;
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
 *    შეტყობინება, სამუდამოდ ერთი (`franchise_reminders.notified_at`); ფრანჩაიზის
 *    პირველ შემოწმებაზე რამდენიმე ნაკლული ერთ ჯამურ შეტყობინებად მოდის;
 *  · `gaps()` / `parts()` / `library()` — ფილმის გვერდის ბლოკი, სიის ფრანჩაიზის ჯგუფი
 *    და „ფრანჩაიზების" გვერდი იმავე ცხრილს კითხულობს, TMDB-ს აღარ.
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

                // ბოლო გამოსული ნაკლულიც დაემატა — „რამდენიმე ნაწილი აკლია" აღარ არის სწორი
                $today = AppTime::now()->format('Y-m-d');
                $left = $this->gaps($owner, [$collection])->flatten(1)
                    ->filter(fn (FranchisePart $part) => $part->release_date !== null && $part->release_date->format('Y-m-d') <= $today);

                if ($left->isEmpty()) {
                    $this->forget($owner, $collection, FranchiseReminder::WHOLE);
                }
            }
        } catch (Throwable $e) {
            SourceLog::threw('tmdb', $e, ['step' => 'franchise', 'collection' => $collection]);
        }
    }

    /**
     * ბიბლიოთეკასთან შედარება → შეტყობინება დაუმატებელ ნაწილებზე; თითო ნაწილზე ერთხელ.
     *
     * ⚠️ **ფრანჩაიზის პირველ შემოწმებაზე რამდენიმე ნაკლული ერთი შეტყობინებაა**
     * („X-ს 3 ნაწილი აკლია"): დიდ ბიბლიოთეკაზე პირველი გაშვება ასობით რიგს
     * გამოგზავნიდა და ზარს დაახშობდა — დეტალებს „ფრანჩაიზების" გვერდი აჩვენებს.
     * ჯამში მოხვედრილი ნაწილი ცალკე აღარ იგზავნება; შემდეგ გაჩენილზე — თითოზე ერთი.
     * ⚠️ **გამოუსვლელ (ან ჯერ უთარიღო) ნაწილზე შეტყობინება გამოსვლის დღეს მოდის** —
     * მანამდე ის მხოლოდ გვერდზე და ფილმის ბლოკში ჩანს.
     *
     * @param  list<int>|null  $only  მხოლოდ ეს ფრანჩაიზები (`null` — ყველა, რაც ბიბლიოთეკაშია)
     * @return int რამდენი შეტყობინება გაიგზავნა
     */
    public function notifyMissing(User $user, ?array $only = null): int
    {
        if (! $user->hasModule('movie')) {
            return 0;
        }

        $collections = $this->anchors($user, $only)->keys()->all();

        if ($collections === []) {
            return 0;
        }

        $owned = $this->ownedTmdbIds($user);
        $reminders = FranchiseReminder::where('user_id', $user->id)->whereIn('tmdb_collection_id', $collections)->get();
        $mutedFranchises = $reminders->where('tmdb_id', FranchiseReminder::WHOLE)->whereNotNull('muted_at')->pluck('tmdb_collection_id')->flip();
        $known = $reminders->where('tmdb_id', '!=', FranchiseReminder::WHOLE)->keyBy(fn (FranchiseReminder $r) => "{$r->tmdb_collection_id}:{$r->tmdb_id}");
        // ფრანჩაიზები, რომლებზეც ამ ანგარიშს უკვე რამე ეთქვა — მათზე ჯამური აღარ მოდის
        $told = $known->whereNotNull('notified_at')->pluck('tmdb_collection_id')->flip();
        $today = AppTime::now()->format('Y-m-d');

        /** @var array<int, list<FranchisePart>> $due ფრანჩაიზი → გამოსული, დაუმატებელი, ჯერ უთქმელი ნაწილები */
        $due = [];

        foreach (FranchisePart::whereIn('tmdb_collection_id', $collections)->orderBy('release_date')->orderBy('id')->get() as $part) {
            $reminder = $known->get("{$part->tmdb_collection_id}:{$part->tmdb_id}");
            $date = $part->release_date?->format('Y-m-d');

            if (
                $owned->has($part->tmdb_id)
                || $mutedFranchises->has($part->tmdb_collection_id)
                || $reminder?->muted_at
                || $reminder?->notified_at
                || $date === null
                || $date > $today
            ) {
                continue;
            }

            $due[$part->tmdb_collection_id][] = $part;
        }

        $sent = 0;

        foreach ($due as $collection => $parts) {
            // „ფრანჩაიზების" გვერდი ამ ფრანჩაიზზე — იქიდან ემატება ნაკლული
            $path = $this->routeBase().'/franchises?open='.$collection;

            if (count($parts) > 1 && ! $told->has($collection)) {
                $this->notifier->send($user, NotificationType::FRANCHISE_GAPS, [
                    'collection_id' => $collection,
                    'collection_name' => $parts[0]->collection_name,
                    'count' => count($parts),
                    'path' => $path,
                ]);
                $sent++;
            } else {
                foreach ($parts as $part) {
                    $date = $part->release_date?->format('Y-m-d');

                    $this->notifier->send($user, NotificationType::FRANCHISE_PART, [
                        'tmdb_id' => $part->tmdb_id,
                        'title_en' => $part->title,
                        'title_ka' => null,
                        'collection_id' => $collection,
                        'collection_name' => $part->collection_name,
                        'date' => $date,
                        // დღეს გამოვიდა — შეტყობინება ამას ამბობს
                        'out_today' => $date === $today,
                        'poster' => $part->posterUrl(),
                        'path' => $path,
                    ]);
                    $sent++;
                }
            }

            foreach ($parts as $part) {
                FranchiseReminder::updateOrCreate(
                    ['user_id' => $user->id, 'tmdb_collection_id' => $collection, 'tmdb_id' => $part->tmdb_id],
                    ['notified_at' => now()],
                );
            }
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
        return $this->inWatchOrder(FranchisePart::where('tmdb_collection_id', $collectionId)->get());
    }

    /**
     * **ჩემი ფრანჩაიზები** — „ფრანჩაიზების" გვერდის სია: ყველა ფრანჩაიზი, რომლის ნაწილიც
     * ბიბლიოთეკაში მაქვს, თავისი ნაწილებით და მდგომარეობით:
     *  · `open` — ნაწილი აკლია და შეხსენება ჩართულია;
     *  · `muted` — აკლია, მაგრამ მთელი ფრანჩაიზი ან ყველა ნაკლული ნაწილი გაჩუმებულია;
     *  · `complete` — ყველა ნაწილი მაქვს.
     *
     * ⚠️ **ურნაში მყოფი ან ჩაკეტილი ასლი გვერდზე საერთოდ არ ჩანს**: „მაქვს"-ად ვერ
     * გამოჩნდება (ბმული ჩაკეტილს გაამხელდა, ურნის ჩანაწერი კი არ იხსნება), „აკლია"-დ —
     * მით უმეტეს. ასეთი ნაწილი არც ერთ რიცხვში არ ითვლება. ფრანჩაიზი, რომლის ხილული
     * ნაწილი არ მაქვს, სიაში არ არის (`anchors()`).
     *
     * @return Collection<int, array<string, mixed>> სახელით დალაგებული
     */
    public function library(User $user): Collection
    {
        $collections = $user->hasModule('movie') ? $this->anchors($user, null)->keys()->all() : [];

        if ($collections === []) {
            return collect();
        }

        $visible = Movie::withoutGlobalScope('owner')
            ->withoutLockedBy($user->id)
            ->where('user_id', $user->id)
            ->whereIn('tmdb_collection_id', $collections)
            ->whereNotNull('tmdb_id')
            ->toBase()
            ->pluck('id', 'tmdb_id');
        $owned = $this->ownedTmdbIds($user);
        $muted = FranchiseReminder::where('user_id', $user->id)
            ->whereIn('tmdb_collection_id', $collections)
            ->whereNotNull('muted_at')
            ->get()
            ->mapWithKeys(fn (FranchiseReminder $r) => ["{$r->tmdb_collection_id}:{$r->tmdb_id}" => true]);
        $today = AppTime::now()->format('Y-m-d');

        return FranchisePart::whereIn('tmdb_collection_id', $collections)
            ->get()
            ->groupBy('tmdb_collection_id')
            ->map(function (Collection $parts, int|string $collection) use ($visible, $owned, $muted, $today) {
                $whole = $muted->has("{$collection}:".FranchiseReminder::WHOLE);

                $rows = $this->inWatchOrder($parts->reject(
                    fn (FranchisePart $part) => $owned->has($part->tmdb_id) && ! $visible->has($part->tmdb_id),
                ))->map(function (FranchisePart $part) use ($collection, $visible, $muted, $today) {
                    $date = $part->release_date?->format('Y-m-d');

                    return [
                        'tmdb_id' => $part->tmdb_id,
                        'title' => $part->title,
                        'year' => $part->year(),
                        'date' => $date,
                        'released' => $date !== null && $date <= $today,
                        'rating' => $part->rating !== null ? (float) $part->rating : null,
                        'poster' => $part->posterUrl(),
                        'owned' => $visible->has($part->tmdb_id),
                        'movie_id' => $visible->get($part->tmdb_id),
                        'muted' => $muted->has("{$collection}:{$part->tmdb_id}"),
                    ];
                });

                $missing = $rows->where('owned', false);
                $open = $missing->where('muted', false)->count();

                return [
                    'collection_id' => (int) $collection,
                    'name' => $parts->first()->collection_name,
                    'muted' => $whole,
                    'state' => $missing->isEmpty() ? 'complete' : ($whole || $open === 0 ? 'muted' : 'open'),
                    'owned' => $rows->where('owned', true)->count(),
                    'total' => $rows->count(),
                    // რამდენი აკლია გაჩუმებულების გარეშე — ამდენს ამატებს „ყველა ნაკლულის დამატება"
                    'missing' => $open,
                    'parts' => $rows->all(),
                ];
            })
            ->filter(fn (array $franchise) => $franchise['owned'] > 0)
            ->sortBy(fn (array $franchise) => mb_strtolower((string) $franchise['name']))
            ->values();
    }

    /**
     * ყურების რიგი: გამოსვლის თარიღი; უთარიღო ბოლოში.
     *
     * @param  Collection<int, FranchisePart>  $parts
     * @return Collection<int, FranchisePart>
     */
    private function inWatchOrder(Collection $parts): Collection
    {
        return $parts
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

    /**
     * ამ ნაწილის (ან მთელი ფრანჩაიზის) „აკლია" შეტყობინებების მოცილება; მთელ
     * ფრანჩაიზთან ერთად მისი ჯამური შეტყობინებაც ქრება.
     */
    private function forget(User $user, int $collectionId, int $tmdbId): void
    {
        $user->notifications()
            ->whereIn('type', [NotificationType::FRANCHISE_PART, NotificationType::FRANCHISE_GAPS])
            ->get()
            ->filter(function ($n) use ($collectionId, $tmdbId) {
                if ((int) ($n->data['collection_id'] ?? 0) !== $collectionId) {
                    return false;
                }

                return $tmdbId === FranchiseReminder::WHOLE
                    || ($n->type === NotificationType::FRANCHISE_PART && (int) ($n->data['tmdb_id'] ?? 0) === $tmdbId);
            })
            ->each->delete();
    }

    private function routeBase(): string
    {
        return $this->routeBase ??= rtrim((string) Module::where('key', 'movie')->value('route_base'), '/');
    }
}
