<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\ModuleResource;
use App\Models\AuditLog;
use App\Models\CustomRecord;
use App\Models\Module;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Notify\Notifier;
use App\Services\Storage\StorageMeter;
use App\Support\CustomModules;
use App\Support\ModuleOrder;
use App\Support\NotificationType;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * მოდულების რეესტრი ადმინისთვის — ჩართვა/გამორთვა და პრეზენტაციული ველები.
 * ახალი მოდულის *შექმნა* კოდსაც მოითხოვს (migration/model/controller),
 * ამიტომ ის seeder-იდან/კოდიდან მოდის და აქ არ იქმნება — იხ. docs/I7-*.md §7.3.
 */
class AdminModuleController extends Controller
{
    /**
     * K14/L3: „N მომხმარებელი"-ს ნაცვლად ჩანს, **ვის** აქვს ჩართული.
     * super_admin-ებიც ითვლებიან — მათ მოდული pivot-ის გარეშეც აქვთ.
     *
     * სიაში ხვდება ყველა, ვისაც **უფლება** აქვს (`isGrantedModule`), მათ შორის
     * ისინიც, ვინც თვითონ გამორთო (K13) — ისინი `hidden_by_user`-ით აღინიშნება.
     * `users_count` კი მხოლოდ **რეალურად ჩართულებს** ითვლის.
     */
    public function index(Request $request)
    {
        /*
         * pivot-ები წინასწარ — `enabled_at`/`is_hidden` მეხსიერებიდან იკითხება.
         *
         * ⚠️ **`role`-იც, და ეს არ არის „სულ ერთია, დავამატოთ"** (Tasks PERF-04):
         * `users_list` ყოველ მომხმარებელზე `roleKey()`-სა და `isSuperAdmin()`-ს
         * ეკითხება, ე.ი. მის გარეშე პასუხი **წრფივად** იზრდებოდა ანგარიშების
         * რიცხვზე — გაზომილი: 3 მომხმარებელი → 9 query, 12 → 18, 30 → 36, სადაც
         * 18-დან 14 სწორედ `roles`-ზე მოდიოდა. `modules`-ის ანალოგიური ნახევარი
         * PERF-01-მა უკვე მოხსნა.
         */
        $users = User::with('modules', 'role')->orderBy('id')->get();

        /* Tasks §36 — სუპერადმინის **პირადი** რიგით: `/modules` ამ სიას ხატავს,
           ე.ი. საერთო რიგით დალაგებული მის გადათრევას ყოველ ჩატვირთვაზე
           „უკან დააბრუნებდა". საერთო რიგი `sort_order`-ის ველში რჩება. */
        /* ⚠️ §37 — **საბაზისო და საკუთარი პირადი** (`visibleTo`) — ზუსტად ის,
           რასაც `/modules` ხატავს, თორემ სუპერადმინის საკუთარი მოდული ამ
           სიიდან ამოვარდებოდა და მისი რიგი (§36) ორ სიას შორის გაიყოფოდა.
           **სხვისი** პირადი მოდული აქ არასდროს ჩანს — ზედამხედველობა ცალკე
           სიაა (37.8), აგრეგატებით და არა შიგთავსით. */
        $modules = ModuleOrder::sort(Module::visibleTo($request->user())->get(), $request->user())->each(function (Module $m) use ($users) {
            $holders = $users->filter(fn (User $u) => $u->isGrantedModule($m->key));

            $m->users_count = $holders->filter(fn (User $u) => $u->hasModule($m->key))->count();
            $m->users_list = $holders->map(function (User $u) use ($m) {
                $pivot = $u->modules->firstWhere('id', $m->id)?->pivot;

                return [
                    'id' => $u->id,
                    'display_name' => $u->displayName(),
                    'avatar_path' => $u->avatar_path,
                    'role' => $u->roleKey(),
                    'is_super_admin' => $u->isSuperAdmin(),
                    // ავტომატურად აქვს (super_admin, pivot-ის გარეშე), თუ ადმინმა ჩართო
                    'implicit' => $u->isSuperAdmin() && ! $pivot,
                    // თვითონ გამორთო — უფლება რჩება, მაგრამ ჩართული არაა (K13)
                    'hidden_by_user' => (bool) $pivot?->is_hidden,
                    'enabled_at' => $pivot?->enabled_at,
                ];
            })->values();
        });

        return ModuleResource::collection($modules);
    }

    /**
     * **„მომხმარებლების მოდულები" — სუპერადმინის ზედამხედველობა (Tasks §37.8, Q41).**
     *
     * ⚠️ **აგრეგატები და არა შიგთავსი**: სახელი, მფლობელი, ჩანაწერების
     * რაოდენობა და დაკავებული ადგილი. ჩანაწერები სუპერადმინისთვისაც 404-ია
     * (`User::hasPermission()`-ის პირადი შტო), ე.ი. აქ არც სათაური მოდის და
     * არც ბმული.
     *
     * ⚠️ **ორი დაჯგუფებული წაკითხვა და არა თითო მოდულზე**: რაოდენობა ერთი
     * `group by`-ითაა, ადგილი — თითო **მფლობელზე** ერთი ინვენტარით
     * (`StorageMeter::files()`, „რა ითვლება"-ს ერთადერთი განმარტება — ურნაში
     * მყოფიც, ის ხომ ადგილს იკავებს). ⚠️ ურნაში მყოფი **მოდული** აქ არ ჩანს
     * (`trash` scope): ის მფლობელის ურნაშია და მისი ბედი მფლობელისაა.
     */
    public function customIndex(StorageMeter $meter)
    {
        $modules = Module::query()->whereNotNull('owner_id')->with('owner')->orderBy('id')->get();

        $records = CustomRecord::withoutGlobalScopes()
            ->whereIn('module', $modules->pluck('key'))
            ->whereNull('trashed_at')
            ->selectRaw('module, count(*) as total')
            ->groupBy('module')
            ->pluck('total', 'module');

        $bytes = [];

        foreach ($modules->groupBy('owner_id') as $group) {
            $owner = $group->first()->owner;

            if (! $owner) {
                continue;
            }

            $files = $meter->files($owner);

            foreach ($group as $module) {
                $bytes[$module->key] = (int) $files->where('module', $module->key)->sum('size');
            }
        }

        return response()->json([
            'data' => $modules->map(fn (Module $m) => $this->overview(
                $m,
                (int) ($records[$m->key] ?? 0),
                $bytes[$m->key] ?? 0,
            ))->values(),
        ]);
    }

    /**
     * **პირადი მოდულის გამორთვა/ჩართვა (Tasks §37.8)** — გლობალური `is_active`.
     *
     * ⚠️ **მფლობელის საკუთარ გადამრთველზე მაღლა დგას**: `PATCH /modules/{key}`
     * მხოლოდ აქტიურ მოდულს პოულობს, ე.ი. მფლობელი მას თვითონ ვეღარ ჩართავს;
     * მონაცემები ხელუხლებელია. ⚠️ **გამორთვისას მფლობელი შეტყობინებას იღებს**
     * (`module_disabled`) — თორემ მენიუდან ჩუმად გამქრალი მოდული მონაცემების
     * დაკარგვად წაიკითხებოდა; საკუთარ მოდულზე — არა (ხმაურია). ⚠️ ჟურნალს
     * `AuditObserver` წერს (`save()` და არა `saveQuietly()`): „ვინ გამორთო
     * ჩემი მოდული" სწორედ ის კითხვაა, რისთვისაც ჟურნალი არსებობს.
     */
    public function setCustomActive(Request $request, Module $module, Notifier $notifier, StorageMeter $meter)
    {
        abort_if($module->owner_id === null, 404);

        $data = $request->validate(['is_active' => ['required', 'boolean']]);

        $was = (bool) $module->is_active;
        $module->forceFill(['is_active' => (bool) $data['is_active']])->save();

        CustomModules::flush();

        $module->load('owner');

        if ($was && ! $module->is_active && (int) $module->owner_id !== (int) $request->user()->getKey()) {
            $notifier->send($module->owner, NotificationType::MODULE_DISABLED, [
                'module_key' => $module->key,
                'module_name_ka' => $module->name_ka,
                'module_name_en' => $module->name_en,
            ]);
        }

        $records = CustomRecord::withoutGlobalScopes()->where('module', $module->key)->whereNull('trashed_at')->count();
        $bytes = $module->owner ? $meter->usedByModule($module->owner, $module->key) : 0;

        return response()->json(['data' => $this->overview($module, $records, $bytes)]);
    }

    /** ზედამხედველობის ერთი რიგი — ⚠️ მხოლოდ აგრეგატები (Q41) */
    private function overview(Module $module, int $records, int $bytes): array
    {
        $owner = $module->owner;

        return [
            'id' => (int) $module->id,
            'key' => $module->key,
            'name_ka' => $module->name_ka,
            'name_en' => $module->name_en,
            'icon' => $module->icon,
            'color' => $module->color,
            'is_active' => (bool) $module->is_active,
            'owner' => $owner ? [
                'id' => (int) $owner->id,
                'username' => $owner->username,
                'name' => $owner->displayName(),
            ] : null,
            'records' => $records,
            'bytes' => $bytes,
            'created_at' => $module->created_at?->toIso8601String(),
        ];
    }

    public function update(Request $request, Module $module)
    {
        /* ⚠️ §37.8 — **პირადი მოდული აქ არ იცვლება**: სახელი, იერსახე და
           ნაგულისხმევობა მფლობელისაა (`PUT /modules/{key}/details`), ხოლო
           სუპერადმინის ერთადერთი მოქმედება — გამორთვა — ცალკე გზით მიდის
           (`setCustomActive()`, შეტყობინებით). სხვაგვარად ამ კარით ვინმეს
           პირად მოდულს გადაარქმევდა ან `enabled_by_default`-ს ჩაურთავდა. */
        abort_if($module->owner_id !== null, 404);

        $data = $request->validate([
            'name_ka' => ['sometimes', 'required', 'string', 'max:255'],
            'name_en' => ['sometimes', 'required', 'string', 'max:255'],
            'description_ka' => ['nullable', 'string', 'max:255'],
            'description_en' => ['nullable', 'string', 'max:255'],
            'icon' => ['sometimes', 'required', 'string', 'max:64'],
            // Tasks §2.1 — ჰედერის ფონი. ⚠️ `nullable` + hex-ის regex: ნებისმიერი
            // სტრიქონი CSS-ში ჩასმულ მნიშვნელობად გადადიოდა
            'color' => ['sometimes', 'nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'is_active' => ['sometimes', 'boolean'],
            'enabled_by_default' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:9999'],
        ]);

        $module->forceFill($data)->save();

        return new ModuleResource($module);
    }

    /**
     * **„ეს რიგი ყველასთვის ნაგულისხმევად"** (Tasks §36.3, Q27).
     *
     * საერთო რიგს (`modules.sort_order`) წერს — მას მიჰყვება ყველა, ვისაც
     * პირადი რიგი ჯერ არ აქვს (ახალი ანგარიშიც). ⚠️ **პირად რიგს არავის
     * ცვლის**: ვინც თვითონ დაალაგა, თავისას ინარჩუნებს — სწორედ ეს არის
     * „თითო მომხმარებლის რიგი".
     *
     * ⚠️ **ჩამოთვლილი მოდულები თავიანთი რიგით, დანარჩენები მათ შემდეგ**
     * (`ModuleOrder::merged()`), ე.ი. სიიდან გამორჩენილი მოდული ბოლოში
     * გადადის და არ იკარგება. უცნობი გასაღები კი აქ `422`-ია და არა ჩუმი:
     * ეს ადმინის ჩანაწერია ყველასთვის და ის ყველა მოდულს ხედავს.
     *
     * ⚠️ **ერთი ცხადი ლოგის რიგი და არა თითო მოდულზე** — `update()`
     * query builder-ით იწერება (მოდელის მოვლენა არ ისვრება), თორემ ერთი
     * დაჭერა ცამეტ „მოდული შეიცვალა"-ს ჩაწერდა; „ვინ შეცვალა ყველას
     * ნაგულისხმევი რიგი" კი ერთი ფაქტია.
     */
    public function saveDefaultOrder(Request $request, AuditLogger $audit)
    {
        // ⚠️ §37 — საერთო რიგი საბაზისო მოდულებისაა; პირადს თავისი მფლობელი ალაგებს
        $current = Module::base()->orderBy('sort_order')->orderBy('id')->pluck('key')->all();

        $data = $request->validate([
            'keys' => ['required', 'array', 'max:'.ModuleOrder::MAX_KEYS],
            'keys.*' => ['required', 'string', 'distinct', Rule::in($current)],
        ]);

        $next = ModuleOrder::merged($data['keys'], $current);

        DB::transaction(function () use ($next) {
            foreach ($next as $i => $key) {
                Module::where('key', $key)->update(['sort_order' => ($i + 1) * 10]);
            }
        });

        if ($next !== $current) {
            $audit->log(AuditLog::ACTION_UPDATE, [
                'module' => 'admin',
                'subject_type' => 'module',
                'subject_label' => 'sort_order',
                'old_values' => ['order' => implode(', ', $current)],
                'new_values' => ['order' => implode(', ', $next)],
            ]);
        }

        return response()->json(['order' => $next]);
    }
}
