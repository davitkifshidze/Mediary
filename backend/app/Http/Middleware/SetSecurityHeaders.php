<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * **`X-Content-Type-Options: nosniff` ყოველ პასუხზე (Tasks SEC-04).**
 *
 * ⚠️ ფაილის გაცემა ამას `SafeMime::response()`-ში თვითონაც აკეთებს — ეს
 * **მეორე** ფენაა: ნებისმიერი მომავალი endpoint, რომელიც ფაილს ან ტექსტს
 * აბრუნებს, ბრაუზერს „შიგთავსის გამოცნობის" (sniffing) საშუალებას არ
 * მისცემს, მაშინაც, თუ მისი ავტორი `SafeMime`-ს დაავიწყდება.
 *
 * ⚠️ **გლობალურია (`append`), და არა `api` ჯგუფზე** — ჯგუფის middleware
 * throttle/auth-ის უარყოფით პასუხებს არ ფარავს, და `/sanctum/csrf-cookie`
 * `api` ჯგუფში არ არის. ⚠️ `/storage/*` სტატიკურ ფაილებს ეს **არ** ეხება:
 * მათ PHP-ის built-in სერვერი/Apache Laravel-ის გარეშე აწვდის.
 */
class SetSecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! $response->headers->has('X-Content-Type-Options')) {
            $response->headers->set('X-Content-Type-Options', 'nosniff');
        }

        return $response;
    }
}
