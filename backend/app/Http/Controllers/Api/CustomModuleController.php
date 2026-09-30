<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ModuleResource;
use App\Models\CustomCategory;
use App\Models\Module;
use App\Models\Status;
use App\Services\Modules\CustomFieldService;
use App\Services\Notify\Notifier;
use App\Support\CustomFields;
use App\Support\CustomModules;
use App\Support\NotificationType;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * **ახალი მოდულის შექმნა ინტერფეისიდან (Tasks §37.2).**
 *
 * შენი სიტყვები: „მოდულებში შეიძლებოდეს ახალი მოდულის დამატება და მისი
 * ქვემენიუების დამატება… ასევე ველები (ჟანრი, ტიპი, კატეგორია) — მოდულებიდან
 * იწერებოდეს".
 *
 * ⚠️ **ყოველი მომხმარებელი — თავისთვის** (Q28 — „ბ"): მოდული პირადია, მისი
 * მფლობელი ერთადერთია, ვისაც ის უჩანს. `module_user`-ის რიგი მხოლოდ მას
 * ეძლევა, უფლება კი როლში **არ** იწერება (როლი საერთოა — `User::hasPermission()`).
 *
 * ⚠️ **შექმნისას სუპერადმინი შეტყობინებას იღებს** (Q28) — ყველა აქტიური,
 * გარდა თვითონ შემქმნელისა (`Notifier::toAdmins(…, except:)`). ტექსტი არ
 * ინახება — მხოლოდ სახე და მონაცემი (FEAT-19-ის წესი).
 */
class CustomModuleController extends Controller
{
    public function __construct(private CustomFieldService $custom) {}

    public function store(Request $request, Notifier $notifier)
    {
        $user = $request->user();

        $data = $request->validate([
            ...$this->detailRules(),
            // ⚠️ ერთი სახელი მაინც — მეორე ენაზე იგივე ჩაიწერება (`modules.name_*` NOT NULL-ია)
            'name_ka' => ['required_without:name_en', 'nullable', 'string', 'max:60'],
            'name_en' => ['required_without:name_ka', 'nullable', 'string', 'max:60'],
            'icon' => ['required', 'string', 'max:64'],
            'statuses' => ['required', Rule::in(CustomModules::STATUS_PRESETS)],
            // კლასიფიკატორის საწყისი ჩანაწერები — სახელები
            'categories' => ['nullable', 'array', 'max:30'],
            'categories.*' => ['string', 'max:80', 'distinct'],
            // დამატებითი ველები — `CustomFieldController::update()`-ის იგივე წესები
            ...$this->fieldRules(),
        ]);

        /* ⚠️ **ჭერი შექმნამდე მოწმდება და ანგარიშის მოდულებზე ითვლის**
           (ურნაში მყოფიც — ის ჯერ აღდგენადია და გასაღებს იკავებს). */
        $count = Module::withoutGlobalScope('trash')->where('owner_id', $user->getKey())->count();
        if ($count >= CustomModules::MAX_PER_USER) {
            return response()->json(['message' => 'custom_module_limit', 'max' => CustomModules::MAX_PER_USER], 422);
        }

        $nameKa = trim((string) ($data['name_ka'] ?? '')) ?: trim((string) $data['name_en']);
        $nameEn = trim((string) ($data['name_en'] ?? '')) ?: $nameKa;
        $classification = $data['classification'] ?? null;

        $module = DB::transaction(function () use ($user, $data, $nameKa, $nameEn, $classification) {
            $key = CustomModules::makeKey((int) $user->getKey(), $nameEn);

            /* ⚠️ **`forceFill()` და არა `create()`** — Laravel მოდელის „დასაშვებ
               სვეტებს" პროცესზე ერთხელ იმახსოვრებს, ძველი მიგრაციები კი
               `Module`-ს ავსებენ, სანამ ეს სვეტები გაჩნდება: `create()`
               `owner_id`-ს და `definition`-ს **ჩუმად აგდებდა** (ამიტომვე
               წერს `forceFill()`-ით `ModulesSeeder` და `AdminModuleController`). */
            $module = (new Module)->forceFill([
                'owner_id' => $user->getKey(),
                'key' => $key,
                'name_ka' => $nameKa,
                'name_en' => $nameEn,
                'description_ka' => $data['description_ka'] ?? null,
                'description_en' => $data['description_en'] ?? null,
                'icon' => $data['icon'],
                'color' => $data['color'] ?? null,
                'route_base' => '/c/'.$key,
                'api_base' => '/custom/'.$key,
                'morph_alias' => null,
                'enabled_by_default' => false,
                'is_active' => true,
                /* ⚠️ §36 — ახალი მოდული **ბოლოს** დგება: პირად რიგში ის ჯერ არ
                   წერია, ე.ი. `ModuleOrder::sort()` მას საერთო რიგით ბოლოს სვამს. */
                'sort_order' => min((int) Module::withoutGlobalScope('trash')->max('sort_order') + 10, 65000),
                'definition' => ['classification' => $classification, 'statuses' => $data['statuses']],
            ]);
            $module->save();

            $user->modules()->attach($module->id, ['enabled_at' => now()]);

            CustomModules::flush();

            foreach (array_values(array_filter(array_map('trim', $data['categories'] ?? []))) as $i => $name) {
                if (! $classification) {
                    break;
                }

                CustomCategory::create([
                    'user_id' => $user->getKey(),
                    'module' => $key,
                    'key' => CustomCategory::makeKey((int) $user->getKey(), $key, $name),
                    'name_ka' => $name,
                    'name_en' => $name,
                    'sort_order' => $i + 1,
                ]);
            }

            // საწყისი ნაკრები (ან არაფერი — „ცარიელი") — ლენივი შევსების იგივე გზა
            Status::ensureDefaults((int) $user->getKey(), $key);

            if (! empty($data['fields'])) {
                $this->custom->saveDefinitions($user, $key, $data['fields']);
            }

            return $module;
        });

        $user->unsetRelation('modules');

        $notifier->toAdmins(NotificationType::MODULE_CREATED, $this->notice($module, $user), except: $user);

        return (new ModuleResource($this->decorate($module->refresh(), $user)))->response()->setStatusCode(201);
    }

    /**
     * მფლობელის რედაქტირება — სახელი, აღწერა, აიქონი, ფერი, კლასიფიკაცია.
     *
     * ⚠️ **სტატუსების ნაკრები აქ აღარ იცვლება** — ის მხოლოდ საწყისი იყო;
     * შემდეგ სტატუსებს კლასიფიკატორის გვერდი მართავს (ნებისმიერ სხვა
     * მოდულზე იგივე წესია). ⚠️ კლასიფიკაციის მოხსნა ჩანაწერებს **არ**
     * ეხება: `category_id` რჩება და ხელახლა ჩართვაზე ისევ ჩანს.
     */
    public function update(Request $request, string $key)
    {
        $module = $this->owned($request, $key);

        $data = $request->validate([
            ...$this->detailRules(),
            'name_ka' => ['sometimes', 'required', 'string', 'max:60'],
            'name_en' => ['sometimes', 'required', 'string', 'max:60'],
            'icon' => ['sometimes', 'required', 'string', 'max:64'],
        ]);

        $definition = CustomModules::definition($module);
        if (array_key_exists('classification', $data)) {
            $definition['classification'] = $data['classification'];
        }

        // ⚠️ `forceFill()` — იხ. `store()`-ის შენიშვნა დასაშვები სვეტების ქეშზე
        $module->forceFill([
            ...collect($data)->only(['name_ka', 'name_en', 'description_ka', 'description_en', 'icon', 'color'])->all(),
            'definition' => $definition,
        ])->save();

        CustomModules::flush();

        return new ModuleResource($this->decorate($module, $request->user()));
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * **ჩემი** პირადი მოდული — ან 404 (და არა 403: სხვისი არსებობა
     * ინფორმაციაა, Q28). საბაზისო მოდული აქ ასევე 404-ია — მისი სახელი
     * კოდისაა და `/admin/modules`-ზე იცვლება.
     */
    private function owned(Request $request, string $key): Module
    {
        abort_unless(CustomModules::owns($request->user(), $key), 404);

        return Module::where('key', $key)->firstOrFail();
    }

    /** @return array<string, list<mixed>> */
    private function detailRules(): array
    {
        return [
            'description_ka' => ['nullable', 'string', 'max:255'],
            'description_en' => ['nullable', 'string', 'max:255'],
            // hex — `AdminModuleController`-ის წესი (CSS-ში ჩასმული მნიშვნელობა)
            'color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'classification' => ['nullable', Rule::in(CustomModules::CLASSIFICATIONS)],
        ];
    }

    /** @return array<string, list<mixed>> */
    private function fieldRules(): array
    {
        return [
            'fields' => ['nullable', 'array', 'max:'.CustomFieldService::MAX_FIELDS],
            'fields.*.type' => ['required', Rule::in(CustomFields::TYPES)],
            'fields.*.label_ka' => ['nullable', 'string', 'max:120'],
            'fields.*.label_en' => ['nullable', 'string', 'max:120'],
            'fields.*.placeholder_ka' => ['nullable', 'string', 'max:120'],
            'fields.*.placeholder_en' => ['nullable', 'string', 'max:120'],
            'fields.*.enabled' => ['nullable', 'boolean'],
            'fields.*.required' => ['nullable', 'boolean'],
            'fields.*.sort_order' => ['nullable', 'integer', 'min:0', 'max:999'],
        ];
    }

    /** `GET /modules`-ის ფორმა — ფრონტი იმავე ქეშში წერს */
    private function decorate(Module $module, $user): Module
    {
        $user->unsetRelation('modules');

        $module->enabled = $user->hasModule($module->key);
        $module->granted = true;
        $module->user_settings = [];
        $module->shareable = false;
        $module->is_public = false;

        return $module;
    }

    /** შეტყობინების მონაცემი — ⚠️ ტექსტი არა, მხოლოდ ფაქტები (FEAT-19) */
    private function notice(Module $module, $user): array
    {
        return [
            'module_key' => $module->key,
            'module_name_ka' => $module->name_ka,
            'module_name_en' => $module->name_en,
            'owner_id' => (int) $user->getKey(),
            'owner_name' => $user->displayName(),
        ];
    }
}
