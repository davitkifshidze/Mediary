<?php

use App\Support\LoopbackOrigin;

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) — Mediary
    |--------------------------------------------------------------------------
    | frontend (React SPA) ცალკე დომენზეა (dev: http://localhost:5173),
    | ამიტომ API-ს CORS სჭირდება. FRONTEND_URL იკითხება .env-იდან.
    | ⚠️ მას loopback-ტყუპიც ემატება (`localhost` ↔ `127.0.0.1`) —
    | რატომ, წერია `App\Support\LoopbackOrigin`-ში.
    */

    'paths' => ['api/*', 'storage/*', 'up', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => LoopbackOrigin::withTwin((string) env('FRONTEND_URL', 'http://localhost:5173')),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    // Sanctum-ის SPA (cookie) რეჟიმი — სესიის ქუქი cross-origin უნდა გაიგზავნოს
    'supports_credentials' => true,

];
