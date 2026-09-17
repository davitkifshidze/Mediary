<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\RoleResource;
use App\Models\Module;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * როლების მართვა (Tasks 1.6).
 *
 * უფლება = მოდულის შიდა CRUD (19.8). სისტემური როლი (`super_admin`, `user`)
 * არ იშლება; `super_admin`-ის უფლებები არ იჭრება — ის ყოველთვის ყველაფერს იტევს.
 */
class AdminRoleController extends Controller
{
    public function index()
    {
        return RoleResource::collection(
            Role::withCount('users')->orderBy('sort_order')->orderBy('id')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $permissions = $this->cleanPermissions($data['permissions'] ?? []);

        // SEC-03 — ადმინ-სექციის გასაღებს მხოლოდ `super_admin` აძლევს
        if ($this->changesAdminZone($request->user(), [], $permissions)) {
            return response()->json(['message' => 'role_escalation'], 403);
        }

        $role = Role::create([
            'key' => Role::makeKey($data['name_en'] ?: $data['name_ka']),
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'permissions' => $permissions,
            'is_system' => false,
            'sort_order' => (int) Role::max('sort_order') + 1,
        ]);

        return (new RoleResource($role->loadCount('users')))->response()->setStatusCode(201);
    }

    public function update(Request $request, Role $role)
    {
        $data = $this->validated($request);
        $actor = $request->user();

        $role->name_ka = $data['name_ka'];
        $role->name_en = $data['name_en'];

        // სუპერ-ადმინს უფლებები არ ეჭრება — `null` ნიშნავს „ყველაფერი"
        if (! $role->isSuperAdmin() && array_key_exists('permissions', $data)) {
            $permissions = $this->cleanPermissions($data['permissions'] ?? []);

            /* ⚠️ SEC-03 — **ჯერ ადმინ-ზონა, მერე „საკუთარი"** (SEC-02-ის იგივე
               რიგი): საკუთარ როლს `admin:users`-ის დამატება ესკალაციაა (403),
               და 422 „საკუთარ როლს ნუ ცვლი" ხვრელის ბუნებას დამალავდა. */
            if ($this->changesAdminZone($actor, $role->permissions, $permissions)) {
                return response()->json(['message' => 'role_escalation'], 403);
            }

            /* ⚠️ საკუთარი როლის **უფლებებს** არავინ ცვლის, ვინც `super_admin` არაა
               — SEC-02-ის `cannot_change_own_role`-ის იგივე პრინციპი: საკუთარ
               უფლებებს სხვა ადმინი ცვლის, მოდულისას ჩათვლით. სახელის
               გადარქმევა ცვლილებად არ ითვლება, და იგივე მატრიცის ხელახლა
               გამოგზავნა (UI ყოველთვის მთელს აგზავნის) — ცვლილება არაა. */
            if (! $actor->isSuperAdmin()
                && $actor->effectiveRole()?->id === $role->id
                && $this->sorted($permissions) !== $this->sorted($this->cleanPermissions($role->permissions ?? []))
            ) {
                return response()->json(['message' => 'cannot_edit_own_role'], 422);
            }

            $role->permissions = $permissions;
        }

        $role->save();

        return new RoleResource($role->loadCount('users'));
    }

    public function destroy(Role $role)
    {
        if ($role->is_system) {
            return response()->json(['message' => 'system_role'], 422);
        }

        if ($role->users()->exists()) {
            return response()->json(['message' => 'role_in_use'], 422);
        }

        $role->delete();

        return response()->noContent();
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * **SEC-03 — ცვლის თუ არა მოთხოვნა ადმინ-ზონის შემადგენლობას?**
     *
     * `admin:roles`-ის მქონე — თუ ეს არ ჰკითხოს — საკუთარ (ან ნებისმიერ) როლს
     * `admin:users`-ს ამატებდა და SEC-02-ის ჯაჭვით მომხმარებლებს მართავდა;
     * ე.ი. ერთი სექციის უფლება მთელ ადმინ-ზონამდე ესკალირდებოდა — ზუსტად ის,
     * რასაც `OwnershipTest::test_module_permissions_never_open_the_admin_zone`
     * კრძალავს, მხოლოდ სხვა კარიდან.
     *
     * ⚠️ **„ცვლის" — დამატებაც და მოხსნაც.** ადმინ-სექციების შემადგენლობა
     * მთლიანად `super_admin`-ისაა (Tasks-ის გადაწყვეტა); SEC-02-ის
     * `exceedsAdmin()`-ის „შენ ჭერმდე შეგიძლია" წესი აქ განზრახ **არ**
     * გამოიყენდება, რადგან როლი ერთ ანგარიშს კი არა, მის **ყველა** მფლობელს
     * ეხება. ⚠️ მოდულების CRUD-ის რედაქტირება (სხვის როლზე) ჩვეულებრივ
     * საქმეა და ამით **არ** იკეტება — UI ყოველთვის მთელ მატრიცას აგზავნის,
     * ე.ი. უცვლელი `admin:*` ნაწილი ცვლილებად არ ითვლება.
     *
     * @param  array<string, mixed>|null  $current  `null` = შეზღუდვის გარეშე
     * @param  array<string, list<string>>  $next
     */
    private function changesAdminZone(User $actor, ?array $current, array $next): bool
    {
        if ($actor->isSuperAdmin()) {
            return false;
        }

        return $this->adminPart($current) !== $this->adminPart($next);
    }

    /**
     * მხოლოდ `admin:<resource>` გასაღებები, ნორმალიზებული (ფიქსირებული რიგი).
     * `null` (შეზღუდვის გარეშე) ნებისმიერ კონკრეტულ მასივს განსხვავდება.
     *
     * @param  array<string, mixed>|null  $permissions
     * @return array<string, list<string>>|null
     */
    private function adminPart(?array $permissions): ?array
    {
        if ($permissions === null) {
            return null;
        }

        $out = [];

        foreach (Role::ADMIN_RESOURCES as $resource) {
            $key = Role::ADMIN_PREFIX.$resource;
            $actions = array_values(array_intersect(Role::ACTIONS, (array) ($permissions[$key] ?? [])));

            if ($actions) {
                $out[$key] = $actions;
            }
        }

        return $out;
    }

    /**
     * გასაღებების რიგი შედარებაზე არ უნდა მოქმედებდეს.
     *
     * @param  array<string, list<string>>  $permissions
     * @return array<string, list<string>>
     */
    private function sorted(array $permissions): array
    {
        ksort($permissions);

        return $permissions;
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name_ka' => ['required', 'string', 'max:80'],
            'name_en' => ['required', 'string', 'max:80'],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['array'],
            'permissions.*.*' => [Rule::in(Role::ACTIONS)],
        ]);
    }

    /**
     * მხოლოდ არსებული მოდულის key-ები **და ადმინის სექციები**; მხოლოდ
     * ცნობილი მოქმედებები. ცარიელი ნაკრები საერთოდ არ ინახება, რომ JSON
     * არ იბერებოდეს.
     *
     * ⚠️ **`admin:<resource>` აქ 2026-09-15-მდე არ ეწერა და ეს ცოცხალი
     * შეცდომა იყო**: მატრიცაში ადმინის სექციის მონიშვნა ჩუმად ცვივდებოდა
     * — ღილაკი ინიშნებოდა, „შენახულია" იწერებოდა და უფლება არ ჩნდებოდა.
     * ტესტები ვერ აჭერდნენ, რადგან ისინი `permissions`-ს **მოდელზე
     * პირდაპირ** წერდნენ და არა API-დან; `RoleApiTest` ახლა API-ს ამოწმებს.
     *
     * ⚠️ **`"*"` აქედან მოიხსნა** — იხ. `Role`-ის კომენტარი: ნიღაბი აღარ
     * არსებობს, ე.ი. ძველი კლიენტის გამოგზავნილი `*` ჩუმად უნდა ჩამოცვივდეს
     * და არა შეინახოს.
     *
     * @param  array<string, array<int, string>>  $input
     * @return array<string, list<string>>
     */
    private function cleanPermissions(array $input): array
    {
        $allowed = Module::pluck('key')
            ->merge(array_map(
                fn (string $resource) => Role::ADMIN_PREFIX.$resource,
                Role::ADMIN_RESOURCES,
            ))
            ->all();
        $out = [];

        foreach ($input as $module => $actions) {
            if (! in_array($module, $allowed, true)) {
                continue;
            }

            $actions = array_values(array_intersect(Role::ACTIONS, (array) $actions));
            if ($actions) {
                $out[$module] = $actions;
            }
        }

        return $out;
    }
}
