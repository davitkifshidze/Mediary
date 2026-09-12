<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * **ადმინის სექციაზე წვდომა (Tasks 1.6)** — `admin_access:users`,
 * `admin_access:roles`, `admin_access:requests`.
 *
 * აქამდე ეს სამივე მყარად `super_admin`-ზე იყო. ახლა უფლება როლიდან მოდის
 * (`roles.permissions` → `admin:<resource>`), `super_admin` კი ისედაც
 * ყველგან გადის.
 *
 * ⚠️ **ყველა `/admin/*` არ გადმოსულა როლზე.** გლობალური და დესტრუქციული
 * ოპერაციები — `admin/modules`, `admin/purge` და ობოლი ფაილების
 * გასუფთავება — **განზრახ რჩება `super_admin`-ზე**: ისინი ერთი
 * ანგარიშის საზღვრებს სცდება (მოდულის გამორთვა ყველას ეხება, purge კი
 * სხვისი ბიბლიოთეკის წაშლაა).
 *
 * ⚠️ მოქმედება HTTP მეთოდიდან იგება, `EnsureModulePermission`-ის იმავე
 * წესით. `approve`/`reject` POST-ია, მაგრამ **არსებულს ცვლის**, ე.ი.
 * `update`-ია და არა `create` — თორემ „მოთხოვნების ნახვა+დამუშავების"
 * უფლების მქონე როლი ცრუ 403-ს მიიღებდა.
 */
class EnsureAdminAccess
{
    /** POST, რომელიც არსებულ ჩანაწერს ცვლის და არა ახალს ქმნის */
    private const UPDATE_ENDPOINTS = ['approve', 'reject', 'modules'];

    public function handle(Request $request, Closure $next, string $resource, ?string $action = null): Response
    {
        $action ??= $this->actionFor($request);

        if (! $request->user()?->hasAdminAccess($resource, $action)) {
            return response()->json([
                'message' => 'forbidden_permission',
                'permission' => "admin:{$resource}.{$action}",
            ], 403);
        }

        return $next($request);
    }

    private function actionFor(Request $request): string
    {
        return match ($request->method()) {
            'GET', 'HEAD' => 'view',
            'DELETE' => 'delete',
            'PUT', 'PATCH' => 'update',
            default => in_array($request->segment(count($request->segments())), self::UPDATE_ENDPOINTS, true)
                ? 'update'
                : 'create',
        };
    }
}
