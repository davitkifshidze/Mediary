<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StatusResource;
use App\Models\Module;
use App\Models\Status;
use App\Models\User;
use App\Support\DictionaryRecords;
use App\Support\ModuleSettings;
use App\Support\StatusDomain;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * **სტატუსების ლექსიკონი (Tasks §6.2/§6.4)** — დამატება · გადარქმევა ·
 * წაშლა · სორტირება, ექვსივე დომენზე.
 *
 * ⚠️ **ერთი კონტროლერი და არა ექვსი** (`/visibility/{domain}`-ის ნიმუში):
 * `statuses` ერთი ცხრილია, განსხვავება მხოლოდ `module` სვეტია. ექვსი
 * კონტროლერი ექვს ადგილს ნიშნავდა, სადაც წესი შეიძლება დაშორდეს.
 *
 * ⚠️ **`module:@type`/`permission:@type` middleware განზრახ არ ეწერება.**
 * დომენი აქ `{domain}` პარამეტრია და არა `{type}`, და თვითონ შემოწმებაც
 * ორმაგია (მოდული ჩართულია + უფლება) — `VisibilityController` ზუსტად ასე
 * იქცევა, ამიტომ ერთი ნიმუშია და არა ორი.
 */
class StatusController extends Controller
{
    /** `module_user.settings`-ის გასაღები — საიდბარის განლაგება (ეტაპი 8) */
    public const SECTIONS_KEY = 'status_sections';

    /**
     * სია — მთვლელებით („რამდენი ჩანაწერია ამ სტატუსზე").
     *
     * ⚠️ **`?user_id=` მხოლოდ super_admin-ს ეძლევა.** ის `/purge`-ისთვისაა:
     * მასობრივი წაშლა სხვისი ბიბლიოთეკიდან შლის, ე.ი. სტატუსების სიაც
     * **მისი** ლექსიკონიდან უნდა დაიხატოს — ჩემი გადარქმეული „ნანახი"
     * იქ არაფერს ნიშნავს.
     */
    public function index(Request $request, string $domain)
    {
        $this->guard($request, $domain, 'view');

        $data = $request->validate([
            'user_id' => ['nullable', 'integer', Rule::exists('users', 'id')],
        ]);

        $userId = (int) ($data['user_id'] ?? $request->user()->id);

        abort_unless($userId === (int) $request->user()->id || $request->user()->isSuperAdmin(), 403);

        return StatusResource::collection($this->ordered($domain, $userId));
    }

    public function store(Request $request, string $domain)
    {
        $this->guard($request, $domain, 'create');

        $data = $this->validated($request);
        $userId = (int) $request->user()->id;

        // ⚠️ ლენივი დეფაულტები ჯერ — თორემ პირველი ხელით დამატებული სტატუსი
        // ნაკრებს „დაასწრებდა" და ანგარიში მხოლოდ მისით დარჩებოდა
        Status::ensureDefaults($userId, $domain);

        $status = Status::create([
            'module' => $domain,
            'key' => Status::makeKey($userId, $domain, $data['name_en'] ?: $data['name_ka']),
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'role' => $data['role'],
            'icon' => $data['icon'] ?? null,
            'color' => $data['color'] ?? null,
            'sort_order' => (int) Status::forDomain($domain)->max('sort_order') + 1,
        ]);

        if ($request->boolean('is_default')) {
            $this->makeDefault($status);
        }

        return (new StatusResource($status))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $domain, int $id)
    {
        $this->guard($request, $domain, 'update');

        $status = $this->find($domain, $id);
        $data = $this->validated($request);

        /* ⚠️ **`key` არ იცვლება** — გადარქმევა სახელს ეხება. გასაღები
           აკავშირებს ლექსიკონს ძველ ბმულებთან (`?view=watched`) და
           ნაგულისხმევებთან, ე.ი. მისი ცვლა მათ ჩუმად გაწყვეტდა. */
        $status->fill([
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'role' => $data['role'],
            'icon' => $data['icon'] ?? $status->icon,
            'color' => $data['color'] ?? $status->color,
        ])->save();

        if ($request->has('is_default') && $request->boolean('is_default')) {
            $this->makeDefault($status);
        }

        return new StatusResource($status->refresh());
    }

    /**
     * წაშლა. `move_to` — რომელ სტატუსზე გადავიდნენ ეს ჩანაწერები;
     * მითითების გარეშე სტატუსის გარეშე რჩებიან (`status_id = null`);
     * `delete_records` — ჩანაწერებიც იშლება (ეტაპი 8, `DictionaryRecords`).
     *
     * ⚠️ **ბოლო სტატუსიც იშლება** — „ყველაფერი იშლება" მომხმარებლის
     * ცხადი პასუხია (2026-09-12). ცარიელ ლექსიკონზე ახალი ჩანაწერი
     * უბრალოდ სტატუსის გარეშე იქმნება (`Status::defaultFor()` → `null`).
     */
    public function destroy(Request $request, string $domain, int $id)
    {
        $this->guard($request, $domain, 'delete');

        $status = $this->find($domain, $id);

        $data = $request->validate(DictionaryRecords::rules(
            $request,
            Rule::exists('statuses', 'id')
                ->where('user_id', $request->user()->id)
                ->where('module', $domain),
        ));

        $model = StatusDomain::model($domain);
        $records = $model::query()->where('status_id', $status->id);

        if ($request->boolean('delete_records')) {
            $deleted = DictionaryRecords::delete($records);
            $moved = 0;
        } else {
            $deleted = 0;

            /* ⚠️ **`applyStatus()` და არა `update(['status_id' => …])`**
               (Tasks BUG-05): `watched_at`-ს მხოლოდ ის წერს, ე.ი. `done`
               სტატუსის წაშლა `todo`-ზე გადატანით ყველა ჩანაწერს შევსებული
               „როდის ვნახე"-თი ტოვებდა. მასობრივი `update()` `AuditObserver`-საც
               გვერდს უვლიდა — ე.ი. ასი ფილმის სტატუსის შეცვლა ლოგში არსად ჩანდა. */
            $target = ($targetId = DictionaryRecords::moveTarget($data, $status->id))
                ? Status::find($targetId)
                : null;

            $moved = DictionaryRecords::move($records, fn ($record) => $record->applyStatus($target));
        }

        // განლაგებაში ამ სტატუსის შემდეგ მდგარი „რჩეული" მის წინა მეზობელზე
        // გადაება — ე.ი. საიდბარში ადგილს არ იცვლის (იხ. `forgetInLayout()`)
        $previousKey = Status::forDomain($domain)->ordered()->get()
            ->takeUntil(fn (Status $s) => $s->id === $status->id)
            ->last()?->key;

        $wasDefault = $status->is_default;
        $status->delete();

        // ნაგულისხმევი წაიშალა → პირველივე დარჩენილი იკავებს მის ადგილს,
        // თორემ ახალი ჩანაწერი ჩუმად სტატუსის გარეშე დარჩებოდა
        if ($wasDefault && ($next = Status::forDomain($domain)->ordered()->first())) {
            $this->makeDefault($next);
        }

        $this->forgetInLayout($request->user(), $domain, $status->key, $previousKey ?? 'start');

        return response()->json(['moved' => $moved, 'deleted' => $deleted]);
    }

    /**
     * **საიდბარის განლაგება (ეტაპი 8)** — რომელი განყოფილება იმალება და
     * სად დგას „ყველა"/„რჩეული"/„ჩამოწერილები" სტატუსებს შორის.
     *
     * ⚠️ **ორი ფაქტი, ორი ადგილი, და ეს განზრახაა.** სტატუსების *ურთიერთ*
     * რიგი `statuses.sort_order`-შია (ფორმა და ფილტრიც მას კითხულობს),
     * ფსევდო-განყოფილება კი ცხრილში საერთოდ არ არის — ე.ი. მისი ადგილი
     * **მეზობელ სტატუსის გასაღებით** იწერება (`at`: `start` · `end` · key),
     * და არა ინდექსით: ახალი სტატუსი ბოლოს ემატება, და ინდექსით „ბოლოს
     * მდგარი" რჩეული მის **წინ** აღმოჩნდებოდა.
     *
     * ⚠️ **დამალვა მხოლოდ საიდბარს ეხება** (მომხმარებლის პასუხი 2026-09-13):
     * დამალული სტატუსი ჩანაწერზე, ფილტრსა და ფორმაში რჩება.
     *
     * ⚠️ **`view` და არა `update`** — ეს ჩემი ხედია, ლექსიკონის შიგთავსი არ
     * იცვლება. ⚠️ **`PUT`**, `EnsureModulePermission`-ის POST→create ხაფანგის გამო.
     */
    public function sections(Request $request, string $domain)
    {
        $this->guard($request, $domain, 'view');

        $data = $request->validate([
            'hidden' => ['present', 'array', 'max:100'],
            'hidden.*' => ['string', 'max:60', 'distinct'],
            'placement' => ['present', 'array', 'max:'.count(StatusDomain::RESERVED_KEYS)],
            'placement.*.id' => ['required', 'string', 'distinct', Rule::in(StatusDomain::RESERVED_KEYS)],
            'placement.*.at' => ['required', 'string', 'max:60'],
        ]);

        $layout = [
            'hidden' => array_values($data['hidden']),
            'placement' => array_map(
                fn (array $p) => ['id' => $p['id'], 'at' => $p['at']],
                array_values($data['placement']),
            ),
        ];

        ModuleSettings::merge($request->user(), $this->moduleRow($domain), [self::SECTIONS_KEY => $layout]);

        return response()->json([self::SECTIONS_KEY => $layout]);
    }

    /** გადალაგება — მოწოდებული id-ების რიგი ხდება `sort_order` */
    public function reorder(Request $request, string $domain)
    {
        $this->guard($request, $domain, 'update');

        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => [
                'integer',
                Rule::exists('statuses', 'id')
                    ->where('user_id', $request->user()->id)
                    ->where('module', $domain),
            ],
        ]);

        foreach ($data['ids'] as $i => $id) {
            Status::whereKey($id)->update(['sort_order' => $i + 1]);
        }

        return StatusResource::collection($this->ordered($domain, (int) $request->user()->id));
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * ორმაგი შემოწმება — მოდული ჩართულია და უფლებაც აქვს.
     *
     * ⚠️ 404 და არა 403 უცნობ დომენზე: `{domain}`-ის `whereIn` მას ისედაც
     * ჭრის, ეს კი მეორე ხაზია (`VisibilityController::guard()`-ის წესი).
     */
    private function guard(Request $request, string $domain, string $action): void
    {
        abort_unless(StatusDomain::usesDictionary($domain), 404);

        $module = StatusDomain::module($domain);
        $user = $request->user();

        abort_unless($user?->hasModule($module), 403, 'module_not_enabled');

        /* ⚠️ `permission` **ყოველ** `forbidden_permission`-ს ახლავს
           (`EnsureModulePermission`-ის ფორმა, Tasks GAP-01): SPA-ს ტექსტი
           „უფლება არ გაქვს ({{permission}})"-ია, და მის გარეშე ცარიელ
           ფრჩხილებს ხატავდა. */
        if (! $user->hasPermission($module, $action)) {
            abort(response()->json([
                'message' => 'forbidden_permission',
                'permission' => "{$module}.{$action}",
            ], 403));
        }
    }

    private function find(string $domain, int $id): Status
    {
        return Status::forDomain($domain)->whereKey($id)->firstOrFail();
    }

    private function moduleRow(string $domain): Module
    {
        return Module::where('key', StatusDomain::module($domain))->firstOrFail();
    }

    /**
     * წაშლილი სტატუსი განლაგებიდან.
     *
     * ⚠️ **ორივე მიზეზით აუცილებელია.** `hidden`-ში რომ დარჩეს, იმავე
     * სახელით ხელახლა შექმნილი სტატუსი (`makeKey()` იმავე გასაღებს
     * აბრუნებს) **დამალული დაიბადებოდა**. `at`-ში რომ დარჩეს, „რჩეული"
     * ანკერს დაკარგავდა და ბოლოში ჩამოვარდებოდა — ამიტომ წინა მეზობელზე
     * გადაება.
     */
    private function forgetInLayout(User $user, string $domain, string $key, string $replacement): void
    {
        $module = $this->moduleRow($domain);
        $layout = ModuleSettings::read($user, $module)[self::SECTIONS_KEY] ?? null;

        if (! is_array($layout)) {
            return;
        }

        $layout['hidden'] = array_values(array_filter(
            (array) ($layout['hidden'] ?? []),
            fn ($id) => $id !== $key,
        ));

        $layout['placement'] = array_map(
            fn ($p) => is_array($p) && ($p['at'] ?? null) === $key ? [...$p, 'at' => $replacement] : $p,
            (array) ($layout['placement'] ?? []),
        );

        ModuleSettings::merge($user, $module, [self::SECTIONS_KEY => $layout]);
    }

    /**
     * დალაგებული სია + „რამდენი ჩანაწერია".
     *
     * ⚠️ მთვლელი **ერთი დაჯგუფებული query-თია** და არა `withCount()`:
     * კავშირი დომენზეა დამოკიდებული (`statuses.module`), ე.ი. Eloquent-ს
     * ცარიელ მოდელზე ვერ ავაგებინებთ.
     */
    private function ordered(string $domain, int $userId)
    {
        Status::ensureDefaults($userId, $domain);

        $statuses = Status::withoutGlobalScope('owner')
            ->where('user_id', $userId)
            ->forDomain($domain)
            ->ordered()
            ->get();

        /** @var class-string<Model> $model */
        $model = StatusDomain::model($domain);

        $counts = $model::withoutGlobalScope('owner')
            ->where('user_id', $userId)
            ->whereNotNull('status_id')
            ->selectRaw('status_id, count(*) as aggregate')
            ->groupBy('status_id')
            ->pluck('aggregate', 'status_id');

        foreach ($statuses as $status) {
            $status->records_count = (int) ($counts[$status->id] ?? 0);
        }

        return $statuses;
    }

    /** ნაგულისხმევი ერთია — ახლის დანიშვნა ძველს ხსნის */
    private function makeDefault(Status $status): void
    {
        Status::forDomain($status->module)->where('id', '!=', $status->id)->update(['is_default' => false]);

        $status->forceFill(['is_default' => true])->save();
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name_ka' => ['required', 'string', 'max:80'],
            'name_en' => ['required', 'string', 'max:80'],
            // ⚠️ სავალდებულოა: სამი სერვისი მნიშვნელობას ეკითხება და არა სახელს
            'role' => ['required', Rule::in(StatusDomain::ROLES)],
            'icon' => ['nullable', 'string', 'max:60'],
            'color' => ['nullable', 'string', 'max:20'],
            'is_default' => ['nullable', 'boolean'],
        ]);
    }
}
