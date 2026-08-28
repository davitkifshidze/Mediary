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
     * K14: „N მომხმარებელი"-ს ნაცვლად ჩანს, **ვის** აქვს ჩართული.
     * super_admin-ებიც ითვლებიან — მათ არა-sensitive მოდული pivot-ის გარეშეც აქვთ.
     */
    public function index()
    {
        $users = User::orderBy('id')->get();

        $modules = Module::orderBy('sort_order')->orderBy('id')->get()->each(function (Module $m) use ($users) {
            $holders = $users->filter(fn (User $u) => $u->hasModule($m->key));

            $m->users_count = $holders->count();
            $m->users_list = $holders->map(fn (User $u) => [
                'id' => $u->id,
                'display_name' => $u->displayName(),
                'is_super_admin' => $u->isSuperAdmin(),
                // ავტომატურად აქვს (super_admin, არა-sensitive) თუ ადმინმა ჩართო
                'implicit' => $u->isSuperAdmin() && ! $m->is_sensitive
                    && ! $u->modules()->where('modules.id', $m->id)->exists(),
            ])->values();
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
            'is_active' => ['sometimes', 'boolean'],
            'is_sensitive' => ['sometimes', 'boolean'],
            'enabled_by_default' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:9999'],
        ]);

        $module->forceFill($data)->save();

        return new ModuleResource($module);
    }
}
