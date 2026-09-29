<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\UploadLimits;
use Illuminate\Http\Request;

/**
 * **ატვირთვის ლიმიტები ინტერფეისისთვის** — `GET /api/uploads/limits`.
 *
 * ⚠️ **შესულის ეფექტური ლიმიტი** (Tasks §34.6): ინსტალაციის მნიშვნელობა ∪ მისი
 * პირადი გამონაკლისი. ინტერფეისი ზუსტად იმას წერს, რასაც სერვერი **ამ
 * მომხმარებლისგან** მიიღებს — ორ ანგარიშს ერთი და იგივე ღილაკი სხვადასხვა
 * ფორმატს შეიძლება უჩვენებდეს, და ეს სწორია.
 *
 * ⚠️ მოდულზე დამოკიდებული არაა: ლიმიტი აპისა და PHP-ის წესია და არა
 * ბიბლიოთეკის შიგთავსისა, ე.ი. `module:` ჯგუფს მიღმა დგას (პარამეტრების
 * გვერდსაც სჭირდება, ჩართული მოდულის გარეშეც).
 */
class UploadLimitController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(['data' => [
            ...UploadLimits::all($request->user()),
            // რედაქტორი მხოლოდ სუპერადმინისაა (§34.2); სხვებს — კითხვა და მოთხოვნა
            'can_edit' => $request->user()->isSuperAdmin(),
        ]]);
    }
}
