<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * მოდულის შიდა უფლება (Tasks 1.6 / 19.8) — `permission:movie` ან `permission:movie,update`.
 *
 * `module:` middleware ამოწმებს **წვდომას** (მოდული ჩართულია თუ არა), ეს კი —
 * **რის უფლება აქვს შიგნით**. ორივე სჭირდება და ერთმანეთს არ ცვლის.
 *
 * მოქმედება მითითების გარეშე HTTP მეთოდიდან იგება. `_method`-ის spoofing-ს
 * `Request::getMethod()` თვითონ ითვალისწინებს, ე.ი. `POST + _method=PUT` = `update`.
 */
class EnsureModulePermission
{
    /**
     * POST, რომელიც სინამდვილეში არსებულ ჩანაწერს ცვლის და არა ახალს ქმნის.
     * მისამართის ბოლო სეგმენტით ვცნობთ (`/movies/12/resync`).
     */
    /* ⚠️ `unlock`/`lock` (2026-09-16) — ალბომის გახსნა/ჩაკეტვა **არსებულ**
       ჩანაწერს ეხება; მათ გარეშე POST-იდან `create` გამოიყვანებოდა და
       view+update უფლების მქონე user-ს საკუთარი ალბომი 403-ით დაეხურებოდა. */
    /* ⚠️ `move` (Tasks SEC-07, 2026-09-17) — `POST /gallery/images/move`
       **არსებულ** ფოტოებს მშობელს/ალბომს უცვლის (ჩაკეტილ ალბომში/ალბომიდან
       ჩათვლით, ე.ი. დამალვა/გამოჩენა). სიის გარეშე `create`-ად იკითხებოდა:
       create-only როლი სხვის ნებართვის გარეშე ფოტოებს აჩრადავდა, update-only
       კი ცრუ 403-ს იღებდა. ⚠️ **როუტზე ცხადი `permission:gallery,update`
       აქ არ შველის** — ჯგუფის `permission:gallery` რჩება და **ორივე**
       ეშვება, ე.ი. update-only როლი ისევ 403-ს მიიღებდა. */
    private const UPDATE_ENDPOINTS = ['resync', 'watched', 'played', 'visited', 'bulk-status', 'bulk', 'reorder', 'primary', 'download', 'unlock', 'lock', 'move'];

    public function handle(Request $request, Closure $next, string $module, ?string $action = null): mixed
    {
        // `@type` — გაზიარებული endpoint-ები დომენს `type` პარამეტრიდან იღებენ.
        // ⚠️ ჯერ **route**-ის პარამეტრი და მერე input: `/media/sync/series/5`-ზე
        // ტიპი მისამართშია და არა body-ში, ე.ი. მხოლოდ input-ის კითხვა სერიალზე
        // ჩუმად `movie`-ის უფლებას ამოწმებდა (იგივე რიგი, რაც EnsureModuleEnabled-ს).
        if ($module === '@type') {
            $module = (string) ($request->route('type') ?? $request->input('type') ?? 'movie');
        }

        $action ??= $this->actionFor($request);

        if (! $request->user()?->hasPermission($module, $action)) {
            return response()->json(['message' => 'forbidden_permission', 'permission' => "{$module}.{$action}"], 403);
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
