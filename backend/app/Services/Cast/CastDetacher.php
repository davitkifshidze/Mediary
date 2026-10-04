<?php

namespace App\Services\Cast;

use App\Models\AuditLog;
use App\Models\CastMember;
use App\Models\TrashEntry;
use App\Services\Audit\AuditLogger;
use App\Support\MediaDomain;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * **მსახიობის მოხსნა ჩანაწერიდან — ერთი გზა (Tasks §16 → §35.2).**
 *
 * ორი გამომძახებელი: ჩანაწერის მსახიობების სია (`RecordCastController::destroy()`)
 * და `/actors`-ის მენიუს „წაშლა ჩემი ჩანაწერებიდან" (`ActorController`), რომელიც
 * ერთ მსახიობს **ყველა** ჩემს ჩანაწერზე ხსნის. ⚠️ ორი ასლი ზუსტად ის იქნებოდა,
 * რაც ერთ დღეს გაიყოფა: ერთი საფლავის ქვას დასვამდა, მეორე — არა, და TMDB-ის
 * შემდეგი სინქრონი „წაშლილს" ჩუმად დააბრუნებდა.
 *
 * ⚠️ **TMDB-ის მსახიობზე ბმული საფლავის ქვად რჩება** (`is_removed`), თორემ
 * სინქრონი მას უკან დააბრუნებდა; ხელით შექმნილზე ბმული ნამდვილად იშლება.
 *
 * ⚠️ **ურნა (Tasks §29, ეტაპი 2)** — `castables`-ს `id` არ აქვს, ე.ი. რიგი ურნაში
 * საკუთარი `trashed_at`-ით ვერ გადავა: მოხსნა `trash_entries`-ში იწერება.
 * აღდგენა TMDB-ის მსახიობზე საფლავის ქვას ხსნის, დანარჩენზე ბმულს ამავე როლით
 * თავიდან სვამს. ⚠️ საფლავის ქვა ურნის საბოლოო წაშლის შემდეგაც რჩება — სწორედ
 * ის უშლის TMDB-ს მის დაბრუნებას.
 */
final class CastDetacher
{
    public function __construct(private readonly AuditLogger $audit) {}

    /** მოხსნა; `false` — ეს მსახიობი ამ ჩანაწერზე (უკვე) არ არის */
    public function detach(Model $record, CastMember $member): bool
    {
        $link = $record->cast()->whereKey($member->id)->first();

        if ($link === null) {
            return false;
        }

        $tombstone = (bool) $member->tmdb_person_id;

        DB::transaction(function () use ($record, $member, $link, $tombstone) {
            if ($tombstone) {
                $record->castLinks()->updateExistingPivot($member->id, ['is_removed' => true]);
            } else {
                $record->castLinks()->detach($member->id);
            }

            self::forgetTrashed($record, $member->id);

            TrashEntry::withoutGlobalScope('owner')->create([
                'user_id' => $record->user_id,
                'kind' => 'cast_link',
                'record_type' => $record->getMorphClass(),
                'record_id' => $record->getKey(),
                'slot' => (string) $member->id,
                'label' => $member->name,
                'payload' => [
                    'cast_member_id' => (int) $member->id,
                    'character' => $link->pivot->character,
                    'billing_order' => (int) $link->pivot->billing_order,
                    'is_manual' => (bool) $link->pivot->is_manual,
                    'is_hidden' => (bool) $link->pivot->is_hidden,
                    'is_edited' => (bool) $link->pivot->is_edited,
                    'tombstone' => $tombstone,
                    'photo_path' => $member->photo_path,
                ],
                'trashed_at' => now(),
            ]);
        });

        $this->log($record, $member, AuditLog::ACTION_CAST_DETACH, ['sync_blocked' => $tombstone]);

        return true;
    }

    /** ამ ჩანაწერზე ამ მსახიობის ძველი ურნის ჩანაწერი — ერთ ბმულზე ურნაში ერთი ელემენტია */
    public static function forgetTrashed(Model $record, int $castMemberId): void
    {
        TrashEntry::withoutGlobalScope('owner')
            ->where('kind', 'cast_link')
            ->where('record_type', $record->getMorphClass())
            ->where('record_id', $record->getKey())
            ->where('slot', (string) $castMemberId)
            ->delete();
    }

    /**
     * მიბმა/მოხსნა აუდიტში.
     *
     * ⚠️ **`castables` მოდელი არაა**, ე.ი. `AuditObserver` მას ვერ ხედავს —
     * ერთადერთი გზა ცხადი ჩაწერაა. ⚠️ სუბიექტი **ჩანაწერია და არა
     * მსახიობი**: „ვინ დაამატა ეს მსახიობი ამ ფილმს" ფილმის ისტორიის
     * ნაწილია, ლექსიკონი კი გლობალურია და მასზე „ვისი" კითხვა არ დგას.
     *
     * ⚠️ **`cast_update`-ს ძველი და ახალი მნიშვნელობები ახლავს** (Tasks §16) —
     * ზუსტად ის, რასაც ლოგის diff-ის ფანჯარა კითხულობს. `$member` ცარიელია
     * მთელი სიის გადალაგებაზე: იქ ერთი ადამიანი კი არა, რიგი შეიცვალა.
     *
     * @param  array<string, mixed>  $context
     * @param  array<string, mixed>|null  $old
     * @param  array<string, mixed>|null  $new
     */
    public function log(Model $record, ?CastMember $member, string $action, array $context = [], ?array $old = null, ?array $new = null): void
    {
        $this->audit->log($action, [
            'module' => MediaDomain::typeOf($record),
            'subject_type' => $record->getMorphClass(),
            'subject_id' => $record->getKey(),
            'subject_label' => $record->title_en ?: $record->title_ka,
            'old_values' => $old,
            'new_values' => $new,
            'context' => [
                ...($member ? ['cast_member_id' => $member->id, 'cast_member' => $member->name] : []),
                ...$context,
            ],
        ]);
    }
}
