<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;

/**
 * **ჩანაწერის სათაური — ნებისმიერი ტიპიდან, ერთი წესით.**
 *
 * სათაური სხვადასხვა მოდულში სხვადასხვა სვეტშია: ფილმს · სერიალს · ანიმეს ·
 * წიგნს · თამაშს ორენოვანი `title_ka`/`title_en` აქვს, ადგილსა და მსახიობს —
 * `name` (მსახიობს `name_ka`-ც), დანარჩენებს და პირად მოდულს — `title`.
 *
 * ⚠️ `title_en ?? title` წესი ადგილზე ცარიელს აბრუნებდა (`name` არ იკითხებოდა)
 * და ინტერფეისი `#12`-ს ხატავდა — ამიტომ ყველა გამომძახებელი აქედან კითხულობს.
 */
final class RecordTitle
{
    /** ძირითადი (ინგლისური ან ერთადერთი) სათაურის სვეტები, რიგით */
    private const BASE = ['title_en', 'title', 'name'];

    /** ქართული სათაურის სვეტები */
    private const KA = ['title_ka', 'name_ka'];

    /** @return array{title: ?string, title_ka: ?string} */
    public static function of(?Model $record): array
    {
        return [
            'title' => self::first($record, self::BASE),
            'title_ka' => self::first($record, self::KA),
        ];
    }

    /** ერთი წარწერა — ქართული, თუ არის */
    public static function label(?Model $record): ?string
    {
        $title = self::of($record);

        return $title['title_ka'] ?? $title['title'];
    }

    /** @param  list<string>  $attributes */
    private static function first(?Model $record, array $attributes): ?string
    {
        if ($record === null) {
            return null;
        }

        foreach ($attributes as $attribute) {
            $value = $record->{$attribute} ?? null;

            if (is_string($value) && trim($value) !== '') {
                return $value;
            }
        }

        return null;
    }
}
