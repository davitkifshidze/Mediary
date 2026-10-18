<?php

namespace App\Support;

use Illuminate\Contracts\Database\Eloquent\Builder;

/**
 * **ფორმატიანი ტექსტი — Markdown ტექსტად.**
 *
 * აღწერები (ყველა მოდულის, ორივე ენაზე), ჩანაწერის ტექსტი და ჩანიშვნები
 * SPA-ში TipTap-ის რედაქტორით იწერება და **Markdown-ის სტრიქონად** ინახება
 * იმავე `text` სვეტში. ⚠️ მიგრაცია არ სჭირდება: ძველი უბრალო ტექსტი
 * Markdown-შიც ტექსტია (ახალი ხაზები SPA-ში `breaks`-ით ჩანს).
 *
 * აქ სამი რამაა, რაც სერვერს ფორმატზე უნდა იცოდეს:
 *
 * 1. **ზღვარი ერთია** (`MAX`) — აღწერებს 5 000, 10 000, 20 000 ან საერთოდ
 *    არაფერი ედო (ფილმი/სერიალი/ანიმე), ფორმატი კი სიმბოლოებს ამატებს.
 *    ⚠️ 20 000 ჭერია და არა ნებისმიერი რიცხვი: `text` 64 KB-ია, ქართული ასო
 *    კი UTF-8-ში სამბაიტიანი — 21 845-ზე მეტი ასო MySQL-ის strict რეჟიმში
 *    შენახვას ჩააგდებდა (ფილმის აღწერას ეს ზღვარი აქამდე არ ჰქონდა).
 * 2. **ძებნა ფორმატის გარეშე** (`whereWords`) — აღწერაში ყოველი სიტყვა
 *    ცალკე იძებნება, ე.ი. „**რძე** და პური" „რძე და"-ზეც იპოვება: `**` ან
 *    ბმულის ფრჩხილი სიტყვებს შორის ფრაზის ძებნას აღარ არღვევს.
 * 3. **CSV უბრალო ტექსტია** (`plain`) — ცხრილში `**`, `#` და `[..](..)` ხმაურია;
 *    JSON-ის ექსპორტს Markdown რჩება, რადგან ის მონაცემია და უკან იტვირთება.
 */
final class RichText
{
    /** აღწერის ზღვარი — ყველა მოდულზე ერთი (SPA-ს სარკე: `lib/richText.ts`) */
    public const MAX = 20000;

    /** ჩანიშვნის ზღვარი (SPA-ს სარკე: `lib/richText.ts`) */
    public const NOTE_MAX = 5000;

    /** ექსპორტის ველები, რომლებიც Markdown-ია — CSV-ში უბრალო ტექსტად იწერება */
    public const FIELDS = ['description', 'description_ka', 'description_en'];

    /** ერთ ძებნაში რამდენი სიტყვა — უსასრულო `and like` მოთხოვნას არ ვაგებთ */
    private const MAX_WORDS = 8;

    /** აღწერის ვალიდაცია — ერთ ადგილას, რომ ზღვარი მოდულებს შორის აღარ დაშორდეს */
    public static function rules(): array
    {
        return ['nullable', 'string', 'max:'.self::MAX];
    }

    /**
     * ძებნა ფორმატის გარეშე: **ყოველი სიტყვა** სვეტში უნდა იყოს (`and`).
     *
     * ⚠️ ფრაზის ერთი `like` „**რძე** და"-ს „რძე და"-ზე ვერ იპოვიდა — სიტყვებს
     * შორის `**` დგას. სიტყვებად ძებნა ფორმატის ნიშნებს „ხტება" და თან
     * სიტყვების რიგს აღარ ითხოვს.
     */
    public static function whereWords(Builder $query, string $column, string $term): Builder
    {
        foreach (self::words($term) as $word) {
            $query->where($column, 'like', Like::contains($word));
        }

        return $query;
    }

    /** @return list<string> */
    public static function words(string $term): array
    {
        $words = preg_split('/\s+/u', trim($term), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return array_slice(array_values(array_unique($words)), 0, self::MAX_WORDS);
    }

    /**
     * Markdown → უბრალო ტექსტი (CSV).
     *
     * ⚠️ სრული პარსერი არაა და არც სჭირდება: ტექსტი ჩვენი რედაქტორისაა
     * (TipTap ტექსტს არ აქცევს, ახალ ხაზს `\n`-ით წერს) ან ძველი უბრალო ტექსტია.
     * სიის ნიშანი და ბმულის მისამართი **რჩება** — ცხრილში ორივე ინფორმაციაა.
     */
    public static function plain(?string $markdown): string
    {
        $text = str_replace(["\r\n", "\r"], "\n", (string) $markdown);
        $lines = [];
        $fence = false;

        foreach (explode("\n", $text) as $line) {
            // კოდის ბლოკი — ღობე ქრება, შიგთავსი უცვლელად რჩება
            if (preg_match('/^\s{0,3}(`{3,}|~{3,})/', $line)) {
                $fence = ! $fence;

                continue;
            }

            if ($fence) {
                $lines[] = $line;

                continue;
            }

            // ჰორიზონტალური ხაზი
            if (preg_match('/^\s{0,3}([-*_])(\s*\1){2,}\s*$/', $line)) {
                $lines[] = '';

                continue;
            }

            $line = (string) preg_replace('/^\s{0,3}(>\s?)+/', '', $line); // ციტატა
            $line = (string) preg_replace('/^\s{0,3}#{1,6}\s+/', '', $line); // სათაური
            $line = (string) preg_replace('/^(\s*)[*+]\s+/', '$1- ', $line); // სიის ნიშანი — ერთნაირად

            $lines[] = self::inline($line);
        }

        return trim((string) preg_replace("/\n{3,}/", "\n\n", implode("\n", $lines)));
    }

    /** ხაზის შიგნით: ბმული, კოდი, სქელი/დახრილი/გადახაზული, გაქცევა, ერთეულები */
    private static function inline(string $s): string
    {
        $s = (string) preg_replace('/!\[([^\]]*)\]\([^)]*\)/u', '$1', $s);
        $s = (string) preg_replace_callback(
            '/\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/u',
            fn (array $m) => $m[1] === '' || $m[1] === $m[2] ? $m[2] : "{$m[1]} ({$m[2]})",
            $s,
        );
        $s = (string) preg_replace('/<((?:https?|mailto):[^>\s]+)>/u', '$1', $s);
        $s = (string) preg_replace('/`+([^`]+)`+/u', '$1', $s);
        $s = (string) preg_replace('/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/u', '$2', $s);
        $s = (string) preg_replace('/(?<![\p{L}\p{N}*])\*(?=\S)(.+?)(?<=\S)\*(?![\p{L}\p{N}*])/u', '$1', $s);
        $s = (string) preg_replace('/(?<![\p{L}\p{N}_])_(?=\S)(.+?)(?<=\S)_(?![\p{L}\p{N}_])/u', '$1', $s);
        $s = (string) preg_replace('/~~(?=\S)(.+?)(?<=\S)~~/u', '$1', $s);
        $s = (string) preg_replace('/( {2,}|\\\\)$/u', '', $s);
        $s = (string) preg_replace('/\\\\([\\\\`*_{}\[\]()#+\-.!>~|])/u', '$1', $s);

        return html_entity_decode(str_replace('&nbsp;', ' ', $s), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }
}
