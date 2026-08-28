<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ModuleResource;
use App\Models\ApprovalRequest;
use App\Models\Module;
use Illuminate\Http\Request;

/**
 * მოდულების სია მიმდინარე მომხმარებლისთვის (I3).
 * ფრონტი ამით აგებს ნავიგაციასა და მარშრუტებს (lib/modules.tsx).
 */
class ModuleController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        // pivot-ის settings ყველა შემთხვევაში (super_admin-საც შეიძლება ჰქონდეს, მაგ. 18+ consent)
        $pivots = $user->modules()->get()->keyBy('id');

        // super_admin-ს ყველა არა-sensitive მოდული ავტომატურად აქვს (იხ. User::enabledModules)
        $enabledIds = $user->enabledModules()->pluck('id')->flip();

        $requests = ApprovalRequest::where('user_id', $user->id)
            ->where('type', ApprovalRequest::TYPE_MODULE)
            ->whereNotNull('module_id')
            ->orderByDesc('id')
            ->get()
            ->groupBy('module_id');

        $modules = Module::where('is_active', true)
            ->orderBy('sort_order')->orderBy('id')
            ->get()
            ->each(function (Module $m) use ($enabledIds, $requests, $pivots, $user) {
                $m->enabled = isset($enabledIds[$m->id]);
                // `granted` — ადმინმა ჩართო (ან super_admin-ია); `enabled` — ამჟამად ჩანს.
                // ორის სხვაობა = მომხმარებელმა თვითონ გამორთო (K13).
                $m->granted = $user->isGrantedModule($m->key);
                $m->request_status = $requests->get($m->id)?->first()?->status;
                $m->user_settings = json_decode($pivots->get($m->id)?->pivot?->settings ?? '', true) ?: [];
            });

        return ModuleResource::collection($modules);
    }

    /**
     * მოდულის ჩართვა/გამორთვა **საკუთარი თავისთვის** (K13).
     * ჩართვა მხოლოდ მაშინ, თუ უფლება უკვე აქვს — თორემ მოთხოვნა ადმინთან მიდის.
     */
    public function setEnabled(Request $request, string $key)
    {
        $module = Module::where('key', $key)->where('is_active', true)->firstOrFail();
        $user = $request->user();

        abort_unless($user->isGrantedModule($key), 403, 'module_not_granted');

        $data = $request->validate(['enabled' => ['required', 'boolean']]);

        $attrs = ['is_hidden' => ! $data['enabled']];
        // `enabled_at` მხოლოდ პირველად — გადართვა თარიღს არ ცვლის
        if (! $user->modules()->where('modules.id', $module->id)->exists()) {
            $attrs['enabled_at'] = now();
        }

        $user->modules()->syncWithoutDetaching([$module->id => $attrs]);

        return response()->json(['key' => $key, 'enabled' => $data['enabled']]);
    }

    /**
     * per-user per-module პარამეტრები (`module_user.settings`) —
     * მაგ. 18+ მოდულის consent (`consent_at`).
     */
    public function updateSettings(Request $request, string $key)
    {
        $module = Module::where('key', $key)->where('is_active', true)->firstOrFail();

        abort_unless($request->user()->hasModule($key), 403);

        $data = $request->validate(['settings' => ['required', 'array']]);

        $attrs = ['settings' => json_encode($data['settings'])];
        // `enabled_at` მხოლოდ პირველად (super_admin-ს pivot-ი შეიძლება საერთოდ არ ჰქონდეს)
        if (! $request->user()->modules()->where('modules.id', $module->id)->exists()) {
            $attrs['enabled_at'] = now();
        }

        $request->user()->modules()->syncWithoutDetaching([$module->id => $attrs]);

        return response()->json(['settings' => $data['settings']]);
    }
}
