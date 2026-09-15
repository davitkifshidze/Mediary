<?php

namespace App\Support;

/**
 * **ტექსტის ნაჭერი დამთხვევის გარშემო** (ჯვარედინი ძებნა, 2026-09-14).
 *
 * ძებნის შედეგმა უნდა თქვას არა მხოლოდ „რომელ ჩანაწერში", არამედ „სად
 * ზუსტად" — ე.ი. აღწერიდან ის ფრაგმენტი, სადაც ნაძებნი სიმბოლოები დგას,
 * წინ და უკან რამდენიმე სიტყვით (`grep -C`-ის ლოგიკა).
 *
 * ⚠️ **ყველაფერი `mb_*`-ია.** `stripos`/`substr` ბაიტებს ითვლის — ქართულზე
 * ერთი ასო სამი ბაიტია, ე.ი. ნაჭერი ასოს შუაში გაიჭრებოდა და ტექსტი
 * გატეხილი სიმბოლოებით გამოჩნდებოდა.
 *
 * ⚠️ **სიტყვის ნახევარიც ნაჭრის ნაწილია.** „ინ" შეიძლება „ინფორმაციის"
 * შუაში იდგეს — ამიტომ დამთხვევის წინა ნაწილი ბოლო სიტყვამდე **არ** იჭრება:
 * თუ ისე მოხდა, ზუსტად ის სიტყვა დაიკარგებოდა, რომელშიც დამთხვევაა.
 *
 * ⚠️ **ნაპოვნი ტექსტი ხაზგასმული აქ არ ბრუნდება.** სერვერი HTML-ს არ წერს
 * (პროექტის მთავარი წესი — ნედლი მარკაპი არსად ინახება და არ გადაეცემა);
 * ხაზგასმა SPA-ს საქმეა, რომელიც იმავე სიტყვას თვითონ პოულობს ნაჭერში.
 */
final class Snippet
{
    /** რამდენი სიტყვა დარჩეს დამთხვევის თითო მხარეს */
    public const WORDS = 7;

    /** ერთი მხარის ჭერი სიმბოლოებში — ერთი გიგანტური „სიტყვა" (URL, minified ტექსტი) მთელ ნაჭერს არ უნდა შთანთქავდეს */
    private const SIDE_MAX_CHARS = 140;

    /**
     * დამთხვევის გარშემო ნაჭერი, ან `null` — თუ დამთხვევა არ არის.
     */
    public static function around(?string $text, string $term, int $words = self::WORDS): ?string
    {
        $text = self::flatten($text);
        $term = trim($term);

        if ($text === '' || $term === '') {
            return null;
        }

        $pos = mb_stripos($text, $term);
        if ($pos === false) {
            return null;
        }

        $length = mb_strlen($term);
        $match = mb_substr($text, $pos, $length);

        [$head, $headCut] = self::tail(mb_substr($text, 0, $pos), $words);
        [$tail, $tailCut] = self::head(mb_substr($text, $pos + $length), $words);

        return ($headCut ? '…' : '').$head.$match.$tail.($tailCut ? '…' : '');
    }

    /**
     * ერთ ხაზად და ერთი ჰარით — ახალი ხაზები და გამეორებული ჰარები ნაჭერში
     * ისედაც არაფერს ნიშნავს, სიგრძეს კი ტყუილად ჭამს.
     */
    public static function flatten(?string $text): string
    {
        return trim(preg_replace('/\s+/u', ' ', (string) $text) ?? '');
    }

    /** ბოლო `$words` სიტყვა (+ დამთხვევაზე მიწებებული ნახევარი სიტყვა) */
    private static function tail(string $text, int $words): array
    {
        if ($text === '') {
            return ['', false];
        }

        $parts = explode(' ', $text);
        // +1 — ბოლო ელემენტი შეიძლება დამთხვევის სიტყვის დასაწყისი იყოს
        $cut = count($parts) > $words + 1;
        $kept = implode(' ', array_slice($parts, -($words + 1)));

        if (mb_strlen($kept) > self::SIDE_MAX_CHARS) {
            $kept = mb_substr($kept, -self::SIDE_MAX_CHARS);
            $cut = true;
        }

        return [$kept, $cut];
    }

    /** პირველი `$words` სიტყვა (+ დამთხვევის სიტყვის ნარჩენი) */
    private static function head(string $text, int $words): array
    {
        if ($text === '') {
            return ['', false];
        }

        $parts = explode(' ', $text);
        $cut = count($parts) > $words + 1;
        $kept = implode(' ', array_slice($parts, 0, $words + 1));

        if (mb_strlen($kept) > self::SIDE_MAX_CHARS) {
            $kept = mb_substr($kept, 0, self::SIDE_MAX_CHARS);
            $cut = true;
        }

        return [$kept, $cut];
    }
}
