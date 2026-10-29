<?php

namespace App\Support;

use App\Models\AuditLog;
use App\Models\User;

/**
 * **ჟურნალის პარამეტრები — რა იწერება**.
 *
 * შენი სიტყვები: „იყოს რაღაც ლოგის სამართავი მოდული, სადაც მოუნიშნავ, რაზე
 * ილოგებოდეს — შესვლა, დაწერა, რეფრეში, კლიკი, გახსნა… აბსოლუტურად ყველა
 * მოქმედების ჩართვა-გამორთვის უფლებები მინდა მქონდეს". თითო გადამრთველი
 * ერთ ან რამდენიმე `AuditLog::ACTION_*`-ს მართავს (`cast` — მსახიობის ოთხივე).
 *
 * ⚠️ **ნაგულისხმევად ყველაფერი ჩართულია** („ყოველი დაჭერა იწერება"), და
 * ბაზაში მხოლოდ **გამორთულების სია** დევს (`app_settings.audit.kinds` →
 * `['off' => […]]`) — `AppSettings`-ის წესი („ბაზაში მხოლოდ ცვლილება").
 * ახალი ტიპი ასე თავისით ჩართული იბადება.
 *
 * ⚠️ **ჩატის წაშლა დაცულია** (`AuditLog::PROTECTED_ACTIONS`) — მისი
 * გამორთვა შეუძლებელია: აღდგენის აღრიცხვა მხოლოდ ამ რიგშია.
 *
 * ⚠️ წაკითხვა `AppSettings::all()`-ის მოთხოვნის ქეშზე დგას — `AuditLogger`
 * ყოველი ჩაწერის წინ კითხულობს და ბაზას მეორედ აღარ ეკითხება.
 */
final class AuditSettings
{
    public const SETTING = 'audit.kinds';

    /** გადამრთველი → რომელ მოქმედებებს მართავს; რიგი ინტერფეისის რიგია */
    public const KINDS = [
        'login' => [AuditLog::ACTION_LOGIN],
        'login_failed' => [AuditLog::ACTION_LOGIN_FAILED],
        'logout' => [AuditLog::ACTION_LOGOUT],
        'register' => [AuditLog::ACTION_REGISTER],
        'visit' => [AuditLog::ACTION_VISIT],
        'refresh' => [AuditLog::ACTION_REFRESH],
        'open' => [AuditLog::ACTION_OPEN],
        'profile_visit' => [AuditLog::ACTION_PROFILE_VISIT],
        'click' => [AuditLog::ACTION_CLICK],
        'create' => [AuditLog::ACTION_CREATE],
        'update' => [AuditLog::ACTION_UPDATE],
        'delete' => [AuditLog::ACTION_DELETE],
        'restore' => [AuditLog::ACTION_RESTORE],
        'export' => [AuditLog::ACTION_EXPORT],
        'import' => [AuditLog::ACTION_IMPORT],
        'translate' => [AuditLog::ACTION_TRANSLATE],
        'cast' => [AuditLog::ACTION_CAST_ATTACH, AuditLog::ACTION_CAST_DETACH, AuditLog::ACTION_CAST_UPDATE, AuditLog::ACTION_CAST_SYNC],
        'chat_delete' => [AuditLog::ACTION_CHAT_DELETE],
    ];

    /** ვერ გამოირთვება */
    public const PROTECTED = ['chat_delete'];

    /** რას აგზავნის SPA თვითონ — ჩართულები `/auth/me`-ში მიდის, გამორთულზე ქსელში არაფერი */
    public const CLIENT_KINDS = ['visit', 'refresh', 'open', 'click'];

    /** ეს მოქმედება ახლა იწერება? (უცნობი მოქმედება — კი: ახალი ტიპი ჩუმად არ უნდა დაიკარგოს) */
    public static function enabled(string $action): bool
    {
        $kind = self::kindOf($action);

        return $kind === null || ! in_array($kind, self::off(), true);
    }

    /** @return list<string> გამორთული გადამრთველები */
    public static function off(): array
    {
        $stored = AppSettings::get(self::SETTING);
        $off = is_array($stored) && is_array($stored['off'] ?? null) ? $stored['off'] : [];

        // ⚠️ უცნობი გასაღები და დაცული — არასდროს (ხელით შეცვლილი ბაზაც ვერ გამორთავს)
        return array_values(array_filter(
            $off,
            fn ($kind) => is_string($kind) && isset(self::KINDS[$kind]) && ! in_array($kind, self::PROTECTED, true),
        ));
    }

    /** @return list<string> SPA-ს ჩართული ტიპები (`/auth/me` → `audit_kinds`) */
    public static function clientKinds(): array
    {
        return array_values(array_diff(self::CLIENT_KINDS, self::off()));
    }

    /**
     * გადამრთველების სია ინტერფეისისთვის.
     *
     * @return list<array{key: string, enabled: bool, protected: bool}>
     */
    public static function describe(): array
    {
        $off = self::off();

        return array_map(fn (string $kind) => [
            'key' => $kind,
            'enabled' => ! in_array($kind, $off, true),
            'protected' => in_array($kind, self::PROTECTED, true),
        ], array_keys(self::KINDS));
    }

    /**
     * შენახვა — მხოლოდ გამორთულები; ყველა ჩართულზე რიგი იშლება (ნაგულისხმევი).
     *
     * @param  list<string>  $off
     */
    public static function save(array $off, ?User $by = null): void
    {
        $off = array_values(array_unique(array_filter(
            $off,
            fn ($kind) => isset(self::KINDS[$kind]) && ! in_array($kind, self::PROTECTED, true),
        )));

        /* ⚠️ **ცვლილება ძველი პარამეტრებით იწერება** („ვინ გამორთო დაჭერები" ჟურნალში
           უნდა ჩანდეს): observer-ი ჩაწერის **შემდეგ** კითხულობს, და ცარიელი ქეში მას
           უკვე ახალ მნიშვნელობას აჩვენებდა — `create`-ის გამორთვა საკუთარ თავს არ
           ჩაწერდა. ამიტომ ქეში ჩაწერამდე ივსება; `put()`/`forget()` მას მერე ასუფთავებს. */
        self::off();

        $off === [] ? AppSettings::forget(self::SETTING) : AppSettings::put(self::SETTING, ['off' => $off], $by);
    }

    private static function kindOf(string $action): ?string
    {
        foreach (self::KINDS as $kind => $actions) {
            if (in_array($action, $actions, true)) {
                return $kind;
            }
        }

        return null;
    }
}
