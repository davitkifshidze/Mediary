<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * **წელი/თვე SQL-ში, ორივე დრაივერზე (FEAT-08).**
 *
 * ⚠️ **ეს არსებობს იმიტომ, რომ ეს პროექტი ორ დრაივერზე ცხოვრობს**:
 * პროდაქშენში MySQL, ტესტებში sqlite `:memory:` (`phpunit.xml`). `year(x)`
 * sqlite-ს **არ აქვს**, `strftime('%Y', x)` კი MySQL-ს — ე.ი. ჩაწერილი
 * ერთი ვარიანტი ერთგან მუშაობდა და მეორეგან ჩუმად **ცარიელ ჯგუფს**
 * აბრუნებდა. იგივე გაყოფა, რაც FULLTEXT-ზე, `RAND(seed)`-ზე და
 * `jsonLike()`-ის უკუდახრილებზეა უკვე დაფიქსირებული.
 *
 * ⚠️ **`whereYear()` ამას არ ცვლის.** Laravel-ს **ფილტრზე** თავისი
 * აბსტრაქცია აქვს, **დაჯგუფებაზე** კი არა — `group by` გამოსახულებას
 * ითხოვს და სწორედ ის იწერება აქ.
 *
 * ⚠️ **სვეტის სახელი არასდროს მოდის მომხმარებლისგან.** ეს გამოსახულებები
 * `DB::raw()`-ში ჯდება, ე.ი. bindings მათ ვერ დაიცავს — გამომძახებელი
 * ყოველთვის საკუთარ, ჩაწერილ სვეტს გადმოსცემს (`LibraryStats`-ის რუკა).
 *
 * ⚠️ **სტრიქონი ბრუნდება და არა `Expression`.** გამომძახებელს ის
 * ალიასთან ერთად სჭირდება (`… as bucket`), `Expression` კი შეწებებას
 * არ ემორჩილება — და `pluck(Expression)` Laravel-ში სვეტის სახელად
 * იკითხება, ე.ი. `cast(strftime(…) as integer)` სახელით იძებნებოდა და
 * `Undefined property: stdClass::$integer)`-ით ვარდებოდა.
 */
final class SqlDate
{
    /** ოთხნიშნა წელი რიცხვად */
    public static function year(string $column): string
    {
        return self::sqlite()
            ? "cast(strftime('%Y', {$column}) as integer)"
            : "year({$column})";
    }

    /** თვე 1–12 რიცხვად */
    public static function month(string $column): string
    {
        return self::sqlite()
            ? "cast(strftime('%m', {$column}) as integer)"
            : "month({$column})";
    }

    private static function sqlite(): bool
    {
        return DB::connection()->getDriverName() === 'sqlite';
    }
}
