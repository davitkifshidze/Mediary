<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\Audit\AuditLogger;
use App\Support\AppTime;
use App\Support\Totp;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

/**
 * **არჩევითი ორფაქტორიანი შესვლა (FEAT-16).**
 *
 * ჩართვა **ორნაბიჯიანია**: `POST /auth/2fa` საიდუმლოს ბადებს და QR-ს
 * აბრუნებს, `POST /auth/2fa/confirm` კი კოდით ადასტურებს. შუალედში
 * ანგარიში ჩვეულებრივ შედის — დადასტურებამდე მეორე ფაქტორი არ მოქმედებს,
 * თორემ ავთენტიფიკატორში ვერ ჩაწერილი საიდუმლო ანგარიშს სამუდამოდ კეტავს.
 *
 * ⚠️ **ყველა ცვლილება ანგარიშის პაროლს ითხოვს** (ჩართვის დაწყებაც,
 * გამორთვაც, კოდების განახლებაც): გახსნილ ტაბთან მისული ადამიანისთვის
 * მეორე ფაქტორის ჩუმად გამორთვა სწორედ ის ხვრელია, რომლის დახურვასაც
 * ეს მექანიზმი ცდილობს. იგივე წესი, რაც ალბომის ლოკს აქვს (§7.8).
 *
 * ⚠️ **საიდუმლო და კოდები პასუხში მხოლოდ ერთხელ გამოდის** — შემდეგ
 * `GET /auth/me` მხოლოდ „ჩართულია თუ არა"-ს ამბობს. ხელახლა ნახვა
 * შეუძლებელია განზრახ: დაკარგული კოდები ახლით იცვლება.
 */
class TwoFactorController extends Controller
{
    public function __construct(private AuditLogger $audit) {}

    /** ჩართვის დაწყება — ახალი (ჯერ დაუდასტურებელი) საიდუმლო + QR-ის მისამართი */
    public function store(Request $request)
    {
        $user = $request->user();
        $this->assertPassword($request);

        if ($user->hasTwoFactor()) {
            return response()->json(['message' => 'two_factor_already_enabled'], 422);
        }

        $secret = Totp::secret();

        $user->forceFill([
            'two_factor_secret' => $secret,
            'two_factor_recovery_codes' => null,
            'two_factor_confirmed_at' => null,
        ])->save();

        return response()->json([
            'secret' => $secret,
            'uri' => Totp::uri($secret, (string) ($user->email ?: $user->username), config('app.name')),
        ]);
    }

    /** დადასტურება — აქედან იწყებს მოქმედებას; პასუხში აღდგენის კოდები */
    public function confirm(Request $request)
    {
        $user = $request->user();

        $request->validate(['code' => ['required', 'string']]);

        if (! $user->two_factor_secret) {
            return response()->json(['message' => 'two_factor_not_started'], 422);
        }

        if (! Totp::verify((string) $user->two_factor_secret, (string) $request->input('code'))) {
            return response()->json(['message' => 'two_factor_code_invalid'], 422);
        }

        $codes = $user->regenerateRecoveryCodes();
        $user->two_factor_confirmed_at = AppTime::now();
        $user->save();

        // ⚠️ ლოგში მხოლოდ ფაქტი — არც საიდუმლო, არც კოდები (`AuditRegistry::HIDDEN`)
        $this->log($user->id, $user->username, 'enabled');

        return response()->json(['recovery_codes' => $codes]);
    }

    /** გამორთვა — პაროლით */
    public function destroy(Request $request)
    {
        $user = $request->user();
        $this->assertPassword($request);

        $user->forceFill([
            'two_factor_secret' => null,
            'two_factor_recovery_codes' => null,
            'two_factor_confirmed_at' => null,
        ])->save();

        $this->log($user->id, $user->username, 'disabled');

        return response()->json(['enabled' => false]);
    }

    /** კოდების განახლება — ძველები მყისვე კვდება */
    public function recoveryCodes(Request $request)
    {
        $user = $request->user();
        $this->assertPassword($request);

        if (! $user->hasTwoFactor()) {
            return response()->json(['message' => 'two_factor_not_enabled'], 422);
        }

        $codes = $user->regenerateRecoveryCodes();
        $user->save();

        $this->log($user->id, $user->username, 'recovery_codes');

        return response()->json(['recovery_codes' => $codes]);
    }

    /**
     * ⚠️ **`ValidationException`-ის ნაცვლად 422 კოდით** — ფრონტს ველის
     * ქვეშ დასახატი ტექსტი კი არა, ერთი ცნობილი კოდი სჭირდება
     * (`current_password_wrong` უკვე `lib/errors.ts`-შია).
     */
    private function assertPassword(Request $request): void
    {
        $request->validate(['password' => ['required', 'string']]);

        abort_if(
            ! Hash::check((string) $request->input('password'), $request->user()->password),
            422,
            'current_password_wrong',
        );
    }

    private function log(int $id, ?string $username, string $what): void
    {
        $this->audit->log(AuditLog::ACTION_UPDATE, [
            'module' => 'account',
            'subject_type' => 'user',
            'subject_id' => $id,
            'subject_label' => $username,
            'new_values' => ['two_factor' => $what],
        ]);
    }
}
