<?php

namespace App\Support;

use App\Models\AuditLog;
use App\Models\CastMember;
use App\Models\GalleryImage;
use App\Models\GalleryVideo;
use App\Models\TrashEntry;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\DB;

/**
 * **ხელით შექმნილი მსახიობის წაშლა — ურნაში, ერთ ელემენტად (Tasks §35.9, Q17 — „ა").**
 *
 * შენი გადაწყვეტილება: მხოლოდ **შენ მიერ ხელით შექმნილზე**; მსახიობი, მისი
 * ბმულები ჩანაწერებზე და ფოტოები **ერთად ქრება და ერთად ბრუნდება**, ურნის
 * ვადის ბოლოს კი სამუდამოდ იშლება (ატვირთული ფოტო საცავიდანაც).
 *
 * ⚠️ **ერთი ელემენტი** (`CustomModuleTrash`-ის ფორმა): `trash_entries`-ის ერთი
 * რიგი (`kind = cast_member`). მსახიობს `trashed_at` ესმება და `CastMember`-ის
 * `trash` scope მას ყველა კარიდან აქრობს — ბმულები (`castables`) ადგილზე რჩება
 * და ჩანაწერის მსახიობებიდან სწორედ ამით ქრება, აღდგენისას კი უცვლელად ბრუნდება.
 *
 * ⚠️ **ფოტოები და ვიდეო-ბმულები თავისი `trashed_at`-ით** — გალერეის ყველა სია
 * (`trash` scope) მათ ისე მალავს, რომ ცალ-ცალკე ფილტრი არსად სჭირდება; ურნაში
 * კი ცალკე არ ჩანს (`TrashBin::query()` მსახიობის ელემენტს მიაწერს), და
 * აღდგენისას **მხოლოდ ისინი** ბრუნდება, რაც მსახიობთან ერთად წავიდა (`payload`).
 * ადრე ცალკე წაშლილი ფოტო თავის ელემენტად რჩება.
 *
 * ⚠️ **საბოლოო წაშლა კოდია და არა კასკადი** — `TrashEntry`-ის `deleting`
 * მოვლენა `erase()`-ს იძახებს (ხელით წაშლა, დაცლა, ვადის გასვლა): მსახიობი
 * **მოდელით** იშლება, რომ გალერეა, ატვირთული ფოტო, კვოტა და ლოკი გათავისუფლდეს
 * (`CastMember::deleting`, `HasRecordLock`); `castables`, თარგმანები და ტეგები
 * FK-კასკადით მიჰყვება.
 */
final class CastMemberTrash
{
    public const KIND = 'cast_member';

    /** `trash_entries.record_type` — ელემენტი თვითონ მსახიობია */
    public const RECORD_TYPE = 'cast_member';

    /**
     * მსახიობი ურნაში — ბმულებთან და ჩემს ფოტოებთან ერთად.
     *
     * ⚠️ გამომძახებელი (`CastController::destroy()`) ამოწმებს, რომ მსახიობი ჩემი
     * ხელით შექმნილია (`isEditableBy()`) და არ არის დამალული (423).
     */
    public static function trash(User $owner, CastMember $member): TrashEntry
    {
        $ownerId = (int) $owner->getKey();
        $links = DB::table('castables')->where('cast_member_id', $member->getKey())->where('is_removed', false)->count();

        // ⚠️ ურნაში უკვე მყოფი ფოტო თავის ელემენტად რჩება — მსახიობთან მხოლოდ ცოცხალი გადადის
        $images = GalleryImage::withoutGlobalScopes()
            ->where('user_id', $ownerId)
            ->where('imageable_type', GalleryParent::ACTOR)
            ->where('imageable_id', $member->getKey())
            ->whereNull('trashed_at');
        $videos = GalleryVideo::withoutGlobalScopes()
            ->where('user_id', $ownerId)
            ->where('videoable_type', GalleryParent::ACTOR)
            ->where('videoable_id', $member->getKey())
            ->whereNull('trashed_at');

        $imageIds = (clone $images)->pluck('id')->map(fn ($id) => (int) $id)->all();
        $videoIds = (clone $videos)->pluck('id')->map(fn ($id) => (int) $id)->all();
        $bytes = (int) (clone $images)->sum('size');

        $entry = DB::transaction(function () use ($ownerId, $member, $links, $imageIds, $videoIds, $bytes) {
            $now = now();

            /* ⚠️ `update()`/`saveQuietly()` — მომხმარებლის რედაქტირება არ არის
               (`HasTrash`-ის წესი); ჟურნალში ქვემოთ ერთი რიგი იწერება. */
            GalleryImage::withoutGlobalScopes()->whereIn('id', $imageIds ?: [0])->update(['trashed_at' => $now]);
            GalleryVideo::withoutGlobalScopes()->whereIn('id', $videoIds ?: [0])->update(['trashed_at' => $now]);
            $member->forceFill(['trashed_at' => $now])->saveQuietly();

            return TrashEntry::withoutGlobalScope('owner')->create([
                'user_id' => $ownerId,
                'kind' => self::KIND,
                'record_type' => self::RECORD_TYPE,
                'record_id' => $member->getKey(),
                'label' => $member->name,
                'payload' => [
                    'name' => $member->name,
                    'name_ka' => $member->name_ka,
                    'photo_path' => $member->photo_path,
                    'links' => $links,
                    'image_ids' => $imageIds,
                    'video_ids' => $videoIds,
                    'bytes' => $bytes,
                ],
                'trashed_at' => $now,
            ]);
        });

        app(AuditLogger::class)->model($member, AuditLog::ACTION_DELETE, null, [
            'trashed' => true,
            'links' => $links,
            'photos' => count($imageIds),
        ]);

        return $entry;
    }

    /**
     * აღდგენა — მსახიობი ბრუნდება ბმულებითა და იმ ფოტოებით, რაც მასთან ერთად წავიდა.
     *
     * @return string|null უარის კოდი (`TrashBin::blocked()`-ის ენაზე) ან `null`
     */
    public static function restore(TrashEntry $entry): ?string
    {
        $member = self::memberOf($entry);

        if (! $member || $member->trashed_at === null) {
            return 'parent_missing';
        }

        $payload = (array) $entry->payload;

        DB::transaction(function () use ($member, $entry, $payload) {
            $member->forceFill(['trashed_at' => null])->saveQuietly();

            GalleryImage::withoutGlobalScopes()->whereIn('id', array_map('intval', (array) ($payload['image_ids'] ?? [])) ?: [0])
                ->update(['trashed_at' => null]);
            GalleryVideo::withoutGlobalScopes()->whereIn('id', array_map('intval', (array) ($payload['video_ids'] ?? [])) ?: [0])
                ->update(['trashed_at' => null]);

            // ⚠️ სვეტი უკვე ცარიელია — `deleting`-ის `erase()` მსახიობს აღარ შეეხება
            $entry->delete();
        });

        app(AuditLogger::class)->model($member, AuditLog::ACTION_RESTORE, null, ['trashed' => false]);

        return null;
    }

    /**
     * **საბოლოო წაშლა** — `TrashEntry::deleting`-იდან.
     *
     * ⚠️ ბმულების ურნის ელემენტები (`cast_link`) მსახიობის გარეშე აღარაფერს
     * აღადგენს — ისინიც იშლება. `withoutGlobalScopes()` — გასუფთავება CLI-დანაც
     * ეშვება (`Auth::id()` ცარიელია).
     */
    public static function erase(TrashEntry $entry): void
    {
        $member = self::memberOf($entry);

        if (! $member || $member->trashed_at === null) {
            return;
        }

        TrashEntry::withoutGlobalScope('owner')
            ->where('kind', 'cast_link')
            ->where('slot', (string) $member->getKey())
            ->delete();

        $member->delete();
    }

    /**
     * **ამ ანგარიშის ურნაში მყოფი მსახიობები** — `მსახიობის id => ელემენტის id`.
     * `StorageMeter::markTrash()` მათ ფაილებს ელემენტს მიაწერს, `TrashBin` კი
     * მათ ფოტოებს ცალკე აღარ აჩვენებს.
     *
     * @return array<int, int>
     */
    public static function entriesOf(User $user): array
    {
        return TrashEntry::withoutGlobalScope('owner')
            ->where('user_id', $user->getKey())
            ->where('kind', self::KIND)
            ->pluck('id', 'record_id')
            ->mapWithKeys(fn ($id, $memberId) => [(int) $memberId => (int) $id])
            ->all();
    }

    /** ელემენტის სათაური — სახელი ინტერფეისის ენაზე */
    public static function title(TrashEntry $entry): string
    {
        $payload = (array) $entry->payload;
        $ka = App::getLocale() === 'ka' ? ($payload['name_ka'] ?? null) : null;

        return (string) ($ka ?: ($payload['name'] ?? null) ?: $entry->label ?: '#'.$entry->record_id);
    }

    /** რამდენ ჩანაწერზე იყო მიბმული — აღდგენა იმდენ ბმულს დააბრუნებს */
    public static function count(TrashEntry $entry): int
    {
        return (int) (((array) $entry->payload)['links'] ?? 0);
    }

    private static function memberOf(TrashEntry $entry): ?CastMember
    {
        return CastMember::withoutGlobalScopes()->find($entry->record_id);
    }
}
