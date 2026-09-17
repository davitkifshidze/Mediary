<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\ModuleResource;
use App\Models\Module;
use App\Models\User;
use Illuminate\Http\Request;

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
    public function index()
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

        $modules = Module::orderBy('sort_order')->orderBy('id')->get()->each(function (Module $m) use ($users) {
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

    public function update(Request $request, Module $module)
    {
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
}
