<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * `module:movie` — ჩაურთველი მოდულის route მიუწვდომელია (I3).
 * super_admin-ს ყველა აქტიური მოდული აქვს (იხ. User::hasModule()).
 */
class EnsureModuleEnabled
{
    public function handle(Request $request, Closure $next, string $key): Response
    {
        $user = $request->user();

        // `module:@type` — გაზიარებული endpoint-ები (/lookup, /discover, /media/sync/…)
        // დომენს `type` პარამეტრით იღებენ; მოდულიც მისი მიხედვით მოწმდება.
        if ($key === '@type') {
            $key = (string) ($request->route('type') ?? $request->input('type') ?? 'movie');
        }

        if (! $user || ! $user->hasModule($key)) {
            return response()->json([
                'message' => 'module_not_enabled',
                'module' => $key,
            ], 403);
        }

        return $next($request);
    }
}
