<?php

namespace App\Support;

use App\Models\CastMember;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * **ჩანაწერისა და მსახიობის ბმის ერთადერთი წერტილი (ეტაპი 1, 2026-09-13).**
 *
 * ორი საქმე აქვს და ორივე ისეთია, რომ ორ ადგილას დაწერილი ჩუმად გაშორდებოდა:
 *
 * 1. **წყაროდან სინქრონი ხელით დამატებულს არ შლის** (`fromSource()`).
 *    `MovieEnricher`, `TvEnricher` და `ItemSyncer` სამივე `->sync($sync)`-ს
 *    იძახდა, ე.ი. TMDB-ის სიის გარეთ დარჩენილი **ყველა** ბმული ითიშებოდა.
 *    ხელით დამატებული მსახიობი პირველივე `/sync`-ზე გაქრებოდა — უჩუმრად,
 *    შეცდომის გარეშე. ახლა სამივე ამ ფუნქციას ეძახის.
 *
 * 2. **ლექსიკონში დუბლი არ ჩნდება** (`resolve()`). `cast_members`
 *    **გლობალურია** (ერთი მსახიობი ყველა ანგარიშზე ერთი რიგია), ე.ი.
 *    „ხელით დამატებული" ადამიანი სხვისთვისაც იმავე რიგად უნდა დაჯდეს და
 *    არა მეათე ასლად. დამთხვევა ორ საფეხურზეა: ჯერ `tmdb_person_id`,
 *    მერე ნორმალიზებული სახელი (ორივე ენაზე).
 */
final class CastSync
{
    /**
     * წყაროდან (TMDB) მოსული ნაკრების ჩაწერა — **ხელით დამატებულის შენარჩუნებით**.
     *
     * @param  array<int, array{character?: string|null, billing_order?: int}>  $sync
     *                                                                                 `cast_member_id => pivot` — ზუსტად ის ფორმა, რასაც enricher-ები აწყობდნენ
     */
    public static function fromSource(Model $record, array $sync): void
    {
        foreach ($record->cast()->wherePivot('is_manual', true)->get() as $member) {
            if (isset($sync[$member->id])) {
                /* ⚠️ **ორივეგანაა → მაინც ხელითად ითვლება.** წყარომ დღეს
                   იცის ეს ადამიანი, ხვალ შეიძლება აღარ იცოდეს (TMDB-ის
                   კრედიტები იცვლება) — და მაშინ მომხმარებლის ცხადი
                   არჩევანი ისევ წაიშლებოდა. */
                $sync[$member->id]['is_manual'] = true;

                continue;
            }

            $sync[$member->id] = [
                'character' => $member->pivot->character,
                'billing_order' => $member->pivot->billing_order,
                'is_manual' => true,
            ];
        }

        $record->cast()->sync($sync);
    }

    /**
     * სახელის ნორმალიზება დამთხვევისთვის — რეგისტრი, ზედმეტი ჰარეები, პუნქტუაცია.
     *
     * ⚠️ **ტრანსლიტერაცია განზრახ არ ხდება**: „Keanu Reeves" და
     * „კიანუ რივზი" ერთი ადამიანია, მაგრამ მათი ავტომატური გატოლება
     * არასწორ შერწყმას გამოიწვევდა — ორივე სახელი ერთსა და იმავე რიგზე
     * ჯდება (`name` + ka თარგმანი) და დამთხვევაც თითოეულზე ცალკე მოწმდება.
     */
    public static function nameKey(string $name): string
    {
        return Str::squish(mb_strtolower(preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $name) ?? $name));
    }

    /**
     * არსებული მსახიობის პოვნა ლექსიკონში (დუბლის აცილება).
     *
     * @param  array<string, string|null>  $names  `['en' => …, 'ka' => …]`
     */
    public static function resolve(?int $tmdbPersonId, array $names): ?CastMember
    {
        if ($tmdbPersonId) {
            $byTmdb = CastMember::where('tmdb_person_id', $tmdbPersonId)->first();
            if ($byTmdb) {
                return $byTmdb;
            }
        }

        foreach ($names as $name) {
            if (! $name) {
                continue;
            }
            $key = self::nameKey($name);
            /* ⚠️ შედარება PHP-ში ხდება და არა SQL-ში: ქართულს `LOWER()`
               არ ეხება, `COLLATE`-ზე დაყრდნობა კი დრაივერს (MySQL vs sqlite)
               სხვადასხვა პასუხს დააბრუნებინებდა. სიის ზომა ლექსიკონია,
               ე.ი. ძებნა ვიწროა — პირველ სიმბოლოებზე `like`-ით. */
            $prefix = mb_substr($name, 0, 3);
            $candidates = CastMember::where('name', 'like', $prefix.'%')
                ->orWhereHas('translations', fn ($q) => $q->where('name', 'like', $prefix.'%'))
                ->limit(50)
                ->get();

            foreach ($candidates as $candidate) {
                if (self::nameKey($candidate->name) === $key) {
                    return $candidate;
                }
                foreach ($candidate->translations as $translation) {
                    if (self::nameKey((string) $translation->name) === $key) {
                        return $candidate;
                    }
                }
            }
        }

        return null;
    }
}
