<?php

use App\Http\Middleware\EnsureAdminAccess;
use App\Http\Middleware\EnsureModuleEnabled;
use App\Http\Middleware\EnsureModulePermission;
use App\Http\Middleware\EnsureSuperAdmin;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // SPA cookie ავტორიზაცია: stateful დომენებიდან (SANCTUM_STATEFUL_DOMAINS)
        // მოსულ /api/* რექვესთს სესია + CSRF ემატება, დანარჩენი token-ით მუშაობს.
        $middleware->statefulApi();

        $middleware->alias([
            'module' => EnsureModuleEnabled::class,
            // მოდულის შიდა CRUD უფლება (Tasks 1.6) — `module`-ი წვდომაა, ეს კი უფლება
            'permission' => EnsureModulePermission::class,
            // ადმინის სექციაზე წვდომა როლიდან (Tasks 1.6) — `super_admin` ისედაც გადის
            'admin_access' => EnsureAdminAccess::class,
            'super_admin' => EnsureSuperAdmin::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
