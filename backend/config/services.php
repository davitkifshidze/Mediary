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

    'tmdb' => [
        'key' => env('TMDB_API_KEY'),
    ],

    'anthropic' => [
        'key' => env('ANTHROPIC_API_KEY'),
        'model' => env('ANTHROPIC_MODEL', 'claude-sonnet-5'),
    ],

    /*
     | YouTube Data API v3 — არასავალდებულო (Tasks K2).
     | გასაღების გარეშე ვიდეოს სათაური და thumbnail oEmbed-ით მოდის;
     | გასაღებით დამატებით ხანგრძლივობა და ტეგებიც.
     */
    'youtube' => [
        'key' => env('YOUTUBE_API_KEY'),
    ],

    /*
     | RAWG.io — თამაშების წყარო (Tasks §11.4). არასავალდებულოა: კლავიშის
     | გარეშე მოდული სრულად მუშაობს, ველები კი ხელით ივსება (ინტერფეისი
     | ამას ცხადად წერს — „წყარო მიუწვდომელია", და არა „ვერაფერი მოიძებნა").
     */
    'rawg' => [
        'key' => env('RAWG_API_KEY'),
    ],

    /*
     | IGDB — თამაშების **სათადარიგო** წყარო (`DECISIONS.md` §7, 2026-09-06).
     |
     | ⚠️ ეს RAWG-ის **ჩანაცვლება არაა**: ერთვება მაშინ, როცა RAWG-ს კლავიში
     | არ აქვს ან შედეგი არ მოაქვს. ორივე არასავალდებულოა — ორივეს გარეშე
     | თამაშის ველები ხელით ივსება და ინტერფეისი ამას ცხადად წერს.
     |
     | ⚠️ IGDB Twitch-ის OAuth-ზეა: ორი საიდუმლო + ტოკენის განახლების ციკლი
     | (RAWG ერთ კლავიშს ითხოვს). სწორედ ამიტომ იყო RAWG ძირითადი არჩევანი.
     | კლავიშები აქ იშოვება: https://dev.twitch.tv/console/apps
     */
    'igdb' => [
        'client_id' => env('IGDB_CLIENT_ID'),
        'client_secret' => env('IGDB_CLIENT_SECRET'),
    ],

    /*
     | SerpApi — სურათების, ვიდეოებისა და (საჭიროებისას) წიგნების ძებნის
     | წყარო (Tasks §7.6). არასავალდებულოა: გასაღების გარეშე ეს წყაროები
     | სიაში საერთოდ არ ჩანს და დანარჩენი ყველაფერი ჩვეულებრივ მუშაობს
     | (`RAWG_API_KEY`-ის ზუსტი წესი).
     |
     | ⚠️ **250 ძებნა თვეში ანგარიშისაა და არა engine-ისა** — სურათი, ვიდეო
     | და წიგნი ერთი ბიუჯეტიდან ხარჯავს. ამიტომ მრიცხველი ერთია
     | (`Services\Serp\SerpApiClient`) და არა თითო მომხმარებელზე ერთი.
     |
     | ⚠️ `monthly_limit` მხოლოდ **ჩვენი** აღრიცხვის ჭერია. ნამდვილი რიცხვი
     | `GET https://serpapi.com/account`-იდან მოდის და ის გამოძახება კვოტას
     | **არ ხარჯავს**.
     */
    'serpapi' => [
        'key' => env('SERPAPI_KEY'),
        'monthly_limit' => env('SERPAPI_MONTHLY_LIMIT', 250),
    ],

];
