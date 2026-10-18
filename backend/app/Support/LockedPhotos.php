<?php

namespace App\Support;

use App\Models\GalleryAlbum;
use App\Models\Module;
use App\Models\User;

/**
 * **„ჩაკეტილი ფოტოები" — ერთი ფოტოს ჩაკეტვის სისტემური ალბომი.**
 *
 * ფოტოს თავისი ლოკი არ აქვს: „ჩაკეტვა" მას ჩაკეტილ ალბომში გადაიტანს
 * (`gallery/locked`-ში, `AlbumVault`), ზუსტად ისე, როგორც ხელით გადატანა —
 * ერთი მექანიზმი. ალბომი პირველ ჩაკეტვაზე იქმნება, პაროლით.
 *
 * ⚠️ **ალბომის id გალერეის მოდულის პარამეტრებშია** (`module_user.settings`) და
 * არა სახელში — მომხმარებელს მისი გადარქმევა შეუძლია. წაშლილი/ურნაში მყოფი ან
 * პაროლმოხსნილი ალბომი აღარ ითვლება: შემდეგი ჩაკეტვა ახალს ქმნის.
 */
final class LockedPhotos
{
    public const SETTING = 'locked_photos_album_id';

    /** ალბომის სახელი — მომხმარებლის ტექსტია (ერთენოვანი), შეცვლა შეუძლია */
    public const NAME = 'ჩაკეტილი ფოტოები';

    /** მოქმედი სისტემური ალბომი — ჩემი, ურნის გარეთ და ჩაკეტილი; სხვაგვარად `null` */
    public static function album(User $user): ?GalleryAlbum
    {
        $id = (int) (ModuleSettings::read($user, self::module())[self::SETTING] ?? 0);

        if ($id === 0) {
            return null;
        }

        $album = GalleryAlbum::query()->withoutGlobalScope('owner')->where('user_id', $user->id)->find($id);

        return $album !== null && $album->isLocked() ? $album : null;
    }

    /** ახალი სისტემური ალბომი პაროლით — ⚠️ ამ სესიაში **არ** იხსნება: „ჩაკეტე" ფოტოს მაშინვე მალავს */
    public static function create(User $user, string $password): GalleryAlbum
    {
        $album = GalleryAlbum::create([
            'user_id' => $user->id,
            'name' => self::NAME,
            'sort_order' => (int) GalleryAlbum::query()->withoutGlobalScope('owner')->where('user_id', $user->id)->max('sort_order') + 1,
        ]);
        $album->setPassword($password);

        ModuleSettings::merge($user, self::module(), [self::SETTING => $album->id]);

        return $album;
    }

    private static function module(): Module
    {
        return Module::query()->where('key', 'gallery')->firstOrFail();
    }
}
