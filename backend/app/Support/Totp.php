<?php

namespace App\Support;

/**
 * **TOTP — RFC 6238 (FEAT-16).**
 *
 * ⚠️ **ბიბლიოთეკა განზრახ არ დაემატა.** მთელი ალგორითმი ორი ფუნქციაა:
 * base32-ის გაშიფვრა და `hash_hmac('sha1', …)`-ის დინამიური ჩამოჭრა
 * (HOTP, RFC 4226 §5.4) — ე.ი. ~40 ხაზი, რომელსაც სტანდარტის **საკუთარი
 * ტესტ-ვექტორები** ამოწმებს (`TotpTest`). ამ პროექტში ბიბლიოთეკა მაშინ
 * ემატება, როცა რთულ ნაწილს ის აკეთებს (recharts, react-aria); აქ რთული
 * ნაწილი არ არსებობს.
 *
 * ⚠️ **`hash_equals` და არა `===`** — კოდის შედარება დროზე დამოკიდებული
 * არ უნდა იყოს.
 *
 * ⚠️ **ფანჯარა ±1 ბიჯია (30 წმ).** ნული ნიშნავს, რომ ტელეფონისა და
 * სერვერის საათის რამდენიმეწამიანი სხვაობა შესვლას ჩუმად უშლის ხელს;
 * დიდი ფანჯარა კი ერთი კოდის სიცოცხლეს უსაფუძვლოდ აგრძელებს.
 */
final class Totp
{
    /** ბიჯი წამებში — ყველა ავთენტიფიკატორის ნაგულისხმევი */
    public const PERIOD = 30;

    /** ციფრების რაოდენობა — ასევე ნაგულისხმევი */
    public const DIGITS = 6;

    /** რამდენ ბიჯს ვუშვებთ წინ და უკან */
    public const WINDOW = 1;

    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    /**
     * ახალი საიდუმლო — 20 ბაიტი (160 ბიტი, RFC 4226-ის რეკომენდაცია),
     * base32-ში 32 სიმბოლო.
     */
    public static function secret(): string
    {
        return self::base32Encode(random_bytes(20));
    }

    /**
     * `otpauth://` მისამართი QR-ისთვის.
     *
     * ⚠️ **`issuer` ორჯერ წერია და ეს სწორია**: ლეიბლის პრეფიქსს ძველი
     * აპლიკაციები კითხულობენ, `issuer=` პარამეტრს — ახლები; მხოლოდ ერთი
     * ნაწილი ზოგ პროგრამაში ანგარიშს „უსახელოდ" ტოვებს.
     */
    public static function uri(string $secret, string $account, string $issuer): string
    {
        $label = rawurlencode($issuer).':'.rawurlencode($account);

        return 'otpauth://totp/'.$label.'?'.http_build_query([
            'secret' => $secret,
            'issuer' => $issuer,
            'algorithm' => 'SHA1',
            'digits' => self::DIGITS,
            'period' => self::PERIOD,
        ]);
    }

    /** სწორია თუ არა კოდი ახლა (ფანჯრის გათვალისწინებით) */
    public static function verify(string $secret, string $code, ?int $at = null): bool
    {
        $code = preg_replace('/\D/', '', $code) ?? '';

        if (strlen($code) !== self::DIGITS) {
            return false;
        }

        $counter = intdiv($at ?? time(), self::PERIOD);

        for ($i = -self::WINDOW; $i <= self::WINDOW; $i++) {
            if (hash_equals(self::at($secret, $counter + $i), $code)) {
                return true;
            }
        }

        return false;
    }

    /** HOTP ერთ მრიცხველზე — ღიაა, რადგან სტანდარტის ვექტორები სწორედ ამას ამოწმებს */
    public static function at(string $secret, int $counter): string
    {
        $key = self::base32Decode($secret);

        if ($key === '') {
            return str_repeat('-', self::DIGITS); // ვერასდროს დაემთხვევა ციფრებს
        }

        // მრიცხველი — 8 ბაიტი big-endian
        $hash = hash_hmac('sha1', pack('J', $counter), $key, true);

        // RFC 4226 §5.4 — დინამიური ჩამოჭრა
        $offset = ord($hash[19]) & 0x0F;
        $value = ((ord($hash[$offset]) & 0x7F) << 24)
            | (ord($hash[$offset + 1]) << 16)
            | (ord($hash[$offset + 2]) << 8)
            | ord($hash[$offset + 3]);

        return str_pad((string) ($value % (10 ** self::DIGITS)), self::DIGITS, '0', STR_PAD_LEFT);
    }

    /** აღდგენის კოდი — `xxxxx-xxxxx`, ორაზროვანი სიმბოლოების გარეშე */
    public static function recoveryCode(): string
    {
        return self::block().'-'.self::block();
    }

    private static function block(): string
    {
        // ⚠️ `0/O` და `1/I/L` ამოღებულია: კოდს ხელით ბეჭდავენ
        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        $out = '';

        for ($i = 0; $i < 5; $i++) {
            $out .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        return $out;
    }

    private static function base32Encode(string $bytes): string
    {
        $bits = '';

        foreach (str_split($bytes) as $byte) {
            $bits .= str_pad(decbin(ord($byte)), 8, '0', STR_PAD_LEFT);
        }

        $out = '';

        foreach (str_split($bits, 5) as $chunk) {
            $out .= self::ALPHABET[bindec(str_pad($chunk, 5, '0', STR_PAD_RIGHT))];
        }

        return $out;
    }

    private static function base32Decode(string $secret): string
    {
        // ⚠️ padding და ინტერვალები იშლება: მომხმარებელი საიდუმლოს ხელითაც წერს
        $secret = strtoupper(str_replace([' ', '-', '='], '', $secret));
        $bits = '';

        for ($i = 0, $n = strlen($secret); $i < $n; $i++) {
            $index = strpos(self::ALPHABET, $secret[$i]);

            if ($index === false) {
                return '';
            }

            $bits .= str_pad(decbin($index), 5, '0', STR_PAD_LEFT);
        }

        $out = '';

        foreach (str_split($bits, 8) as $chunk) {
            if (strlen($chunk) === 8) {
                $out .= chr(bindec($chunk));
            }
        }

        return $out;
    }
}
