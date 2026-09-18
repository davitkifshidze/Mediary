<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

/**
 * **ინტერფეისის ენა backend-საც სჭირდება** (Tasks GAP-12).
 *
 * ⚠️ **აპლიკაციის შეცდომებს ეს არ ეხება.** ისინი მანქანური კოდებია და მათ
 * `frontend/src/lib/errors.ts` თარგმნის (GAP-01-ის წესი) — თარგმანი
 * ბრაუზერშია, რადგან ერთსა და იმავე პასუხს ორ ენაზე ხატავენ. აქ მხოლოდ ის
 * ნახევარი წყდება, რომელსაც SPA ვერ დაფარავს: **Laravel-ის საკუთარი
 * ვალიდაციის ტექსტები** (`required`, `max`, `email`…), რომლებსაც ჩარჩო
 * თვითონ აწყობს და პასუხში მზა წინადადებად აგზავნის.
 *
 * ⚠️ **`Accept-Language`-ს SPA წერს და არა ბრაუზერი.** ბრაუზერის საკუთარი
 * ჰედერი ოპერაციულ სისტემას ასახავს და არა აპში არჩეულ ენას — ე.ი. ქართულ
 * ინტერფეისზე მჯდომი მომხმარებელი ინგლისურ ვალიდაციას მაინც მიიღებდა.
 * `lib/api.ts`-ის request-interceptor-ი მას `i18n.language`-იდან აგზავნის.
 *
 * ⚠️ **ენების სია დახურულია.** `App::setLocale()`-ში მოხვედრილი თვითნებური
 * სტრიქონი `lang/<რაღაც>` საქაღალდის ძებნას ნიშნავს, ე.ი. ჰედერი
 * გამოსაკვლევი ინსტრუმენტი გახდებოდა; უცნობი ენა უბრალოდ ნაგულისხმევს
 * ტოვებს.
 */
class SetAppLocale
{
    /** რაც `frontend/src/i18n`-ს აქვს — არც ერთით მეტი */
    public const SUPPORTED = ['ka', 'en'];

    public function handle(Request $request, Closure $next): Response
    {
        $locale = $this->pick($request->header('Accept-Language'));

        if ($locale !== null) {
            App::setLocale($locale);
        }

        return $next($request);
    }

    /**
     * `Accept-Language`-ის პირველი ცნობილი ენა.
     *
     * ⚠️ q-ფაქტორებით სრული დახარისხება განზრახ არ კეთდება: ჩვენი კლიენტი
     * ერთ სუფთა კოდს აგზავნის, ბრაუზერის გრძელ სიაში კი პირველი მაინც
     * ყველაზე სასურველია.
     */
    private function pick(?string $header): ?string
    {
        if (! $header) {
            return null;
        }

        foreach (explode(',', $header) as $part) {
            // `en-US;q=0.9` → `en`
            $tag = strtolower(trim(explode('-', explode(';', $part)[0])[0]));

            if (in_array($tag, self::SUPPORTED, true)) {
                return $tag;
            }
        }

        return null;
    }
}
