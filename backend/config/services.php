<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
     | ⚠️ **გარე წყაროების გასაღებები აქ აღარ დგას (Tasks §30, Q38 — 2026-09-28).**
     |
     | TMDB, Gemini, RAWG, IGDB, SerpApi, Serper და YouTube აქამდე `env()`-ით
     | იკითხებოდა და ინსტალაციის „საერთო გასაღები" იყო. ახლა გასაღები
     | **მხოლოდ მომხმარებლისაა** (`user_credentials`, „მონაცემები"), ე.ი.
     | `backend/.env`-ში წყაროს საიდუმლო აღარ უნდა ეწეროს — `mediary:doctor`
     | ამაზე FAIL-ს აბრუნებს, `RegistryConsistencyTest` კი ამ ფაილს ამოწმებს.
     |
     | ⚠️ რაც საიდუმლო არაა (Gemini-ის მოდელი, დღიური/თვიური ლიმიტები), კოდის
     | ნაგულისხმევია: `App\Support\CredentialProviders::PROVIDERS`.
     */

];
