<?php

namespace App\Support;

use App\Models\AuditLog;
use App\Models\AuditRule;
use App\Models\Module;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use WeakMap;

/**
 * **ჟურნალის წესები — რა იწერება, ვისზე და სად.**
 *
 * თითო სახეობა ერთ ან რამდენიმე `AuditLog::ACTION_*`-ს მართავს (`cast` —
 * მსახიობის ოთხივეს). წესი ოთხ დონეზე იწერება და **უფრო კონკრეტული იმარჯვებს**:
 *
 *   მომხმარებელი + მოდული → მომხმარებელი → მოდული → გლობალური
 *
 * თითო დონეზე სამი მდგომარეობაა: ჩართული, გამორთული, ან რიგი არ არსებობს
 * („როგორც ზემოთ"). არც ერთ დონეზე რიგის გარეშე სახეობა **იწერება** — ახალი
 * ტიპი ასე თავისით ჩართული იბადება. წესი „გამორთული ყოველთვის იმარჯვებს" აქ
 * განზრახ არ არის: მასში „ყველგან გამორთული, მაგრამ ფილმებში მაინც ეწერებოდეს"
 * ვერ გამოდის.
 *
 * ⚠️ **გამორთვა შეიძლება ვადიანი იყოს** (`expires_at`): ვადაგასული წესი აღარ
 * მოქმედებს, ე.ი. ჩაწერა თავისით ბრუნდება ზედა დონის მდგომარეობაზე — „დროებით"
 * გამორთული თვეობით გამორთული არ რჩება.
 *
 * ⚠️ **ჩატის წაშლა დაცულია** (`PROTECTED`) — ვერც ერთი დონე ვერ გამორთავს:
 * აღდგენის აღრიცხვა მხოლოდ ამ რიგშია.
 *
 * ⚠️ **ყველა წესი ერთი query-ით იკითხება მოთხოვნაზე** და ქეშის გასაღები
 * მიმდინარე `Request`-ია (`AppSettings`-ის წესი): `AuditLogger` ყოველი ჩაწერის
 * წინ ეკითხება და ბაზას მეორედ აღარ აწუხებს; სტატიკური ველი კი ტესტებსა და
 * Octane-ზე მომდევნო მოთხოვნაში გადავიდოდა.
 */
final class AuditRules
{
    /** სახეობა → რომელ მოქმედებებს მართავს; რიგი ინტერფეისის რიგია */
    public const KINDS = [
        'login' => [AuditLog::ACTION_LOGIN],
        'login_failed' => [AuditLog::ACTION_LOGIN_FAILED],
        'logout' => [AuditLog::ACTION_LOGOUT],
        'register' => [AuditLog::ACTION_REGISTER],
        'visit' => [AuditLog::ACTION_VISIT],
        'refresh' => [AuditLog::ACTION_REFRESH],
        'open' => [AuditLog::ACTION_OPEN],
        'profile_visit' => [AuditLog::ACTION_PROFILE_VISIT],
        'click' => [AuditLog::ACTION_CLICK],
        'create' => [AuditLog::ACTION_CREATE],
        'update' => [AuditLog::ACTION_UPDATE],
        'delete' => [AuditLog::ACTION_DELETE],
        'restore' => [AuditLog::ACTION_RESTORE],
        'export' => [AuditLog::ACTION_EXPORT],
        'import' => [AuditLog::ACTION_IMPORT],
        'translate' => [AuditLog::ACTION_TRANSLATE],
        'cast' => [AuditLog::ACTION_CAST_ATTACH, AuditLog::ACTION_CAST_DETACH, AuditLog::ACTION_CAST_UPDATE, AuditLog::ACTION_CAST_SYNC],
        'chat_delete' => [AuditLog::ACTION_CHAT_DELETE],
    ];

    /** ვერ გამოირთვება */
    public const PROTECTED = ['chat_delete'];

    /** რას აგზავნის SPA თვითონ — `/auth/me` ეუბნება, რომელი და სად არის ჩართული */
    public const CLIENT_KINDS = ['visit', 'refresh', 'open', 'click'];

    /**
     * სახეობები, რომლებსაც მოდული არ აქვს — ანგარიშის ფაქტებია (შესვლა, გასვლა,
     * რეგისტრაცია, სხვის პროფილში შესვლა). მათზე მხოლოდ გლობალური და მომხმარებლის
     * დონე მოქმედებს, მოდულის უჯრა კი არ არსებობს.
     */
    public const MODULELESS = ['login', 'login_failed', 'logout', 'register', 'profile_visit'];

    public const STATES = ['on', 'off', 'inherit'];

    /** დროებითი გამორთვის ვადები: 1 საათი · დღის ბოლომდე · 7 დღე; ვადის გარეშე — ხელით ჩართვამდე */
    public const UNTIL = ['hour', 'day', 'week'];

    /** ერთ შენახვაში მაქსიმუმ რამდენი უჯრა იცვლება */
    public const BATCH_MAX = 500;

    /** წესის სუბიექტის ტიპი ჟურნალში — `AuditRegistry::typeFor(new AuditRule)` */
    public const SUBJECT = 'audit_rule';

    /** @var WeakMap<object, array<string, array<string, array<int, bool>>>>|null */
    private static ?WeakMap $memo = null;

    private static bool $tableExists = false;

    /** CLI-ში `request` თუ არ არის მიბმული — ერთი საერთო გასაღები */
    private static ?object $fallbackScope = null;

    /**
     * ეს მოქმედება ახლა იწერება — ამ მოდულში, ამ ანგარიშზე?
     * (უცნობი მოქმედება — კი: ახალი ტიპი ჩუმად არ უნდა დაიკარგოს.)
     */
    public static function enabled(string $action, ?string $module = null, int|string|null $userId = null): bool
    {
        $kind = self::kindOf($action);

        return $kind === null || self::decide($kind, $module, $userId);
    }

    /** იგივე პასუხი სახეობის გასაღებით — ოთხი დონე, უფრო კონკრეტული იმარჯვებს */
    public static function decide(string $kind, ?string $module = null, int|string|null $userId = null): bool
    {
        if (in_array($kind, self::PROTECTED, true)) {
            return true;
        }

        $rules = self::index()[$kind] ?? [];

        if ($rules === []) {
            return true;
        }

        $module = in_array($kind, self::MODULELESS, true) ? '' : (string) $module;
        $user = (int) $userId;

        return $rules[$module][$user]
            ?? $rules[''][$user]
            ?? $rules[$module][0]
            ?? $rules[''][0]
            ?? true;
    }

    /**
     * SPA-ს სახეობები, რომლებიც ამ ანგარიშზე ჩართულია მოდულის გარეთ
     * (`/auth/me` → `audit_kinds`).
     *
     * @return list<string>
     */
    public static function clientKinds(int|string|null $userId): array
    {
        return array_values(array_filter(
            self::CLIENT_KINDS,
            fn (string $kind) => self::decide($kind, null, $userId),
        ));
    }

    /**
     * **სად განსხვავდება პასუხი `clientKinds()`-ისგან** — სახეობა → SPA-ს
     * მისამართის პირველი სეგმენტი → იწერება თუ არა (`/auth/me` → `audit_paths`).
     *
     * ⚠️ გასაღები **მისამართია და არა მოდულის key**: დაჭერისა და გვერდის
     * მოდულს სერვერი მისამართიდან ადგენს (`AuditLogger::moduleForPath()`), ამიტომ
     * SPA-ს იგივე რუკა მეორედ არ სჭირდება — ის მხოლოდ სეგმენტს ეძებს. პირადი
     * მოდული ორსეგმენტიანია (`c/{key}`) და მხოლოდ საკუთარი ხვდება სიაში: სხვისი
     * მოდულის გვერდი ამ ანგარიშისთვის მოდულის გარეშე იწერება.
     *
     * @return array<string, array<string, bool>>
     */
    public static function clientPaths(int|string|null $userId): array
    {
        $index = self::index();
        $segments = null;
        $paths = [];

        foreach (self::CLIENT_KINDS as $kind) {
            $default = self::decide($kind, null, $userId);

            foreach (array_keys($index[$kind] ?? []) as $module) {
                $module = (string) $module;

                if ($module === '' || self::decide($kind, $module, $userId) === $default) {
                    continue;
                }

                $segments ??= self::segments((int) $userId);

                foreach ($segments[$module] ?? [] as $segment) {
                    $paths[$kind][$segment] = ! $default;
                }
            }
        }

        return $paths;
    }

    /**
     * მოქმედი წესები ინტერფეისისთვის (ვადაგასული აქამდე იშლება).
     *
     * @return list<array{kind: string, module: ?string, user_id: ?int, enabled: bool, expires_at: ?string}>
     */
    public static function rows(): array
    {
        if (! self::tableExists()) {
            return [];
        }

        self::prune();

        return AuditRule::query()->orderBy('id')->get()
            ->map(fn (AuditRule $rule) => [
                'kind' => $rule->kind,
                'module' => $rule->module,
                'user_id' => $rule->user_id,
                'enabled' => $rule->enabled,
                'expires_at' => $rule->expires_at?->toIso8601String(),
            ])
            ->all();
    }

    /**
     * მოდულის გასაღებები, რომლებზეც წესი შეიძლება დაიწეროს — მოდულები (პირადიც)
     * და ლოგის ფსევდო-ჭრილები.
     *
     * @return list<string>
     */
    public static function moduleKeys(): array
    {
        return [...Module::query()->orderBy('id')->pluck('key')->all(), ...AuditRegistry::PSEUDO_MODULES];
    }

    /**
     * უჯრების შენახვა — თითო ცვლილება ერთი უჯრაა.
     *
     * ⚠️ **მოდელით და არა `DB::table()`-ით**: ცვლილება `AuditObserver`-მა უნდა
     * დაინახოს („ვინ გამორთო დაჭერები"), და `AuditLogger` წესის ცვლილებას
     * წესების მიუხედავად წერს. ⚠️ გლობალურ დონეზე „ჩართული" ნაგულისხმევია —
     * რიგი არ ინახება, ე.ი. ბაზაში მხოლოდ გადახვევა დევს.
     *
     * @param  list<array{kind: string, module?: ?string, user_id?: ?int, state: string, until?: ?string}>  $changes
     */
    public static function apply(array $changes, ?User $by = null): void
    {
        self::prune();

        foreach ($changes as $change) {
            $kind = $change['kind'];

            if (! isset(self::KINDS[$kind]) || in_array($kind, self::PROTECTED, true)) {
                continue;
            }

            $module = in_array($kind, self::MODULELESS, true) ? null : ($change['module'] ?? null);
            $userId = $change['user_id'] ?? null;
            $state = $change['state'];

            if ($state === 'on' && $module === null && $userId === null) {
                $state = 'inherit';
            }

            $rule = AuditRule::query()
                ->where('kind', $kind)
                ->where(fn (Builder $q) => $module === null ? $q->whereNull('module') : $q->where('module', $module))
                ->where(fn (Builder $q) => $userId === null ? $q->whereNull('user_id') : $q->where('user_id', $userId))
                ->first();

            if ($state === 'inherit') {
                $rule?->delete();

                continue;
            }

            $rule ??= new AuditRule(['kind' => $kind, 'module' => $module, 'user_id' => $userId]);
            $rule->enabled = $state === 'on';
            $rule->expires_at = $state === 'off' ? self::expiry($change['until'] ?? null) : null;

            if ($rule->isDirty()) {
                $rule->updated_by = $by?->getKey();
                $rule->save();
            }
        }

        self::flush();
    }

    /** წაშლილი მოდულის წესები — იგივე გასაღებით ახალ მოდულს ძველი წესი არ უნდა დახვდეს */
    public static function forgetModule(string $key): void
    {
        if (! self::tableExists()) {
            return;
        }

        AuditRule::query()->where('module', $key)->delete();

        self::flush();
    }

    /** ქეშის გასუფთავება — ჩაწერის შემდეგ და ტესტებს შორის */
    public static function flush(): void
    {
        self::$memo = null;
    }

    /**
     * სახეობა → მოდული (`''` — ყველა) → მომხმარებელი (`0` — ყველა) → იწერება.
     *
     * @return array<string, array<string, array<int, bool>>>
     */
    private static function index(): array
    {
        if (! self::tableExists()) {
            return [];
        }

        self::$memo ??= new WeakMap;
        $scope = self::scope();

        if (! isset(self::$memo[$scope])) {
            $index = [];

            $rows = AuditRule::query()
                ->where(fn (Builder $q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
                ->toBase()
                ->get(['kind', 'module', 'user_id', 'enabled']);

            foreach ($rows as $row) {
                $index[$row->kind][(string) $row->module][(int) $row->user_id] = (bool) $row->enabled;
            }

            self::$memo[$scope] = $index;
        }

        return self::$memo[$scope];
    }

    /**
     * მოდულის key → SPA-ს მისამართის სეგმენტები, რომლებიდანაც სერვერი ამ მოდულს
     * კითხულობს (`AuditLogger::moduleForPath()`-ის შებრუნებული რუკა).
     *
     * @return array<string, list<string>>
     */
    private static function segments(int $userId): array
    {
        $map = [];

        foreach (Module::query()->get(['key', 'route_base', 'owner_id']) as $module) {
            if ($module->owner_id !== null) {
                if ((int) $module->owner_id === $userId) {
                    $map[$module->key][] = 'c/'.$module->key;
                }

                continue;
            }

            $base = trim((string) $module->route_base, '/');

            // ორსეგმენტიან მისამართს სერვერი პირველი სეგმენტით ვერ ცნობს — რუკაშიც არ არის
            if ($base !== '' && ! str_contains($base, '/')) {
                $map[$module->key][] = $base;
            }
        }

        foreach (AuditRegistry::PATH_MODULES as $segment => $module) {
            $map[$module][] = $segment;
        }

        return $map;
    }

    /** ვადაგასული წესები — უხმოდ: გამორთვა და მისი ვადა ჟურნალში დაწესებისას უკვე ჩაიწერა */
    private static function prune(): void
    {
        if (! self::tableExists()) {
            return;
        }

        AuditRule::query()->whereNotNull('expires_at')->where('expires_at', '<=', now())->delete();
    }

    private static function expiry(?string $until): ?Carbon
    {
        return match ($until) {
            'hour' => AppTime::now()->addHour(),
            'day' => AppTime::now()->endOfDay(),
            'week' => AppTime::now()->addDays(7),
            default => null,
        };
    }

    private static function kindOf(string $action): ?string
    {
        foreach (self::KINDS as $kind => $actions) {
            if (in_array($action, $actions, true)) {
                return $kind;
            }
        }

        return null;
    }

    private static function scope(): object
    {
        if (app()->bound('request')) {
            return app('request');
        }

        return self::$fallbackScope ??= new \stdClass;
    }

    /** ⚠️ მხოლოდ `true` იმახსოვრება — მიგრაციამდე დასმული კითხვა ნაგულისხმევს იღებს და არა 500-ს */
    private static function tableExists(): bool
    {
        if (self::$tableExists) {
            return true;
        }

        return self::$tableExists = Schema::hasTable('audit_rules');
    }
}
