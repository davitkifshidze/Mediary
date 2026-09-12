<?php

namespace App\Services\Audit;

use App\Models\AuditLog;
use App\Models\Module;
use App\Models\Status;
use App\Support\AuditRegistry;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
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
 */
class AuditLogger
{
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
        if (! $this->enabled || ! $this->tableExists()) {
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
        if (! $this->enabled || ! $this->tableExists()) {
            return null;
        }

        $path = mb_substr(ltrim($path, '/'), 0, 400);

        $recent = AuditLog::where('user_id', Auth::id())
            ->where('action', AuditLog::ACTION_VISIT)
            ->where('route', $path)
            ->where('created_at', '>=', now()->subMinute())
            ->exists();

        if ($recent) {
            return null;
        }

        return $this->log(AuditLog::ACTION_VISIT, [
            'module' => $module ?? $this->moduleForPath($path),
            'route' => $path,
        ]);
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
        $first = explode('/', trim($path, '/'))[0] ?? '';

        if ($first === '') {
            return null;
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
