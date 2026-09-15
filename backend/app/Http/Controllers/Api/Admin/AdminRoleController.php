<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\RoleResource;
use App\Models\Module;
use App\Models\Role;
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

        $role = Role::create([
            'key' => Role::makeKey($data['name_en'] ?: $data['name_ka']),
            'name_ka' => $data['name_ka'],
            'name_en' => $data['name_en'],
            'permissions' => $this->cleanPermissions($data['permissions'] ?? []),
            'is_system' => false,
            'sort_order' => (int) Role::max('sort_order') + 1,
        ]);

        return (new RoleResource($role->loadCount('users')))->response()->setStatusCode(201);
    }

    public function update(Request $request, Role $role)
    {
        $data = $this->validated($request);

        $role->name_ka = $data['name_ka'];
        $role->name_en = $data['name_en'];

        // სუპერ-ადმინს უფლებები არ ეჭრება — `null` ნიშნავს „ყველაფერი"
        if (! $role->isSuperAdmin() && array_key_exists('permissions', $data)) {
            $role->permissions = $this->cleanPermissions($data['permissions'] ?? []);
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
