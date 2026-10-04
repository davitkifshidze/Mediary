<?php

namespace App\Support;

use App\Models\Concerns\HidesLockedRecords;
use App\Models\RecordLock;
use Illuminate\Contracts\Session\Session;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use WeakMap;

/**
 * **ჩანაწერის ლოკი — „ეს ჩანს თუ არა" ერთ ადგილას (Tasks §33.7 ← §35.4).**
 *
 * `AlbumLock`-ის განზოგადება: პაროლი `record_locks`-ის რიგშია (ჩანაწერის
 * morph-ალიასით), გახსნა — **სერვერის სესიაში**, ტიპების მიხედვით
 * (`['personal' => [3, 7], 'personal_album' => [12]]`). ⚠️ კლიენტს ხელში
 * არაფერი რჩება (ტოკენი, ქუქი) — გასვლისას სესიასთან ერთად ყველაფერი ისევ
 * იკეტება (`AlbumLock`-ის docblock: CSS-ის blur ლოკი არ არის, ლოკი სერვერია).
 *
 * ⚠️ **„ჩაკეტილი" და „დამალული" ორი სხვა კითხვაა.** ჩაკეტილი — პაროლი ადევს;
 * დამალული — ჩაკეტილია **და** ამ სესიაში არ გახსნილა. სიები, ძებნა და ჯამები
 * მხოლოდ დამალულს მალავს, საჯარო პროფილი კი — **ყველა ჩაკეტილს**, სესიის
 * მიუხედავად (`exclude(…, session: false)`): მფლობელის გახსნილობა უცხოსთვის
 * არაფერს ხსნის.
 *
 * ⚠️ **გაფილტვრა SQL-ის `not exists`-ია და არა წინასწარ წაკითხული id-ები**
 * (`exclude()`): scope ყოველ `PersonalMedia` query-ზე ირთვება, დეშბორდი კი
 * ყველა მოდულს **ერთ** query-ში ითვლის (Tasks PERF-05) — ლოკების ცალკე `select`
 * მას ორი query-თ გაზრდიდა. სესიის გახსნილები (PHP-ში ცნობილი) `not in`-ად ჯდება.
 *
 * ⚠️ **მემო მოთხოვნისაა** (`WeakMap`, გასაღები — `Request`; CLAUDE.md-ის
 * წესი) — რესურსის ველები (`state()`) და ურნის ბოქლომი სიაში ერთხელ კითხულობს
 * ლოკებს. სტატიკური მასივი წინა ტესტის (და Octane-ზე წინა მოთხოვნის) ლოკებს
 * შემდეგზე გადაიტანდა. დადება/მოხსნა მემოს თვითონ ასუფთავებს (`RecordLock::booted()`).
 */
final class RecordLocks
{
    /** სესიის გასაღები — `type => list<id>` */
    public const SESSION_KEY = 'record_locks.unlocked';

    /** @var WeakMap<object, array<string, array<int, RecordLock>>>|null */
    private static ?WeakMap $memo = null;

    public static function flush(): void
    {
        self::$memo = null;
    }

    /**
     * ამ მფლობელის ლოკები ერთ ტიპზე — `lockable_id => RecordLock`.
     *
     * ⚠️ `owner` scope იხსნება და მფლობელი ცხადად იწერება — საჯარო პროფილზე
     * მნახველი სხვაა (`PublicProfileService`-ის ორმხრივი მიზეზი).
     *
     * @return array<int, RecordLock>
     */
    public static function locksFor(string $type, int $ownerId): array
    {
        self::$memo ??= new WeakMap;
        $scope = app()->bound('request') ? app('request') : app();
        $bag = self::$memo[$scope] ?? [];
        $key = $type.':'.$ownerId;

        if (! array_key_exists($key, $bag)) {
            $bag[$key] = RecordLock::query()
                ->withoutGlobalScope('owner')
                ->where('user_id', $ownerId)
                ->where('lockable_type', $type)
                ->get()
                ->keyBy(fn (RecordLock $lock) => (int) $lock->lockable_id)
                ->all();

            self::$memo[$scope] = $bag;
        }

        return $bag[$key];
    }

    /**
     * ამ ტიპის **დამალული** id-ები მიმდინარე მომხმარებლისთვის.
     *
     * ⚠️ `Auth::id()`-ის გარეშე (CLI, რიგი) სია ცარიელია — ბრძანება ყველაფერს
     * ხედავს, ზუსტად ისე, როგორც `owner` scope-ია გამორთული.
     *
     * @return list<int>
     */
    public static function hiddenIds(string $type): array
    {
        $userId = Auth::id();

        return $userId ? array_values(array_diff(self::lockedIdsFor($type, (int) $userId), self::unlockedIds($type))) : [];
    }

    /**
     * ამ მფლობელის **ყველა** ჩაკეტილი id — სესიის მიუხედავად (საჯარო).
     *
     * @return list<int>
     */
    public static function lockedIdsFor(string $type, int $ownerId): array
    {
        return array_keys(self::locksFor($type, $ownerId));
    }

    public static function lockOf(Model $record): ?RecordLock
    {
        $owner = self::ownerOf($record);

        return $owner ? (self::locksFor($record->getMorphClass(), $owner)[(int) $record->getKey()] ?? null) : null;
    }

    /**
     * **ვისია ლოკი ამ ჩანაწერზე (Tasks §35.4).**
     *
     * ჩემი ჩანაწერი (ფილმი, ალბომი, ადამიანი) — მისი მფლობელის (`user_id`): საჯარო
     * პროფილზე უცხოც მფლობელის პაროლს კითხულობს. ⚠️ **გლობალური ჩანაწერი**
     * (მსახიობი — `cast_members`, `user_id`-ის გარეშე) კი **მნახველისაა**: ჩემი
     * პაროლი ჩემზე მოქმედებს, სხვას მასზე თავისი შეიძლება ჰქონდეს
     * (`record_locks`-ის უნიკალურობაც მფლობელზეა).
     */
    public static function ownerOf(Model $record): ?int
    {
        if (array_key_exists('user_id', $record->getAttributes())) {
            return $record->getAttribute('user_id') !== null ? (int) $record->getAttribute('user_id') : null;
        }

        return Auth::id() ? (int) Auth::id() : null;
    }

    public static function isLocked(Model $record): bool
    {
        return self::lockOf($record) !== null;
    }

    /** ჩაკეტილი არაა, ან ამ სესიაში გაიხსნა */
    public static function isUnlocked(Model $record): bool
    {
        return ! self::isLocked($record)
            || in_array((int) $record->getKey(), self::unlockedIds($record->getMorphClass()), true);
    }

    /** ჩაკეტილია და ამ სესიაში არ გახსნილა — შიგთავსი არ გამოდის */
    public static function isHidden(Model $record): bool
    {
        return ! self::isUnlocked($record);
    }

    /**
     * რესურსის ველები — **მხოლოდ მფლობელის პასუხში**.
     *
     * ⚠️ hash არასდროს; ⚠️ ცდები და ბლოკის ვადა საჯარო პასუხში თავდამსხმელს
     * ეტყოდა, რამდენი ცდა დარჩა (`GalleryAlbumController::row()`, FEAT-04) —
     * საჯარო პროფილზე ჩაკეტილი ისედაც არ ჩანს.
     *
     * @return array{locked: bool, unlocked: bool, lock_hint: ?string, failed_unlocks: int, unlock_blocked_until: ?string}
     */
    public static function state(Model $record): array
    {
        $lock = self::lockOf($record);

        return [
            'locked' => $lock !== null,
            'unlocked' => self::isUnlocked($record),
            'lock_hint' => $lock?->hint,
            'failed_unlocks' => (int) ($lock?->failed_unlocks ?? 0),
            'unlock_blocked_until' => $lock?->unlockBlocked() ? $lock->unlock_blocked_until?->toIso8601String() : null,
        ];
    }

    /**
     * ჩანაწერი „ყველგან იმალება" (`HidesLockedRecords` — ფილმი, სერიალი, ანიმე)?
     *
     * @param  Model|class-string<Model>  $record
     */
    public static function hides(Model|string $record): bool
    {
        return in_array(HidesLockedRecords::class, class_uses_recursive($record), true);
    }

    /** `hides()` და ამ სესიაში დამალული — ბოქლომიანი ბარათი, ცვლილება 423 */
    public static function hiddenRecord(Model $record): bool
    {
        return self::hides($record) && self::isHidden($record);
    }

    /**
     * **ლოკის ველები მხოლოდ მფლობელს** (Tasks §35.5): იგივე რესურსი საჯარო
     * პროფილზეც და გაზიარების ბმულზეც ხატავს ჩანაწერს — იქ „ჩაკეტილია/არა"
     * თვითონ იქნებოდა გაჟონვა (საჯარო ისედაც ჩაკეტილს არ აჩვენებს).
     *
     * @return array<string, mixed>
     */
    public static function ownerState(Model $record): array
    {
        $owner = $record->getAttribute('user_id');

        return $owner !== null && (int) $owner === (int) Auth::id() ? self::state($record) : [];
    }

    /**
     * **polymorphic წყვილი ჩაკეტილ ჩანაწერზე არ უნდა მიუთითებდეს** — გალერეის
     * ფოტო (`imageable_*`), ნახვების ჟურნალი (`watchable_*`).
     *
     * ⚠️ ტიპი სვეტიდან მოდის და არა ფიქსირებულია (ერთ ცხრილში ფილმიც, მსახიობიც),
     * ამიტომ სესიის გახსნილები თითო ტიპზე ცალკე „ან"-ით იჭრება.
     * `$session = false` — **ყველა** ჩაკეტილი (სტატისტიკა, საჯარო).
     *
     * @template T of Builder|QueryBuilder
     *
     * @param  T  $query
     * @return T
     */
    public static function excludeMorph(Builder|QueryBuilder $query, string $typeColumn, string $idColumn, bool $session = true): Builder|QueryBuilder
    {
        if ($session && ! Auth::id()) {
            return $query;
        }

        $open = [];
        if ($session) {
            foreach ((array) (self::session()?->get(self::SESSION_KEY, []) ?? []) as $type => $ids) {
                $open[(string) $type] = array_values(array_map('intval', (array) $ids));
            }
        }

        return $query->whereNotExists(fn (QueryBuilder $sub) => $sub
            ->selectRaw('1')
            ->from('record_locks')
            ->whereColumn('record_locks.lockable_type', $typeColumn)
            ->whereColumn('record_locks.lockable_id', $idColumn)
            ->when($session, fn (QueryBuilder $s) => $s->where('record_locks.user_id', Auth::id()))
            ->when($open !== [], fn (QueryBuilder $s) => $s->where(function (QueryBuilder $w) use ($open) {
                foreach ($open as $type => $ids) {
                    $w->where(fn (QueryBuilder $one) => $one
                        ->where('record_locks.lockable_type', '!=', $type)
                        ->orWhereNotIn('record_locks.lockable_id', $ids ?: [0]));
                }
            })));
    }

    /**
     * **დამალული ჩანაწერი ცვლილებას არ იღებს — 423 `record_locked`.**
     *
     * ⚠️ წაშლა ლოკის მთავარი კარია (`GalleryAlbumController::destroy()`-ის
     * წესი): „შიგთავსი დამიტოვე" დამალულ ფოტოებს უჯგუფოდ გააშიშვლებდა. ხოლო
     * ატვირთვა/გადატანა დამალულში ფოტოს უკვალოდ „გააქრობდა" — ჯერ გახსნა.
     */
    public static function ensureOpen(?Model $record): void
    {
        abort_if($record !== null && self::isHidden($record), 423, 'record_locked');
    }

    /**
     * query დამალული ჩანაწერების გარეშე — ძებნა, დამატებითი ველები.
     *
     * @template TModel of Model
     *
     * @param  Builder<TModel>  $query
     * @return Builder<TModel>
     */
    public static function exceptHidden(Builder $query): Builder
    {
        $model = $query->getModel();

        return self::exclude($query, $model->getMorphClass(), $model->qualifyColumn($model->getKeyName()));
    }

    /**
     * **`$column` ჩაკეტილ `$type`-ზე არ უნდა მიუთითებდეს** — ერთი `not exists`.
     *
     * `$session = true` — მფლობელის ხედი: ამ სესიაში გახსნილი ჩანს; ⚠️ `Auth::id()`-ის
     * გარეშე (CLI, რიგი) არაფერი იჭრება — ბრძანება ყველაფერს ხედავს (`owner`-ის
     * წესი). `$session = false` — საჯარო: **ყველა** ჩაკეტილი იჭრება.
     *
     * ⚠️ `NULL` სვეტი (უადამიანო ფოტო) არაფერს ემთხვევა, ე.ი. ჩანს — ცალკე
     * `whereNull` არ სჭირდება. ⚠️ **მფლობელის ხედში მხოლოდ მნახველის ლოკები
     * ითვლება** (`record_locks.user_id`) — `AlbumLock::hiddenIds()`-ის წესი:
     * ადმინის ბრძანება სხვის ჩანაწერზე სხვის პაროლს არ „ემორჩილება".
     *
     * @template T of Builder|QueryBuilder
     *
     * @param  T  $query
     * @return T
     */
    public static function exclude(Builder|QueryBuilder $query, string $type, string $column, bool $session = true): Builder|QueryBuilder
    {
        if ($session && ! Auth::id()) {
            return $query;
        }

        $open = $session ? self::unlockedIds($type) : [];

        return $query->whereNotExists(fn (QueryBuilder $sub) => $sub
            ->selectRaw('1')
            ->from('record_locks')
            ->where('record_locks.lockable_type', $type)
            ->whereColumn('record_locks.lockable_id', $column)
            ->when($session, fn (QueryBuilder $s) => $s->where('record_locks.user_id', Auth::id()))
            ->when($open !== [], fn (QueryBuilder $s) => $s->whereNotIn('record_locks.lockable_id', $open)));
    }

    /**
     * სესია საერთოდ არსებობს? — ⚠️ მის გარეშე `unlock()` ჩუმად ვერაფერს
     * ჩაწერდა და სწორი პაროლი 200-ს დააბრუნებდა (`AlbumLock::hasSession()`,
     * Tasks BUG-02): კონტროლერი მაშინ 409 `session_required`-ს აბრუნებს.
     */
    public static function hasSession(): bool
    {
        return self::session() !== null;
    }

    /** @return list<int> */
    public static function unlockedIds(string $type): array
    {
        $session = self::session();

        if (! $session) {
            return [];
        }

        $all = (array) $session->get(self::SESSION_KEY, []);

        return array_values(array_map('intval', (array) ($all[$type] ?? [])));
    }

    /** პაროლი სწორია — ეს ჩანაწერი ამ სესიაში ღიაა */
    public static function unlock(Model $record): void
    {
        self::remember($record, true);
    }

    /** „ისევ ჩაკეტე" — სესიიდან ამოვარდნა, პაროლი ადგილზე რჩება */
    public static function lock(Model $record): void
    {
        self::remember($record, false);
    }

    /** ამ ტიპის **ყველა** გახსნილი ისევ იკეტება (გალერეის „ყველა ალბომის ჩაკეტვა") */
    public static function lockAll(string $type): void
    {
        $session = self::session();

        if (! $session) {
            return;
        }

        $all = (array) $session->get(self::SESSION_KEY, []);
        unset($all[$type]);
        $session->put(self::SESSION_KEY, $all);
    }

    private static function remember(Model $record, bool $open): void
    {
        $session = self::session();

        if (! $session) {
            return;
        }

        $type = $record->getMorphClass();
        $id = (int) $record->getKey();
        $all = (array) $session->get(self::SESSION_KEY, []);
        $ids = array_values(array_diff(self::unlockedIds($type), [$id]));

        if ($open) {
            $ids[] = $id;
        }

        $all[$type] = $ids;
        $session->put(self::SESSION_KEY, array_filter($all));
    }

    /**
     * სესია — მხოლოდ მაშინ, როცა ის მართლა არსებობს (`AlbumLock::session()`):
     * `/api`-ზე არა-stateful კლიენტს სესია არ აქვს და დაუცველი `session()` 500-ია.
     */
    private static function session(): ?Session
    {
        $request = app()->bound('request') ? app(Request::class) : null;

        return $request && $request->hasSession() ? $request->session() : null;
    }
}
