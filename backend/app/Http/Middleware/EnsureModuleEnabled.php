<?php

namespace App\Http\Middleware;

use App\Support\CustomModules;
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
            /* ⚠️ §37 — **სხვისი პირადი მოდული 404-ია და არა 403**: „ჩართული
               არ გაქვს" ნიშნავს, რომ ასეთი მოდული არსებობს, ეს კი თავად
               ინფორმაციაა (Q28). საკუთარი, ადმინის მიერ გამორთული კი ისევ
               403-ია — მფლობელმა იცის, რომ ის არსებობს (37.8). */
            if (CustomModules::isKey($key) && ! CustomModules::owns($user, $key)) {
                return response()->json(['message' => 'not_found'], 404);
            }

            return response()->json([
                'message' => 'module_not_enabled',
                'module' => $key,
            ], 403);
        }

        return $next($request);
    }
}
