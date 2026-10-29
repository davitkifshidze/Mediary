<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * **გათიშული ანგარიში ღია სესიით ვეღარ მუშაობს.**
 *
 * ⚠️ `is_active` აქამდე მხოლოდ შესვლისას მოწმდებოდა (`AuthController::login()`) —
 * ადმინის გათიშვის შემდეგ უკვე შესული ადამიანი არსებული ქუქით სრულ წვდომას
 * ინარჩუნებდა. აქ ყოველ API-მოთხოვნაზე: გათიშულზე სესია იხურება და პასუხი
 * **401 `account_disabled`**-ია — SPA 401-ზე თვითონ ბრუნდება შესვლის გვერდზე.
 *
 * ⚠️ ნაგულისხმევი (სესიის) გარდი — აპი მხოლოდ ქუქით მუშაობს (Sanctum SPA); ანონიმზე არაფერს აკეთებს.
 */
class EnsureActiveAccount
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // ⚠️ მკაცრად `false` — ჩაუტვირთავი ატრიბუტი (`null`) ბაზის ნაგულისხმევია, ე.ი. აქტიური
        if ($user && $user->is_active === false) {
            Auth::guard('web')->logout();

            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            return response()->json(['message' => 'account_disabled'], 401);
        }

        return $next($request);
    }
}
