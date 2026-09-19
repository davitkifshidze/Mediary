<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * **უსაფრთხოების ჰედერები ყოველ პასუხზე (Tasks SEC-04, SEC-16).**
 *
 * ⚠️ ფაილის გაცემა `nosniff`-ს `SafeMime::response()`-ში თვითონაც აკეთებს — ეს
 * **მეორე** ფენაა: ნებისმიერი მომავალი endpoint, რომელიც ფაილს ან ტექსტს
 * აბრუნებს, ბრაუზერს „შიგთავსის გამოცნობის" (sniffing) საშუალებას არ
 * მისცემს, მაშინაც, თუ მისი ავტორი `SafeMime`-ს დაავიწყდება.
 *
 * ⚠️ **გლობალურია (`append`), და არა `api` ჯგუფზე** — ჯგუფის middleware
 * throttle/auth-ის უარყოფით პასუხებს არ ფარავს, და `/sanctum/csrf-cookie`
 * `api` ჯგუფში არ არის. ⚠️ `/storage/*` სტატიკურ ფაილებს ეს **არ** ეხება:
 * მათ PHP-ის built-in სერვერი/Apache Laravel-ის გარეშე აწვდის.
 *
 * ⚠️ **`frame-ancestors`/`X-Frame-Options` ვის *გვსვამს* ჩარჩოში და არა იმას,
 * თუ ჩვენ რას ვსვამთ** — YouTube/Vimeo-ს `<iframe>`-ებს (`VideoEmbed`,
 * `PlayerStage`) ეს ჰედერები არ ეხება. clickjacking-ს ორივე გზით ვკეტავთ:
 * `X-Frame-Options`-ს ძველი ბრაუზერები კითხულობენ, `frame-ancestors`-ს — ახლები.
 *
 * ⚠️ **სრული CSP აქ განზრახ არ იწერება**: SPA-ს HTML-ს Laravel არ ემსახურება
 * (`dist/` Apache-ზეა — README-ის „Production"), ე.ი. `script-src`/`style-src`
 * ამ პასუხებზე არაფერს იცავს, ხოლო `/api/*`-ის JSON სკრიპტს არ ტვირთავს.
 *
 * ⚠️ **`Permissions-Policy`-ს სია მოკლეა და ეს გააზრებულია**: `autoplay`,
 * `fullscreen`, `encrypted-media`, `picture-in-picture`, `accelerometer` და
 * `clipboard-write` ცოცხალი ფუნქციებია (ფლეერის `autoplay=1`, ლაითბოქსი,
 * გასაღების კოპირება) — მათი გამორთვა მუშა ფუნქციას გატეხავდა. ჩამოთვლილია
 * მხოლოდ ის, რასაც აპი არასდროს იყენებს.
 */
class SetSecurityHeaders
{
    /** ჰედერი => მნიშვნელობა. უკვე დაყენებულს არ ვცვლით (`SafeMime`-ის წესი). */
    private const HEADERS = [
        'X-Content-Type-Options' => 'nosniff',
        'Content-Security-Policy' => "frame-ancestors 'none'",
        'X-Frame-Options' => 'DENY',
        'Referrer-Policy' => 'strict-origin-when-cross-origin',
        'Permissions-Policy' => 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        foreach (self::HEADERS as $name => $value) {
            if (! $response->headers->has($name)) {
                $response->headers->set($name, $value);
            }
        }

        return $response;
    }
}
