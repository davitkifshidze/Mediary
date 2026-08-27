<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) — Mediary
    |--------------------------------------------------------------------------
    | frontend (React SPA) ცალკე დომენზეა (dev: http://localhost:5173),
    | ამიტომ API-ს CORS სჭირდება. FRONTEND_URL იკითხება .env-იდან.
    */

    'paths' => ['api/*', 'storage/*', 'up'],

    'allowed_methods' => ['*'],

    'allowed_origins' => [
        env('FRONTEND_URL', 'http://localhost:5173'),
    ],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
