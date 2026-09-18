<?php

namespace App\Support;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * **გარე წყაროებთან საუბრის ერთი წერტილი** (აუდიტი 2026-09-14, §D).
 *
 * პროექტს ცხრა გარე კლიენტი აქვს (TMDB · RAWG · IGDB · Open Library · BGG ·
 * SerpApi · Serper · Wikimedia · ქართული მაღაზიები) და ყველა ერთი და იმავე
 * ნიმუშით მუშაობს: „წყარო არ პასუხობს" ≠ „ვერაფერი ვიპოვე". ეს წესი სწორია —
 * **პრობლემა ის იყო, რომ მიზეზი არსად რჩებოდა**:
 *
 * ⚠️ **ოცზე მეტი `catch (Throwable) { return null; }` სრულიად ჩუმი იყო**, და
 * მთელ `app/`-ში ნამდვილი `Log::` გამოძახება **ექვსი** იყო. „RAWG-მა რატომ
 * არაფერი დააბრუნა" — გასაღები გაქრა? timeout? 429? — `storage/logs`-ში
 * ერთი ხაზიც არ ეწერებოდა, ე.ი. პასუხი მხოლოდ კოდის კითხვით მიიღებოდა.
 *
 * ⚠️ **ცხრავე კლიენტის `get()` ერთ მეთოდად განზრახ არ გაერთიანდა.** ისინი
 * მხოლოდ ზედაპირულად ჰგვანან ერთმანეთს: BGG **XML**-ს აბრუნებს, მაღაზიები —
 * **HTML**-ს, IGDB **POST**-ით და APIcalypse-ის სხეულით მუშაობს, SerpApi-ს
 * კვოტის მრიცხველი აქვს. ერთი ხელოვნური ხელმოწერა ცხრავეს ჩაშლიდა.
 * გაზიარებულია **ზუსტად ის, რაც იდენტურია**: CA bundle და ჩავარდნის ჩაწერა.
 *
 * ⚠️ **CA bundle აქამდე თორმეტ ადგილას ეწერა ხელით.** Windows-ის cURL-ს
 * სერტიფიკატების სია არ აქვს (პროექტის ცნობილი წესი), ე.ი. ერთი დავიწყებული
 * `verify` ახალ კლიენტს ჩუმად ჩააგდებდა — ზუსტად ის, რასაც ეს ფაილი ხსნის.
 */
class SourceLog
{
    /** ცალკე არხი — გარე წყაროების ისტორია აპლიკაციის ხმაურში არ უნდა დაიკარგოს */
    public const CHANNEL = 'sources';

    /**
     * მზა HTTP-კლიენტი გარე წყაროსთვის.
     *
     * ⚠️ **timeout გამომძახებლისაა** და ნაგულისხმევი მხოლოდ საშუალოა:
     * BGG-ს 25 წამი სჭირდება, `/account`-ს — 15. ერთი გაზიარებული რიცხვი
     * ან ზედმეტად მკაცრი იქნებოდა, ან უაზროდ ნებიერი.
     */
    public static function request(int $timeout = 20, array $options = []): PendingRequest
    {
        return Http::timeout($timeout)->withOptions([
            'verify' => storage_path('cacert.pem'),
            ...$options,
        ]);
    }

    /**
     * ჩავარდნის ჩაწერა. **ყოველთვის `null`-ს აბრუნებს**, რომ გამომძახებელს
     * ერთ ხაზში ჩაეწეროს: `return SourceLog::failed('rawg', …);`
     *
     * ⚠️ **ეს შეცდომა არ არის და `error`-ად არ იწერება.** გარე წყაროს
     * ჩავარდნა ნორმალური მდგომარეობაა (ამიტომაც აბრუნებენ 503-ს და არა
     * 500-ს) — `warning` ზუსტად ამას ამბობს.
     *
     * @param  array<string, mixed>  $context
     */
    public static function failed(string $source, string $reason, array $context = []): null
    {
        Log::channel(self::CHANNEL)->warning("{$source}: {$reason}", self::clean($context));

        return null;
    }

    /**
     * გამონაკლისიდან — ტიპი და ტექსტი ერთად, რომ timeout 403-ისგან გაირჩეს.
     *
     * ⚠️ **ტექსტი ჯერ `Redact::secrets()`-ში გადის** (Tasks SEC-14): Guzzle
     * კავშირის ჩავარდნას **სრულ URL-ს** უწერს, ე.ი. `?api_key=…` პირდაპირ
     * `sources.log`-ში ხვდებოდა — ლოგი კი ასლთან ერთად სხვა მანქანაზე მიდის.
     * ნიღბვა **აქ** არის და არა გამომძახებელში: ცხრავე კლიენტი ერთსა და იმავე
     * გამონაკლისს აგდებს და ერთი დავიწყებული ასლი ჩუმად ჟონავს.
     */
    public static function threw(string $source, Throwable $e, array $context = []): null
    {
        $message = Redact::secrets($e->getMessage());

        return self::failed($source, class_basename($e).': '.mb_substr($message, 0, 300), $context);
    }

    /**
     * წარუმატებელი HTTP-სტატუსი.
     *
     * ⚠️ **სხეულის ნაწყვეტიც იწერება** — RAWG და SerpApi მიზეზს სწორედ
     * სხეულში წერენ („invalid api key"), სტატუსი კი მხოლოდ 401-ს იტყოდა.
     */
    public static function status(string $source, int $status, string $body = '', array $context = []): null
    {
        return self::failed($source, "HTTP {$status}", [
            ...$context,
            'body' => mb_substr(trim(Redact::secrets($body)), 0, 200) ?: null,
        ]);
    }

    /**
     * კონტექსტის სტრიქონებიც იწმინდება — გამომძახებლები იქ `url`/`path`-ს
     * წერენ და ზოგი მათგანი უკვე აწყობილი მისამართია.
     *
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private static function clean(array $context): array
    {
        return array_map(
            fn ($v) => is_string($v) ? Redact::secrets($v) : $v,
            $context,
        );
    }
}
