<?php

namespace App\Support;

use App\Models\GalleryAlbum;

/**
 * **ჩაკეტილი ალბომი — ერთი პასუხი კითხვაზე „ეს ფოტო ჩანს თუ არა" (2026-09-16).**
 *
 * ალბომს პაროლი ედება; სანამ ის ამ სესიაში არ გაიხსნა, მისი ფოტოები
 * **სერვერიდან საერთოდ არ გამოდის** — არც სიაში, არც ესკიზებში, არც
 * შეჯამების რიცხვში.
 *
 * ⚠️ **Tasks §35.4 — ერთი მექანიზმი.** პაროლი, ცდების მრიცხველი და სესიის
 * გახსნილობა ახლა `record_locks`/`RecordLocks`-შია (ტიპი `gallery_album`),
 * ზუსტად ისე, როგორც პირადი გალერეის ადამიანსა და ალბომს, ფილმსა და მსახიობს.
 * ეს კლასი მხოლოდ ალბომის ენაზე ნათქვამი ფასადია — მისი ათობით მომხმარებელი
 * (`album_lock` scope, საჯარო გალერეა, ურნა) არ შეცვლილა.
 *
 * ⚠️ **CSS-ის blur პასუხი არ არის და სწორედ ამიტომ არსებობს ეს კლასი.**
 * დაბუნდოვნებული `<img>` მაინც ჩამოტვირთულ ფაილს აჩვენებს: devtools-ში
 * კლასის მოხსნა ან `src`-ის გახსნა ერთი კლიკია. ე.ი. ერთადერთი ნამდვილი
 * ლოკი სერვერზეა — რაც პასუხში არ მოვიდა, იმას ინსპექტორი ვერ იპოვის.
 *
 * ⚠️ **გახსნა სესიაშია და არა ბრაუზერში** — გასვლისას თავისით ქრება და
 * კლიენტს ხელში არაფერი რჩება. სესია `/api`-ზე მხოლოდ stateful მოთხოვნას
 * აქვს: სესიის გარეშე პასუხი ყოველთვის „ჩაკეტილია" (`hasSession()`).
 */
final class AlbumLock
{
    /** `record_locks.lockable_type` — ალბომის morph-ალიასი */
    public const TYPE = 'gallery_album';

    /** ტესტებისა და ხანგრძლივი პროცესებისთვის — მემო `RecordLocks`-შია */
    public static function flush(): void
    {
        RecordLocks::flush();
    }

    /**
     * ამ user-ის ჩაკეტილი ალბომები, რომლებიც ამ სესიაში **არ** გახსნილა.
     *
     * ⚠️ `Auth::id()`-ის გარეშე (CLI, seeder) სია ცარიელია — ე.ი. ბრძანება
     * ყველაფერს ხედავს, ზუსტად ისე, როგორც `owner` scope-ია გამორთული.
     *
     * @return list<int>
     */
    public static function hiddenIds(): array
    {
        return RecordLocks::hiddenIds(self::TYPE);
    }

    /**
     * **იმავე კითხვა კონკრეტული მფლობელისთვის (Tasks §7.12).**
     *
     * ⚠️ საჯარო პროფილს `Auth::id()` არ გამოადგება: ანონიმზე ის ცარიელია,
     * შესული უცხოსთვის კი მისივე ალბომებს დაითვლიდა. ამიტომ მფლობელი ცხადია.
     * ⚠️ გახსნილთა ნაკრები კი **სესიისაა და არა მფლობელისა**: პაროლი
     * მფლობელისაა და მას უცხოც აკრეფს, თუ იცის.
     *
     * @return list<int>
     */
    public static function hiddenIdsFor(int $ownerId): array
    {
        return array_values(array_diff(
            RecordLocks::lockedIdsFor(self::TYPE, $ownerId),
            RecordLocks::unlockedIds(self::TYPE),
        ));
    }

    /**
     * **სესია საერთოდ არსებობს? (Tasks BUG-02)** — მის გარეშე `unlock()` ჩუმად
     * ვერაფერს ჩაწერდა და სწორი პაროლი 200-ს დააბრუნებდა; კონტროლერი 409-ს აბრუნებს.
     */
    public static function hasSession(): bool
    {
        return RecordLocks::hasSession();
    }

    /** @return list<int> */
    public static function unlockedIds(): array
    {
        return RecordLocks::unlockedIds(self::TYPE);
    }

    public static function isUnlocked(GalleryAlbum $album): bool
    {
        return RecordLocks::isUnlocked($album);
    }

    /** პაროლი სწორია — ეს ალბომი ამ სესიაში ღიაა */
    public static function unlock(GalleryAlbum $album): void
    {
        RecordLocks::unlock($album);
    }

    /** „ისევ ჩაკეტე" — ერთი ალბომი ან (id-ის გარეშე) ყველა */
    public static function lock(?GalleryAlbum $album = null): void
    {
        $album ? RecordLocks::lock($album) : RecordLocks::lockAll(self::TYPE);
    }
}
