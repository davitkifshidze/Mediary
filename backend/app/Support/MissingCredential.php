<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;

/**
 * **„შენი გასაღები არ გაქვს" — ერთი მანქანური კოდი ყველა წყაროზე** (Tasks §30.6).
 *
 * §30-მდე გასაღების არქონა სამნაირად ითქმოდა: `tmdb_not_configured` (503),
 * `rawg_unavailable` და `serpapi_unavailable` — ბოლო ორი **იმავე კოდით**, რაც
 * მკვდარ წყაროს ჰქონდა. საერთო გასაღების ფენის მოხსნის შემდეგ ეს ყოველდღიური
 * მდგომარეობა ხდება (ვისაც თავისი არ ჩაუწერია), ე.ი. „წყარო მიუწვდომელია"
 * ადამიანს სხვაგან გაგზავნიდა — მაშინ, როცა სწორი ქმედება ერთია: ჩაწერე
 * გასაღები „მონაცემებში". ორი ფაქტი, ორი კოდი (`bgg_unavailable`-ის წესი).
 *
 * ⚠️ **409 და არა 503**: 503 „სერვისი არ მუშაობს"-ს ნიშნავს, აქ კი სერვისს
 * არაფერი სჭირს — მოთხოვნა ანგარიშის **საკუთარ** მდგომარეობას ეჯახება
 * (`profile_not_public`-ის იგივე ფორმა).
 *
 * ⚠️ **`provider` პასუხშივე მიდის** — ინტერფეისი ტექსტში წყაროს სახელს სვამს
 * („TMDB-ის გასაღები არ გაქვს"), და რიგი ამ კოდზე ჩერდება: მომდევნო
 * ჩანაწერიც ზუსტად ასე ჩავარდებოდა.
 */
final class MissingCredential
{
    public const CODE = 'credential_missing';

    public const STATUS = 409;

    public static function response(string $provider): JsonResponse
    {
        // ⚠️ literal-ი განზრახ: `scripts/error-codes.mjs` კოდს სწორედ ამ ფორმით ეძებს
        return response()->json(['message' => 'credential_missing', 'provider' => $provider], self::STATUS);
    }
}
