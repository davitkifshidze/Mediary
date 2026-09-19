<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\Audit\AuditLogger;
use App\Support\ResetLink;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

/**
 * **დავიწყებული პაროლის აღდგენა ადმინის ბმულით (FEAT-16) — საჯარო.**
 *
 * ორი endpoint-ია და ორივე ავტორიზაციის გარეთ დგას (ბმულით შემოსული
 * ადამიანი სწორედ იმიტომ მოვიდა, რომ შესვლა ვერ შეძლო):
 *
 *   1. `GET  /auth/reset/{token}` — ვისია და ჯერ მოქმედია?
 *   2. `POST /auth/reset/{token}` — ახალი პაროლი.
 *
 * ⚠️ **ვადაგასული ან უკვე გამოყენებული ბმული — 410 `reset_link_expired`**,
 * და არა 404: „ასეთი ბმული არასდროს ყოფილა" და „ბმულმა ვადა გაუშვა"
 * მომხმარებლისთვის სხვადასხვა ქმედებაა (მეორეზე ადმინს ახალს სთხოვს).
 *
 * ⚠️ **პასუხი ელფოსტას არ ატარებს** — მხოლოდ საჩვენებელ სახელს. ბმული
 * შეიძლება სხვის ხელში აღმოჩნდეს, და მაშინ მისამართის გაცემა ზედმეტია;
 * „ვისი ანგარიშია" კითხვას `display_name` ისედაც პასუხობს.
 *
 * ⚠️ **`throttle:login`-ის უკან დგას** — ტოკენი 48-სიმბოლოიანია, ე.ი.
 * გამოცნობა რეალური საფრთხე არაა, მაგრამ ჭერის გარეშე ეს ორი მარშრუტი
 * ერთადერთი ღია `POST`-ი იქნებოდა, რომელიც ბაზას ყოველ მოთხოვნაზე ეკითხება.
 */
class PasswordResetController extends Controller
{
    public function __construct(private AuditLogger $audit) {}

    public function show(string $token)
    {
        $user = ResetLink::resolve($token);

        abort_if(! $user, 410, 'reset_link_expired');

        return response()->json([
            'display_name' => $user->displayName(),
            'username' => $user->username,
        ]);
    }

    public function store(Request $request, string $token)
    {
        $data = $request->validate([
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);

        $user = ResetLink::resolve($token);

        abort_if(! $user, 410, 'reset_link_expired');

        /* ⚠️ **`remember_token` ნულდება.** პაროლი სწორედ იმიტომ იცვლება,
           რომ ძველი წვდომა საეჭვოა — `Auth::logoutOtherDevices()` კი აქ
           უვარგისია (ის მიმდინარე სესიას ეყრდნობა, აქ სესია საერთოდ არაა).
           დამახსოვრებული შესვლა მხოლოდ ამ სვეტზე დგას, ე.ი. მისი გასუფთავება
           ყველა „დამახსოვრებულ" მოწყობილობას თიშავს. */
        $user->forceFill([
            'password' => Hash::make($data['password']),
            'remember_token' => null,
        ])->save();

        // ერთჯერადობა: იმავე ბმულის მეორე გახსნა უკვე 410-ია
        ResetLink::forget($user);

        /* ⚠️ ჟურნალში მოქმედი **თვითონ მომხმარებელია** და არა ადმინი:
           ბმული ადმინმა გასცა (ეს ცალკე ჩანაწერია), პაროლი კი აქ შეიცვალა.
           `user_id`/`user_label` ცხადად იწერება, რადგან სესია არ არსებობს
           და `AuditLogger` მოქმედს `Auth::user()`-იდან კითხულობს. */
        $this->audit->log(AuditLog::ACTION_UPDATE, [
            'module' => 'account',
            'subject_type' => 'user',
            'subject_id' => $user->id,
            'subject_label' => $user->username,
            'user_id' => $user->id,
            'user_label' => $user->username,
            'new_values' => ['password' => 'reset_link'],
        ]);

        return response()->noContent();
    }
}
