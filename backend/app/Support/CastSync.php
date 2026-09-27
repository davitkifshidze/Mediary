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
 * 1. **წყაროდან სინქრონი ადამიანის არჩევანს არ შლის** (`fromSource()`).
 *    `MovieEnricher`, `TvEnricher` და `ItemSyncer` სამივე `->sync($sync)`-ს
 *    იძახდა, ე.ი. TMDB-ის სიის გარეთ დარჩენილი **ყველა** ბმული ითიშებოდა.
 *    ხელით დამატებული მსახიობი პირველივე `/sync`-ზე გაქრებოდა — უჩუმრად,
 *    შეცდომის გარეშე. ახლა სამივე ამ ფუნქციას ეძახის. ⚠️ Tasks §16-იდან
 *    იგივე დაცვა აქვს დამალულს, წაშლილს და ხელით შეცვლილ როლსა და რიგს —
 *    ეს წესი **მხოლოდ აქ** ცხოვრობს.
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
     * წყაროდან (TMDB) მოსული ნაკრების ჩაწერა — **ადამიანის არჩევანის შენარჩუნებით**.
     *
     * ## წესი ერთი წინადადებაა: წყარო მართავს მხოლოდ იმ რიგებს, რომლებსაც ადამიანი არ შეხებია
     *
     * „შეხებული" რიგი ოთხგვარია (Tasks §16) და **ვერცერთს სინქრონიზაცია ვერ შლის**:
     *  · `is_manual` — ხელით მიბმული (ეტაპი 1);
     *  · `is_hidden` — დამალული. ⚠️ TMDB რომ მას სიიდან ამოიღებდეს და მერე
     *    დააბრუნებდეს (ზედა 12-ის ზღვარზე რიგი იცვლება), დამალვა დაიკარგებოდა
     *    და ადამიანი **ხილულად** დაბრუნდებოდა;
     *  · `is_edited` — როლი ან რიგი ადამიანმა დაწერა; ⚠️ TMDB-ის მნიშვნელობა
     *    მას **ზედ აღარ ეწერება**;
     *  · `is_removed` — წაშლილი („საფლავის ქვა"): რიგი რჩება ზუსტად იმისთვის,
     *    რომ წყარომ ის **ვეღარ დააბრუნოს**. TMDB-ის სიაში რომც იყოს — ხელუხლებელია.
     *
     * ხელუხლებელი რიგი ძველებურად იქცევა: სიაშია — TMDB-ის როლსა და რიგს
     * იღებს; სიიდან გავიდა — ითიშება.
     *
     * ⚠️ **ხელით დალაგებული სია ყინავს რიგს.** თუ ერთ რიგს მაინც `is_edited`
     * აქვს, არცერთი არსებული რიგის `billing_order` TMDB-იდან აღარ იწერება,
     * ახალი TMDB-მსახიობი კი **ბოლოში ემატება** (TMDB-ის შიდა თანმიმდევრობით).
     * სხვაგვარად ახალი ადამიანი TMDB-ის ნომრით შენი დალაგების შუაში ჩაჯდებოდა —
     * და შემდეგ სინქრონიზაციაზე უკვე არსებული რიგიც იმავე ნომერზე გადახტებოდა.
     *
     * ⚠️ **ორივეგან მყოფი ხელითად რჩება** — `is_manual` არ იცვლება: წყარომ
     * დღეს იცის ეს ადამიანი, ხვალ შეიძლება აღარ იცოდეს (TMDB-ის კრედიტები
     * იცვლება), და მაშინ მომხმარებლის ცხადი არჩევანი ისევ წაიშლებოდა.
     *
     * ⚠️ `sync()` **`castLinks()`-ზე** ეშვება და არა `cast()`-ზე: ფილტრიანი
     * რელაცია საფლავის ქვას „მიმდინარედ" ვერ დაინახავდა, ე.ი. მას ხელახლა
     * ჩასვამდა და პირველად გასაღებზე (`castables_primary`) დაეჯახებოდა.
     * ცარიელი ატრიბუტები (`[]`) ნიშნავს „დარჩეს როგორც არის" — `sync()`
     * ასეთ რიგს არც ხსნის და არც ანახლებს.
     *
     * @param  array<int, array{character?: string|null, billing_order?: int}>  $sync
     *                                                                                 `cast_member_id => pivot` — ზუსტად ის ფორმა, რასაც enricher-ები აწყობენ (TMDB-ის რიგით)
     */
    public static function fromSource(Model $record, array $sync): void
    {
        $links = $record->castLinks()->get();
        $live = $links->filter(fn (CastMember $m) => ! $m->pivot->is_removed);

        $arranged = $live->contains(fn (CastMember $m) => (bool) $m->pivot->is_edited);
        $next = $arranged ? (int) $live->max(fn (CastMember $m) => (int) $m->pivot->billing_order) + 1 : 0;

        $rows = [];

        foreach ($links as $member) {
            $pivot = $member->pivot;
            $source = $sync[$member->id] ?? null;
            unset($sync[$member->id]);

            $touched = $pivot->is_manual || $pivot->is_hidden || $pivot->is_edited || $pivot->is_removed;

            if ($source === null || $pivot->is_removed) {
                // შეხებული რჩება ხელუხლებლად; ხელუხლებელი და წყაროდან გასული — ითიშება
                if ($touched) {
                    $rows[$member->id] = [];
                }

                continue;
            }

            $update = [];
            if (! $pivot->is_edited) {
                $update['character'] = $source['character'] ?? null;

                if (! $arranged) {
                    $update['billing_order'] = $source['billing_order'] ?? 0;
                }
            }
            $rows[$member->id] = $update;
        }

        // წყაროს ახალი ადამიანები — ბიბლიოთეკაში ჯერ არ ყოფილან
        foreach ($sync as $id => $source) {
            $rows[$id] = [
                'character' => $source['character'] ?? null,
                'billing_order' => $arranged ? $next++ : ($source['billing_order'] ?? 0),
            ];
        }

        $record->castLinks()->sync($rows);
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
            // ⚠️ პრეფიქსიც იესკეიპება (DEBT-13)
            $escaped = Like::escape($prefix).'%';
            $candidates = CastMember::where('name', 'like', $escaped)
                ->orWhereHas('translations', fn ($q) => $q->where('name', 'like', $escaped))
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
