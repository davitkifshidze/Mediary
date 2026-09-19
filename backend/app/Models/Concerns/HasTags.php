<?php

namespace App\Models\Concerns;

use App\Models\Video;

/**
 * **პირადი ტეგები (`tags` JSON) — ერთი ქცევა ცხრა მოდულზე.**
 *
 * ⚠️ **განსაზღვრება ერთია და ის `Video`-შია** (`normalizeTags`/`tagKey`);
 * ეს trait მხოლოდ დელეგატია. სწორედ ასე იყო აქამდეც — მაგრამ ხელით
 * გადაწერილი ორი-ორი ხაზი **ხუთ** მოდელში, და FEAT-18-ს კიდევ სამი
 * უნდა დაემატებინა: რვა ასლი ერთი დელეგატისა სწორედ ის დაშორებაა,
 * რომელსაც `DictionaryKey` სწავლობდა ცხრა ლექსიკონზე.
 *
 * ⚠️ **`Video` თვითონ არ იყენებს** — ის განსაზღვრებაა, ე.ი. საკუთარ თავზე
 * დელეგირება წრე იქნებოდა.
 *
 * ⚠️ **ნორმალიზაცია კონტროლერში ხდება და არა მუტატორში** (არსებული წესი):
 * `Model::create()`-ით პირდაპირ შექმნილი ჩანაწერი დუბლს **არ** ჭრის.
 * ეს ცნობილი და შეგნებული ხარვეზია — ფორმის მხარეს `dedupeTags()` პასუხობს.
 */
trait HasTags
{
    /**
     * @param  array<int, string>  $tags
     * @return array<int, string>
     */
    public static function normalizeTags(array $tags): array
    {
        return Video::normalizeTags($tags);
    }

    /** შედარების გასაღები — რეგისტრისა და ზედმეტი სივრცის გარეშე */
    public static function tagKey(string $tag): string
    {
        return Video::tagKey($tag);
    }
}
