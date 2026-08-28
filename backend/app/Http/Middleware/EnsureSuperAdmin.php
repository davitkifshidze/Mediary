<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** /api/admin/* — მხოლოდ სუპერ-ადმინი (I4) */
class EnsureSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()?->isSuperAdmin()) {
            return response()->json(['message' => 'forbidden'], 403);
        }

        return $next($request);
    }
}
