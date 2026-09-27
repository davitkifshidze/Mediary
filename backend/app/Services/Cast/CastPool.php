<?php

namespace App\Services\Cast;

use App\Models\CastMember;
use App\Models\User;
use App\Support\Like;
use App\Support\MediaDomain;
use Illuminate\Database\Eloquent\Builder;

/**
 * **„ჩემი ჩანაწერების მსახიობები" — ერთი წყარო** (Tasks §39).
 *
 * ⚠️ **ორი მომხმარებელი და ერთი query**: გალერეის ჩამოტვირთვის „მსახიობების"
 * ტაბი (`GalleryController::castPoolQuery`) და მსახიობების მასობრივი
 * სინქრონიზაცია (`CastSyncController`). ორი ასლი ზუსტად ის იქნებოდა, რაც
 * გალერეამ ერთხელ უკვე გადაიტანა — `whereHas` მეორედ ეწერა და ანიმეს
 * რელაცია მასში ჩუმად `movies` იყო.
 *
 * ⚠️ `whereHas` მედია-მოდელზე `owner` global scope-ს იმემკვიდრეობს, ე.ი.
 * ავზი ავტომატურად **ამ user-ის** ბიბლიოთეკაა — `cast_members` კი
 * გლობალურია, ე.ი. უფილტრო სია სხვისი ჩანაწერების მსახიობებსაც მოიცავდა.
 * ⚠️ რელაციები წაშლილ ბმულს (`is_removed`) ფილტრავს და მედია-მოდელის
 * `trash` scope-იც მოქმედებს — ურნაში მდებარე ფილმის მსახიობი აქ არ ჩანს.
 *
 * ⚠️ **CLI-ზე `Auth::id()` არ არის**, ე.ი. `owner` scope გამორთულია და ავზი
 * **ყველა** ანგარიშის მსახიობები იქნებოდა — ამიტომ ეს მხოლოდ რექვესთის ან
 * `Auth::setUser()`-ით „ჩაცმული" job-ის შიგნით გამოიძახება.
 */
final class CastPool
{
    /**
     * @param  list<string>  $types  მედია-დომენები
     * @param  array<string, list<int>>|null  $recordIds  `null` = ამ დომენების **მთელი** ბიბლიოთეკა;
     *                                                    რუკა = მხოლოდ ეს ჩანაწერები
     */
    public static function query(array $types, ?array $recordIds = null, ?string $q = null): Builder
    {
        $pool = CastMember::query()->where(function ($w) use ($types, $recordIds) {
            foreach ($types as $type) {
                if (! MediaDomain::has($type)) {
                    continue;
                }

                $relation = MediaDomain::relation($type);

                if ($recordIds === null) {
                    $w->orWhereHas($relation);

                    continue;
                }

                $ids = $recordIds[$type] ?? [];

                if ($ids) {
                    $w->orWhereHas($relation, fn ($r) => $r->whereIn("{$relation}.id", $ids));
                }
            }

            // ⚠️ არცერთი დომენი/ჩანაწერი — ავზი **ცარიელია** და არა „ყველა"
            $w->orWhereRaw('1 = 0');
        });

        if ($q !== null && $q !== '') {
            // ⚠️ `name_ka` სვეტი არ არის (accessor-ია) — ქართული სახელი
            // `cast_member_translations`-შია, ე.ი. ძებნა ორივეზე უნდა გავიდეს
            $pool->where(function ($w) use ($q) {
                $w->where('name', 'like', Like::contains($q))
                    ->orWhereHas('translations', fn ($t) => $t->where('name', 'like', Like::contains($q)));
            });
        }

        return $pool;
    }

    /**
     * რომელი დომენების მსახიობების განახლება შეუძლია ამ მომხმარებელს.
     *
     * ⚠️ **მსახიობს მოდული არ აქვს** (`cast_members` გლობალური ლექსიკონია),
     * ე.ი. „ვის შეუძლია" ჩართული მედია-მოდული წყვეტს — ჩართული და `view`-ის
     * უფლებით: ავზი სწორედ ამ ბიბლიოთეკიდან მოდის, ხოლო ჩანაწერს თავად
     * არაფერი ეცვლება (იწერება TMDB-ის ფაქტი მსახიობზე — იგივე, რასაც მისი
     * გვერდის ღილაკი ყველას აძლევს).
     *
     * @param  list<string>|null  $requested
     * @return list<string>
     */
    public static function typesFor(User $user, ?array $requested = null): array
    {
        return array_values(array_filter(
            MediaDomain::enabledFor($user, $requested),
            fn (string $type) => $user->hasPermission($type, 'view'),
        ));
    }
}
