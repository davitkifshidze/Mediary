<?php

namespace App\Support;

use App\Models\Anime;
use App\Models\Movie;
use App\Models\Series;

/**
 * **„ჩემი ქულა" — ერთი შკალა ყველა მოდულზე** (Tasks §9).
 *
 * შენი სიტყვები: „ყველგან ჩემი ქულა ისე იყოს, როგორც წიგნებშია —
 * ვარსკვლავები; და ხელითაც გაწერო… 4.6 / 10". ამიტომ შკალა ერთია —
 * **0-დან 10-მდე, მეათედებით** — და ვალიდაციაც ერთ ადგილას წერია: წიგნი,
 * თამაში, სამაგიდო, სიმღერა, ადგილი (`rating`) და ფილმი/სერიალი/ანიმე
 * (`my_rating`) ერთსა და იმავე წესს იძახებენ.
 *
 * ⚠️ **ფილმზე ორი სვეტია და ეს განზრახ არის (Q1).** `rating` TMDB-ის
 * საშუალოა — ის სინქრონიზაციით ივსება და მფლობელის აზრი არაა; „ჩემი ქულა"
 * ცალკე სვეტშია, რომ არც სინქრონიზაციამ გადაწეროს და არც ჩემმა ქულამ
 * TMDB-ის საშუალო „გააფუჭოს". `column()` სწორედ ამას პასუხობს: რომელ
 * სვეტში წერია **მფლობელის** ქულა ამ დომენზე.
 *
 * ⚠️ **ნული „ქულის გარეშეა" და არა „ყველაზე ცუდი"** — `ImportSource::rating()`-ის
 * იგივე წესი: რიცხვითი ველიდან 0-ის ჩაწერა ქულის წაშლაა, ვარსკვლავებით
 * კი ნული ვერც აირჩევა.
 */
final class Rating
{
    public const MAX = 10;

    /** @return list<string> */
    public static function rules(): array
    {
        return ['nullable', 'numeric', 'min:0', 'max:'.self::MAX];
    }

    /**
     * ფორმიდან/იმპორტიდან მოსული მნიშვნელობა → ბაზის ფორმა (მეათედამდე) ან `null`.
     */
    public static function normalize(mixed $value): ?float
    {
        if ($value === null || $value === '' || ! is_numeric($value)) {
            return null;
        }

        $value = round((float) $value, 1);

        if ($value <= 0) {
            return null;
        }

        return min((float) self::MAX, $value);
    }

    /**
     * რომელ სვეტშია **მფლობელის** ქულა ამ დომენზე — მედიაზე `my_rating`
     * (`rating` TMDB-ისაა), დანარჩენზე `rating`.
     */
    public static function column(string $domain): string
    {
        return MediaDomain::has($domain) ? 'my_rating' : 'rating';
    }

    /** იგივე — მოდელის მიხედვით (`MatchService`, `LibraryStats`) */
    public static function columnFor(object $record): string
    {
        return $record instanceof Movie || $record instanceof Series || $record instanceof Anime ? 'my_rating' : 'rating';
    }
}
