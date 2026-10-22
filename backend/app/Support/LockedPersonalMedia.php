<?php

namespace App\Support;

use App\Models\Module;
use App\Models\PersonalAlbum;
use App\Models\RecordLock;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

/**
 * **პირადი გალერეის „ჩაკეტილი ფოტოები" — ერთი ფოტოს/ვიდეოს ჩაკეტვის სისტემური ალბომი.**
 *
 * `LockedPhotos`-ის ტყუპი: ფოტოს თავისი ლოკი არ აქვს — „ჩაკეტვა" მას ჩაკეტილ
 * ალბომში გადაიტანს, ზუსტად ისე, როგორც ხელით გადატანა (`PersonalGallery::move()`),
 * და მას `PersonalMedia`-ს ლოკის სქოუპი (`album_id` → `personal_album`) ისედაც
 * მალავს — სიიდან, ჯამებიდან, ჯგუფებიდან, საჯარო პროფილიდან. ერთი მექანიზმი.
 *
 * ⚠️ **ალბომი უპიროვნოა** (`person_id = null`), ე.ი. გადატანა ფოტოს პიროვნებას
 * არ ცვლის — გახსნის შემდეგ ის ისევ მის პიროვნებაშია, მაგრამ ამ ალბომში.
 * ⚠️ **ალბომის id მოდულის პარამეტრებშია** (`module_user.settings`) და არა
 * სახელში — მომხმარებელს მისი გადარქმევა შეუძლია. ურნაში მყოფი ან
 * პაროლმოხსნილი ალბომი აღარ ითვლება: შემდეგი ჩაკეტვა ახალს ქმნის.
 */
final class LockedPersonalMedia
{
    public const SETTING = 'locked_media_album_id';

    /** ალბომის სახელი — მომხმარებლის ტექსტია (ერთენოვანი), შეცვლა შეუძლია */
    public const NAME = 'ჩაკეტილი ფოტოები';

    /** მოქმედი სისტემური ალბომი — ჩემი, ურნის გარეთ და ჩაკეტილი; სხვაგვარად `null` */
    public static function album(User $user): ?PersonalAlbum
    {
        $id = (int) (ModuleSettings::read($user, self::module())[self::SETTING] ?? 0);

        if ($id === 0) {
            return null;
        }

        $album = PersonalAlbum::query()->withoutGlobalScope('owner')->where('user_id', $user->id)->find($id);

        return $album !== null && RecordLocks::isLocked($album) ? $album : null;
    }

    /** ახალი სისტემური ალბომი პაროლით — ⚠️ ამ სესიაში **არ** იხსნება: „ჩაკეტე" ფოტოს მაშინვე მალავს */
    public static function create(User $user, string $password): PersonalAlbum
    {
        $album = PersonalAlbum::create([
            'user_id' => $user->id,
            'name' => self::NAME,
            'person_id' => null,
            'sort_order' => (int) PersonalAlbum::query()->withoutGlobalScopes()->where('user_id', $user->id)->max('sort_order') + 1,
        ]);

        RecordLock::create([
            'user_id' => $user->id,
            'lockable_type' => $album->getMorphClass(),
            'lockable_id' => $album->id,
            'password_hash' => Hash::make($password),
        ]);

        ModuleSettings::merge($user, self::module(), [self::SETTING => $album->id]);

        return $album;
    }

    private static function module(): Module
    {
        return Module::query()->where('key', 'personal')->firstOrFail();
    }
}
