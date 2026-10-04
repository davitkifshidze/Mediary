<?php

namespace App\Services\Audit;

use App\Models\AuditLog;
use App\Models\Module;
use App\Models\Status;
use App\Models\User;
use App\Support\AuditRegistry;
use App\Support\AuditSettings;
use App\Support\CustomModules;
use App\Support\Openable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * **აუდიტ-ლოგის ერთადერთი წერტილი (Tasks §4.3)**.
 *
 * §4.3 პირდაპირ ითხოვს: „თუ ყოველი კონტროლერი თავისთვის დაწერს, ერთი
 * მაინც დაგვავიწყდება — საჭიროა ერთი სერვისი + მოდელის მოვლენებზე მიბმა,
 * ისე როგორც `StorageMeter` არის ატვირთვების ერთადერთი წერტილი".
 *
 * ორი მომხმარებელი აქვს:
 *  - `AuditObserver` — დამატება/რედაქტირება/წაშლა, `AuditRegistry::MODELS`-ის
 *    მიხედვით ავტომატურად ყველა მოდულზე;
 *  - ცხადი გამოძახებები იქ, სადაც მოდელის მოვლენა არ არსებობს — შესვლა,
 *    გასვლა, სექციაში შესვლა, ჩატის წერილის წაშლა.
 *
 * ⚠️ **ლოგირება ვერასდროს ტეხს მოქმედებას.** ჩაწერა try/catch-შია და
 * ჩავარდნა მხოლოდ `report()`-ით ფიქსირდება: მიგრაციის დროს ცხრილი ჯერ
 * შეიძლება არ არსებობდეს, ლოგის გამო კი ფილმის შენახვა არ უნდა ჩავარდეს.
 *
 * ⚠️ **`suppress()` არსებობს განზრახ და ვიწროდ** — მასობრივი მიგრაციული
 * სამუშაოსთვის. ჩვეულებრივი წაშლა (`purge`-იც) **იწერება**: §4.1 სრულ
 * ლოგირებას ითხოვს და სწორედ მასობრივი წაშლაა ის, რაზეც კითხვა მოგვიანებით
 * ისმება.
 *
 * ⚠️ **Tasks §43.5 — ყოველი ჩაწერის წინ მოწმდება, ჩართულია თუ არა ტიპი**
 * (`AuditSettings`, სუპერადმინის გადამრთველები). კარიბჭე აქაა და არა
 * გამომძახებლებში — ერთადერთი მწერალი ერთადერთი ადგილია, სადაც გამორთვა
 * ყველგან ერთნაირად მოქმედებს.
 */
class AuditLogger
{
    /** გახსნის წყარო (§43.3) — ბიბლიოთეკა · საჯარო პროფილი · გაზიარების ბმული */
    public const OPEN_LIBRARY = 'library';

    public const OPEN_PUBLIC = 'public';

    public const OPEN_SHARE = 'share';

    /** იგივე ჩანაწერი იმავე ადამიანისგან — წუთში ერთხელ (Q10) */
    private const OPEN_WINDOW_SECONDS = 60;

    private bool $enabled = true;

    /** ცხრილის არსებობა ერთხელ მოწმდება (მიგრაციისას ის ჯერ არ არის) */
    private ?bool $tableExists = null;

    /** `route_base` → მოდულის key; რექვესთზე ერთხელ იკითხება (იხ. `moduleForPath`) */
    private ?array $routeBases = null;

    /** §6.4 — `status_id` → გასაღები; ერთი რექვესთის ფარგლებში იმახსოვრებს */
    private array $statusKeys = [];

    /**
     * ლოგის ჩაწერა.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function log(string $action, array $attributes = []): ?AuditLog
    {
        if (! $this->enabled || ! $this->tableExists() || ! AuditSettings::enabled($action)) {
            return null;
        }

        try {
            $user = Auth::user();
            $request = request();

            return AuditLog::create([
                'user_id' => $user?->id,
                // ⚠️ სახელის ასლი — ანგარიშის წაშლის შემდეგ „ვინ" სხვაგვარად იკარგება
                'user_label' => $user?->username ?? $user?->name,
                'action' => $action,
                'method' => $request?->method(),
                // „რითი" (§4.1) — რომელი გზით მოხდა ცვლილება
                'route' => $request ? mb_substr($request->path(), 0, 400) : null,
                'ip' => $request?->ip(),
                'user_agent' => mb_substr((string) $request?->userAgent(), 0, 400) ?: null,
                ...$attributes,
                'created_at' => now(),
            ]);
        } catch (Throwable $e) {
            report($e);

            return null;
        }
    }

    /**
     * მოდელის ცვლილება — `AuditObserver`-ის ერთადერთი გზა.
     *
     * @param  array<string, mixed>|null  $old
     * @param  array<string, mixed>|null  $new
     */
    public function model(Model $model, string $action, ?array $old = null, ?array $new = null): ?AuditLog
    {
        return $this->log($action, [
            'module' => AuditRegistry::moduleFor($model),
            'subject_type' => AuditRegistry::typeFor($model),
            'subject_id' => $model->getKey(),
            'subject_label' => AuditRegistry::labelFor($model),
            'old_values' => $this->clean($old),
            'new_values' => $this->clean($new),
        ]);
    }

    /**
     * სექციაში შესვლა (§4.1) — ფრონტი მარშრუტის შეცვლაზე იძახებს.
     *
     * ⚠️ **გამეორება ჩუმად იკარგება.** SPA ერთსა და იმავე მისამართს
     * შეიძლება რამდენჯერმე გამოაგზავნოს (რექვესთის ხელახალი გაშვება,
     * ტაბზე დაბრუნება) — ერთი წუთის ფანჯარაში იგივე გზა ერთხელ იწერება,
     * თორემ ლოგი „შესვლების" ხმაურით აივსებოდა და §4.4-ის გვერდი
     * წასაკითხი აღარ იქნებოდა.
     */
    public function visit(string $path, ?string $module = null): ?AuditLog
    {
        if (! $this->enabled || ! $this->tableExists() || ! AuditSettings::enabled(AuditLog::ACTION_VISIT)) {
            return null;
        }

        $path = self::maskPath($path);

        $recent = AuditLog::where('user_id', Auth::id())
            ->where('action', AuditLog::ACTION_VISIT)
            ->where('route', $path)
            ->where('created_at', '>=', now()->subMinute())
            ->exists();

        if ($recent) {
            return null;
        }

        /* ⚠️ §37.6 — სხვისი პირადი მოდულის გასაღები ლოგში არ იწერება: გასაღები
           კლიენტიდან მოდის, და „ამ ანგარიშმა X-ის მოდულში შეიხედა" ფაქტი არ არის —
           ის გვერდი მისთვის 404-ია. საკუთარი ჩვეულებრივად იწერება. */
        if (CustomModules::isKey($module) && ! CustomModules::owns(Auth::user(), $module)) {
            $module = null;
        }

        return $this->log(AuditLog::ACTION_VISIT, [
            'module' => $module ?? $this->moduleForPath($path),
            'route' => $path,
        ]);
    }

    /**
     * **ჩანაწერის გახსნა** (Tasks §43.3, Q10) — ხილული „შევედი N-ჯერ"-ის (§10) ადგილი.
     *
     * ⚠️ **იგივე ჩანაწერი იმავე ადამიანისგან წუთში ერთხელ**: ფანჯრის ხელახალი
     * რენდერი, ჩანართზე დაბრუნება ან ორი სწრაფი დაჭერა ერთ ფაქტად იწერება.
     * ავტორიზებულზე — ბაზით, ანონიმზე (საჯარო პროფილი, გაზიარება) — `Cache::add`-ით
     * IP-ის ჰეშზე: ანონიმის ვინაობა ბაზაში არ ინახება.
     *
     * ⚠️ ორენოვან ჩანაწერს (ფილმი) სათაური თარგმანებშია — `labelFor()` მხოლოდ
     * ჩატვირთულს კითხულობს, ამიტომ აქ იტვირთება.
     */
    public function open(Model $record, string $source = self::OPEN_LIBRARY, ?string $anonKey = null): ?AuditLog
    {
        if (! $this->enabled || ! $this->tableExists() || ! AuditSettings::enabled(AuditLog::ACTION_OPEN)) {
            return null;
        }

        $type = AuditRegistry::typeFor($record);
        $viewer = Auth::user();

        if ($viewer) {
            $recent = AuditLog::query()
                ->where('user_id', $viewer->getAuthIdentifier())
                ->where('action', AuditLog::ACTION_OPEN)
                ->where('subject_type', $type)
                ->where('subject_id', $record->getKey())
                ->where('created_at', '>=', now()->subSeconds(self::OPEN_WINDOW_SECONDS))
                ->exists();

            if ($recent) {
                return null;
            }
        } elseif (! Cache::add('audit-open:'.$type.':'.$record->getKey().':'.sha1((string) $anonKey), 1, self::OPEN_WINDOW_SECONDS)) {
            return null;
        }

        if (method_exists($record, 'translations')) {
            $record->loadMissing('translations');
        }

        return $this->log(AuditLog::ACTION_OPEN, [
            'module' => Openable::has($type) ? Openable::module($type, $record) : AuditRegistry::moduleFor($record),
            'subject_type' => $type,
            'subject_id' => $record->getKey(),
            'subject_label' => AuditRegistry::labelFor($record),
            'context' => ['source' => $source],
        ]);
    }

    /** სხვისი გახსნა საჯარო პროფილიდან ან გაზიარების ბმულიდან — მფლობელი თავის თავს არ ითვლის */
    public function openFromPublic(Model $record, Request $request, User $owner, string $source): ?AuditLog
    {
        $viewer = $request->user();

        if ($viewer && (int) $viewer->getKey() === (int) $owner->getKey()) {
            return null;
        }

        return $this->open($record, $source, $request->ip());
    }

    /**
     * **SPA-ს პაკეტი** (Tasks §43.4) — დაჭერები და განახლება.
     *
     * ⚠️ მხოლოდ ოთხი ველი იკითხება (`action`, `path`, `label`, `role`) —
     * კონტროლერის ვალიდაცია დანარჩენს უკვე აგდებს, ე.ი. ველის მნიშვნელობა
     * (პაროლი, გასაღები) აქამდე ვერ აღწევს; წარწერა 120 სიმბოლოზე იჭრება.
     * ⚠️ გამორთული ტიპი `log()`-შივე იგდება — SPA ისედაც არ აგზავნის, ეს მეორე კარიბჭეა.
     *
     * @param  list<array{action: string, path: string, label?: ?string, role?: ?string}>  $events
     */
    public function events(array $events): int
    {
        $written = 0;

        foreach ($events as $event) {
            $path = self::maskPath((string) $event['path']);
            $label = self::maskSecrets(trim((string) ($event['label'] ?? '')));

            $row = $this->log($event['action'], [
                'module' => $this->moduleForPath($path),
                'route' => $path,
                // კლიენტის მოვლენაა — HTTP მეთოდი (`POST /audit/events`) აქ არაფერს ამბობს
                'method' => null,
                'context' => array_filter([
                    'label' => $label === '' ? null : mb_substr($label, 0, 120),
                    'role' => $event['role'] ?? null,
                ]) ?: null,
            ]);

            if ($row) {
                $written++;
            }
        }

        return $written;
    }

    /**
     * SPA-ს მისამართი ლოგისთვის — **გაზიარების ტოკენის გარეშე**.
     *
     * ⚠️ `/share/{token}` გზაში ტოკენი ღიად დგას, ბაზაში კი ის მხოლოდ ჰეშად
     * ინახება (§40.2): ლოგში ჩაწერილი გზა მას ადმინს ღიად გადასცემდა.
     */
    public static function maskPath(string $path): string
    {
        $path = mb_substr(ltrim($path, '/'), 0, 400);

        return (string) preg_replace('#^share/[^/]+#', 'share/•••', $path);
    }

    /**
     * დაჭერის წარწერა — **ტოკენის მსგავსი სტრიქონის გარეშე**: გაზიარების ბმული
     * (`…/share/{token}`) ან გრძელი გასაღები ბმულის/ღილაკის ტექსტად შეიძლება
     * ეწეროს; 24+ ლათინური სიმბოლოს უწყვეტი რიგი ჩვეულებრივ წარწერაში არ გვხვდება.
     */
    public static function maskSecrets(string $text): string
    {
        $text = (string) preg_replace('#share/[A-Za-z0-9_\-]+#', 'share/•••', $text);

        return (string) preg_replace('#[A-Za-z0-9_\-]{24,}#', '•••', $text);
    }

    /** დროებით გამორთვა (მიგრაციული/ერთჯერადი სამუშაოსთვის — იხ. კლასის შენიშვნა) */
    public function suppress(callable $callback): mixed
    {
        $previous = $this->enabled;
        $this->enabled = false;

        try {
            return $callback();
        } finally {
            $this->enabled = $previous;
        }
    }

    /**
     * SPA-ს მისამართი → მოდულის key.
     *
     * ⚠️ **`modules.route_base` არის წყარო და არა ხელით ჩამოწერილი სია** —
     * ახალი მოდული რეგისტრში ისედაც იწერება, აქ მეორე სია ჩუმად აცდებოდა.
     */
    private function moduleForPath(string $path): ?string
    {
        $parts = explode('/', trim($path, '/'));
        $first = $parts[0] ?? '';

        if ($first === '') {
            return null;
        }

        /* ⚠️ **§37.6 — პირადი მოდულის მისამართი ორსეგმენტიანია** (`/c/{key}`):
           `route_base`-ის რუკა პირველ სეგმენტს ეძებს, ე.ი. `c`-ს ვერასდროს
           იპოვიდა და ყველა ასეთი შესვლა „მოდულის გარეშე" ჩაიწერებოდა. ⚠️ მხოლოდ
           **საკუთარი** — სხვისი მისამართი მისთვის 404-ია და მისი გასაღები ლოგში
           ფაქტს არ აღწერს. */
        if ($first === 'c') {
            $key = $parts[1] ?? null;

            return CustomModules::owns(Auth::user(), $key) ? $key : null;
        }

        $this->routeBases ??= Module::query()->get(['key', 'route_base'])
            ->mapWithKeys(fn (Module $m) => [trim((string) $m->route_base, '/') => $m->key])
            ->all();

        if (isset($this->routeBases[$first])) {
            return $this->routeBases[$first];
        }

        return match ($first) {
            'users', 'roles', 'requests', 'purge', 'audit' => 'admin',
            'settings', 'profile', 'people' => 'account',
            'chat' => 'chat',
            'genres' => 'genre',
            'actors' => 'cast',
            default => null,
        };
    }

    /**
     * ველების გასუფთავება — პაროლი/ტოკენი ლოგში არ ხვდება.
     *
     * @param  array<string, mixed>|null  $values
     * @return array<string, mixed>|null
     */
    private function clean(?array $values): ?array
    {
        if ($values === null) {
            return null;
        }

        foreach (AuditRegistry::HIDDEN as $key) {
            unset($values[$key]);
        }

        /* §6.4 — `status_id` ლოგში **რიცხვად არაფერს ნიშნავს**: „3 → 4"
           წასაკითხი არაა, ლექსიკონის რიგი კი შეიძლება მოგვიანებით წაიშალოს
           და პასუხი საერთოდ დაიკარგოს. ამიტომ იწერება გასაღები — იგივე
           წესი, რითაც `subject_label` **ასლად** ინახება და არა კავშირად. */
        if (array_key_exists('status_id', $values)) {
            $values['status'] = $this->statusKey($values['status_id']);
            unset($values['status_id']);
        }

        return $values;
    }

    /** ლექსიკონის რიგი → გასაღები (ერთი ლოგის ფარგლებში იმახსოვრებს) */
    private function statusKey(mixed $id): ?string
    {
        if (! $id) {
            return null;
        }

        return $this->statusKeys[$id] ??= Status::withoutGlobalScope('owner')->find($id)?->key;
    }

    /**
     * ⚠️ **მხოლოდ დადებითი პასუხი იმახსოვრება.** უარყოფითის დამახსოვრება
     * ლოგირებას **სამუდამოდ** თიშავდა იმ პროცესში, რომელმაც ცხრილის
     * არსებობა მიგრაციამდე იკითხა (`migrate:fresh`, ტესტების bootstrap,
     * deploy-ის პირველი რექვესთი) — და ეს ჩუმად ხდებოდა.
     */
    private function tableExists(): bool
    {
        if ($this->tableExists === true) {
            return true;
        }

        return $this->tableExists = Schema::hasTable('audit_logs');
    }
}
