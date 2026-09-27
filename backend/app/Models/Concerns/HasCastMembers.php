<?php

namespace App\Models\Concerns;

use App\Models\CastMember;
use App\Models\TrashEntry;
use Illuminate\Database\Eloquent\Relations\MorphToMany;

/**
 * ჩანაწერის მსახიობები — ფილმი, სერიალი, ანიმე (`castables`, Tasks §16).
 *
 * **ორი რელაცია ერთ ცხრილზე, და მათი განსხვავება ეს ფაილის აზრია:**
 *
 *  · `cast()` — ის, რაც ბიბლიოთეკაში **არსებობს**. წაშლილი (`is_removed`)
 *    აქ **საერთოდ არ ჩანს** — არც ჩანაწერის გვერდზე, არც მსახიობის
 *    ფილმოგრაფიაში, არც ძებნაში, გალერეასა და საჯარო პროფილზე. ფილტრი
 *    რელაციაზეა და არა გამომძახებელთან, რადგან ჩანაწერის მსახიობები
 *    ორმოცამდე ადგილას იკითხება (`load('cast')`, `whereHas('cast')`,
 *    `CastMember::whereHas('movies')`…) — ერთი დავიწყებული `where` წაშლილ
 *    ადამიანს სადღაც დააბრუნებდა. ⚠️ დამალული (`is_hidden`) აქ **ჩანს**:
 *    ის მხოლოდ ჩანაწერის სიიდან იმალება, ფაქტი კი — „ამ ფილმში თამაშობს" —
 *    ძალაში რჩება.
 *  · `castLinks()` — **ყველა** რიგი, „საფლავის ქვის" ჩათვლით. მხოლოდ იქ,
 *    სადაც წაშლილის დანახვა აუცილებელია: `CastSync::fromSource()` (რომ
 *    სინქრონიზაციამ ის ვერ დააბრუნოს), მიბმა (რომ ხელახლა დამატება
 *    აღდგენა იყოს და არა პირველადი გასაღების დარღვევა) და ჩანაწერის წაშლა.
 *
 * ⚠️ **`sync()`/`detach()` ფილტრიან რელაციაზე მცდარია** — Laravel მათ
 * `wherePivot`-საც უყენებს, ე.ი. `cast()->detach()` საფლავის ქვას ცხრილში
 * ორფნად დატოვებდა, `cast()->sync()` კი წაშლილს „ახლად" ჩასვამდა და
 * პირველად გასაღებზე დაეჯახებოდა.
 */
trait HasCastMembers
{
    /** pivot-ის ყველა სვეტი — ერთი სია ორივე რელაციისთვის */
    private const CAST_PIVOT = ['character', 'billing_order', 'is_manual', 'is_hidden', 'is_removed', 'is_edited'];

    /**
     * ⚠️ `morphs()` FK-cascade-ს არ ქმნის — ბმულები ხელით იხსნება, **საფლავის
     * ქვებიც**: ფილტრიანი `cast()->detach()` მათ ორფნად დატოვებდა.
     */
    protected static function bootHasCastMembers(): void
    {
        static::deleting(function ($record) {
            $record->castLinks()->detach();

            /* ⚠️ Tasks §29 — ამ ჩანაწერის ურნაში მყოფი მსახიობის ბმულებიც:
               ჩანაწერი აღარ არსებობს, ე.ი. მათი აღდგენა ვეღარსად მოხდება. */
            TrashEntry::withoutGlobalScope('owner')
                ->where('kind', 'cast_link')
                ->where('record_type', $record->getMorphClass())
                ->where('record_id', $record->getKey())
                ->delete();
        });
    }

    public function cast(): MorphToMany
    {
        return $this->castLinks()->wherePivot('is_removed', false);
    }

    public function castLinks(): MorphToMany
    {
        return $this->morphToMany(CastMember::class, 'castable')
            ->withPivot(self::CAST_PIVOT)
            ->orderByPivot('billing_order');
    }
}
