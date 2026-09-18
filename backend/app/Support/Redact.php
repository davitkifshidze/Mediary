<?php

namespace App\Support;

/**
 * **საიდუმლოების ნიღბვა თავისუფალ ტექსტში** (Tasks SEC-14).
 *
 * ⚠️ **პრობლემა Guzzle-ის შეცდომის ტექსტია და არა ჩვენი კოდი.** კავშირის
 * ჩავარდნაზე (timeout, DNS, TLS) Guzzle გამონაკლისს **სრულ URL-ს** უწერს:
 * `cURL error 28: … for https://api.themoviedb.org/3/search/movie?api_key=<გასაღები>&query=…`.
 * მისი `redactUserInfo()` მხოლოდ `user:pass@`-ს ფარავს, query-ს არა — ე.ი.
 * ერთი timeout საერთო (`.env`) გასაღებს ან პასუხის `message`-ში, ან
 * `sources.log`-ში ტოვებდა.
 *
 * ⚠️ **ნიღბვა ერთ ადგილას წერია და არა თითო კლიენტში.** გარე წყარო ცხრაა,
 * გამონაკლისის ტექსტს კი ცხრავე ერთნაირად აწარმოებს — თითო კლიენტში ჩაწერილი
 * `preg_replace` სწორედ ის დუბლირებაა, რომლის ერთი დავიწყებული ასლიც
 * გასაღებს ჩუმად ჟონავს.
 *
 * ⚠️ **URL-ის `?`-მდე მოჭრა განზრახ არ გაკეთდა**: query-ში დიაგნოსტიკისთვის
 * საჭირო ველებიც ზის (`query=`, `page=`, `language=`) — „რატომ ვერაფერი
 * ვიპოვე"-ზე პასუხი სწორედ იქაა. იჭრება მხოლოდ ის პარამეტრები, რომლებიც
 * საიდუმლოა.
 */
class Redact
{
    /**
     * query-ის პარამეტრები, რომელთა მნიშვნელობაც არასდროს იწერება.
     *
     * ⚠️ **`key` აქ `api_key`-ის გამო არ არის** — ის დამოუკიდებლად TMDB-ის,
     * YouTube-ისა და Google-ის ფორმაა (`?key=…`). ორივე საჭიროა.
     */
    private const SECRET_PARAMS = [
        'api_key', 'apikey', 'key', 'token', 'access_token', 'auth_token',
        'client_secret', 'secret', 'password', 'pwd', 'signature', 'sig',
    ];

    public const MASK = '***';

    /**
     * ტექსტიდან საიდუმლოების ამოღება.
     *
     * იჭრება: (1) URL-ის query-ის საიდუმლო პარამეტრები, (2) `user:pass@`
     * ჰოსტამდე — Guzzle-ს ეს თვითონ აქვს, მაგრამ ტექსტი სხვა წყაროდანაც
     * მოდის (`SafeHttp`, ხელით აწყობილი მისამართები).
     */
    public static function secrets(?string $text): string
    {
        if ($text === null || $text === '') {
            return (string) $text;
        }

        $params = implode('|', self::SECRET_PARAMS);

        // `?api_key=abc&…` / `&key=abc` — მნიშვნელობა მთავრდება `&`-ზე,
        // ბრჭყალზე, ჰარეზე ან ტექსტის ბოლოს
        $text = preg_replace(
            '/(?<=[?&])('.$params.')=[^&\s"\'<>]*/i',
            '$1='.self::MASK,
            $text,
        ) ?? $text;

        // `https://user:pass@host` → `https://***@host`
        $text = preg_replace(
            '#(?<=://)[^/\s:@]+:[^/\s@]+@#',
            self::MASK.'@',
            $text,
        ) ?? $text;

        /*
         * ⚠️ **ტელეგრამის ბოტის ტოკენი query-ში არ ზის, არამედ გზაში**
         * (`/bot<id>:<secret>/sendMessage`), ე.ი. ზემოთა წესები მას ვერ დაიჭერდა. ეს
         * იყო ცოცხალი გაჟონვა: `TelegramNotifier` კავშირის ჩავარდნაზე გამონაკლისის
         * ტექსტს `note_notifications.error`-ში წერდა, რომელსაც მომხმარებელი ხედავს.
         */
        return preg_replace(
            '#/bot\d+:[A-Za-z0-9_-]+#',
            '/bot'.self::MASK,
            $text,
        ) ?? $text;
    }
}
