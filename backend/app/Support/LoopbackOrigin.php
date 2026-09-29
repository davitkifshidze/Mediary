<?php

namespace App\Support;

/**
 * **SPA-ს origin-ს მისი loopback-ტყუპიც ახლავს (2026-09-28).**
 *
 * ⚠️ **`localhost` და `127.0.0.1` ბრაუზერისთვის ორი სხვადასხვა საიტია.**
 * Vite `127.0.0.1:5173`-ზე უსმენს და იმავე მისამართს ბეჭდავს, `FRONTEND_URL`
 * კი `localhost:5173`-ს ასახელებს — ე.ი. ტყუპის გარეშე იქიდან გახსნილ აპს
 * CORS ყველა პასუხს უბლოკავდა და login „სერვერს ვერ დავუკავშირდი"-თი
 * მთავრდებოდა, თუმცა სერვერი მუშაობდა.
 *
 * ⚠️ **ეს მხოლოდ ნახევარია.** მეორე ნახევარი SPA-შია (`lib/apiUrl.ts`):
 * API-ს ჰოსტი გვერდის სახელს მიჰყვება, თორემ `127.0.0.1`-ის გვერდი
 * `localhost:8000`-ს ისევ სხვა საიტად მიმართავდა და Sanctum-ის
 * `SameSite=Lax` ქუქის ბრაუზერი საერთოდ არ შეინახავდა.
 *
 * ⚠️ **ტყუპი მხოლოდ ამ ორ სახელს ჰყავს.** სხვა ჰოსტი (`mediary.local`,
 * რეალური დომენი) ცნობიერი არჩევანია და მას არაფერი ემატება.
 */
final class LoopbackOrigin
{
    private const TWINS = ['localhost' => '127.0.0.1', '127.0.0.1' => 'localhost'];

    /** @return list<string> */
    public static function withTwin(string $origin): array
    {
        $host = parse_url($origin, PHP_URL_HOST);
        $host = is_string($host) ? strtolower($host) : null;

        if ($host === null || ! isset(self::TWINS[$host])) {
            return [$origin];
        }

        $twin = (string) preg_replace('~//'.preg_quote($host, '~').'~i', '//'.self::TWINS[$host], $origin, 1);

        return [$origin, $twin];
    }
}
