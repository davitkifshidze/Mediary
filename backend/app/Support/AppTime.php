<?php

namespace App\Support;

use Carbon\CarbonInterface;
use DateTimeInterface;
use Illuminate\Support\Carbon;

/**
 * **ბაზაში ჩაწერილი მომენტის ზონა — ერთ ადგილას (Tasks §8).**
 *
 * ⚠️ **Eloquent ჩაწერისას ზონას *არ* გარდაქმნის, წაკითხვისას კი — ქმნის.**
 * `Model::fromDateTime()` Carbon-ს **მისივე** ზონის კედლის საათით ბეჭდავს,
 * ხოლო `asDateTime()` წაკითხულ სტრიქონს **აპლიკაციის** ზონით კითხულობს.
 * სანამ `config('app.timezone')` `UTC` იყო, ეს ორი ემთხვეოდა და ჩაწერილი
 * `->utc()` უვნებელი იყო; `Asia/Tbilisi`-ზე გადასვლისთანავე იგივე `->utc()`
 * **4 საათით ადრინდელ** მომენტს ჩაწერდა და წაკითხვისას ის სხვა დროდ
 * წაიკითხებოდა. ზუსტად ეს ორმაგი წანაცვლება იყო §8.4-ის რისკი.
 *
 * ⚠️ **ე.ი. „შენახვის ზონა" ჩაბეტონებული UTC არაა — ის აპლიკაციის ზონაა.**
 * ეს კლასი სწორედ ამ ერთი წინადადებისთვის არსებობს: ექვსი `->utc()`
 * გაფანტული იყო `NoteReminder`-ში, `ReminderDispatcher`-სა და
 * `TranslationUsage`-ში და თითოეული მათგანი ცალკე დასამახსოვრებელი
 * ხაფანგი გახდებოდა.
 *
 * ⚠️ **შედარებას ეს არ ცვლის** — Carbon მომენტებს ადარებს და არა კედლის
 * საათს. აქ მხოლოდ *წარმოდგენა* ნორმალდება, რომ ბაზაში ჩაწერილი სტრიქონი
 * იმავე ზონის იყოს, რომლითაც ის უკან იკითხება.
 *
 * ⚠️ **`TranslationUsage::QUOTA_TIMEZONE` ამას არ ექვემდებარება**: ის
 * Google-ის ლიმიტის ფანჯარაა (Pacific დღე) და ჩვენს ლოკაციასთან კავშირი
 * არ აქვს — იქ მხოლოდ **ბოლო** ნორმალიზება მოდის აქედან.
 */
final class AppTime
{
    /** აპლიკაციის (და ბაზის) ზონა */
    public static function zone(): string
    {
        return (string) config('app.timezone', 'UTC');
    }

    /** ახლა — შენახვის ზონაში */
    public static function now(): Carbon
    {
        return Carbon::now(self::zone());
    }

    /** ნებისმიერი მომენტი შენახვის ზონაში (ინსტანტი უცვლელია) */
    public static function at(DateTimeInterface|CarbonInterface|null $moment): ?Carbon
    {
        return $moment === null ? null : Carbon::instance($moment)->setTimezone(self::zone());
    }
}
