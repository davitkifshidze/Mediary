<?php

namespace App\Services\Gallery;

use App\Models\CastMember;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Support\StorageFolder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * **ჩაკეტილი ალბომის ფაილები პირად დისკზე გადადის (Tasks §7.9).**
 *
 * შენი სიტყვები: „ინსპექტიდან ან რამე მახინაციით პაროლის გარეშე რეალური
 * ფოტო არ უნდა შეიძლებოდეს".
 *
 * ⚠️ **პასუხიდან ამოღება საკმარისი არ არის და ეს ცხადად ეწერა `CLAUDE.md`-ში:**
 * ფაილი საჯარო დისკზე იდო, ე.ი. **დამახსოვრებული ან გამოცნობილი
 * `/storage/...` ბმული მაინც იხსნებოდა**. სერვერზე ასვლის შემდეგ ეს
 * ერთადერთი დარჩენილი ხვრელი იქნებოდა, ამიტომ ლოკი ახლა ფაილს **ფიზიკურად**
 * გადაიტანს `gallery/locked`-ში — პირად დისკზე, საიდანაც `/storage/*`
 * საერთოდ ვერაფერს კითხულობს.
 *
 * ⚠️ **გადატანა `path` სვეტს ცვლის, ე.ი. ტრანზაქციაა.** ნახევრად გავლილი
 * გადატანა ნახევარ ალბომს გატეხილ სურათებად დატოვებდა.
 *
 * ⚠️ **პოსტერი ლოკს გვერდს უვლიდა და ესეც აქ იხურება (§7.14).** „მთავარად
 * დაყენება" ჩანაწერის `poster_path`-ს **ფოტოს ბილიკზე** მიუთითებს, global
 * scope კი `GalleryImage` **მოდელზეა** და არა ამ სვეტზე — ე.ი. ჩაკეტილ
 * ალბომში გადატანილი ფოტო, თუ ის ჩანაწერის პოსტერია, ისევ იხატებოდა
 * (საჯარო ბარათზეც). ჩაკეტვისას პოსტერი იწმინდება: ჩანაწერს ნაგულისხმევი
 * სურათი დარჩება, ფოტო კი მართლა დაიმალება.
 *
 * ⚠️ **გახსნა = პაროლის მოხსნა და არა სესიაში გახსნა.** სესიური გახსნა
 * დროებითია (ბრაუზერის დახურვამდე); ფაილის საჯარო დისკზე დაბრუნება კი
 * მუდმივი ცვლილებაა — ორის აღრევა იმას ნიშნავდა, რომ ერთხელ შეყვანილი
 * პაროლი ფაილს სამუდამოდ გამოაქვეყნებდა.
 */
final class AlbumVault
{
    /** ალბომი ჩაიკეტა — ფაილები პირად დისკზე */
    public static function seal(GalleryAlbum $album): int
    {
        return self::move($album, StorageFolder::GALLERY_LOCKED, true);
    }

    /** პაროლი მოიხსნა — ფაილები საჯარო საქაღალდეში ბრუნდება */
    public static function reveal(GalleryAlbum $album): int
    {
        return self::move($album, StorageFolder::GALLERY_IMAGES, false);
    }

    /**
     * ერთი ფოტო ალბომს შეუერთდა ან გამოეყო (`POST /gallery/images/move`).
     *
     * ⚠️ ეს **ცალკე შესასვლელია და აუცილებელი**: `seal()` მხოლოდ ჩაკეტვის
     * მომენტს ფარავს, ხოლო უკვე ჩაკეტილ ალბომში ახალი ფოტოს გადატანა
     * იმავე ხვრელს თავიდან გახსნიდა.
     */
    public static function place(GalleryImage $image, ?GalleryAlbum $album): void
    {
        $locked = $album && $album->isLocked();
        $target = $locked ? StorageFolder::GALLERY_LOCKED : StorageFolder::GALLERY_IMAGES;

        DB::transaction(function () use ($image, $target, $locked) {
            self::relocate($image, $target, $locked);
        });
    }

    /** @return int რამდენი ფაილი გადავიდა */
    private static function move(GalleryAlbum $album, string $target, bool $clearPosters): int
    {
        $moved = 0;

        DB::transaction(function () use ($album, $target, $clearPosters, &$moved) {
            $images = GalleryImage::query()
                ->withoutGlobalScope('album_lock')
                ->withoutGlobalScope('owner')
                ->where('album_id', $album->id)
                ->get();

            foreach ($images as $image) {
                $moved += self::relocate($image, $target, $clearPosters) ? 1 : 0;
            }
        });

        return $moved;
    }

    /**
     * ერთი ფაილის გადატანა.
     *
     * ⚠️ **ნაკადით და არა `get()`-ით** — გალერეის ორიგინალი მეგაბაიტებია და
     * მთელი ფაილის PHP-ის სტრიქონში ჩატვირთვა ზუსტად ის ხაფანგია, რასაც
     * `StorageMeter::storeLocalFile()` არიდებს თავს.
     *
     * ⚠️ **კვოტა არ იცვლება**: იგივე ფაილია, უბრალოდ სხვა საქაღალდეში —
     * `size` ხელუხლებელია, ე.ი. მრიცხველს ხელი არ ეხება.
     */
    private static function relocate(GalleryImage $image, string $target, bool $clearPosters): bool
    {
        $path = (string) $image->path;
        if ($path === '' || str_starts_with($path, $target.'/')) {
            return false;
        }

        $from = Storage::disk(StorageFolder::diskFor($path));
        $to = Storage::disk(StorageFolder::diskFor($target));
        $next = $target.'/'.basename($path);

        if ($from->exists($path)) {
            $stream = $from->readStream($path);
            if ($stream === false || $stream === null) {
                return false;
            }

            $to->writeStream($next, $stream);
            if (is_resource($stream)) {
                fclose($stream);
            }

            $from->delete($path);
        }

        if ($clearPosters) {
            self::clearPoster($image, $path);
        }

        $image->forceFill(['path' => $next])->saveQuietly();

        return true;
    }

    /**
     * ⚠️ **პოსტერი ლოკის ერთადერთი შემოვლა იყო (§7.14).**
     *
     * `saveQuietly()` განზრახ: ეს დამალვის თანმხლები ტექნიკური ნაბიჯია და
     * არა მომხმარებლის რედაქტირება — აუდიტის ლოგში „ჩანაწერი შეიცვალა"
     * მხოლოდ დააბნევდა.
     */
    private static function clearPoster(GalleryImage $image, string $path): void
    {
        $parent = $image->imageable;

        if ($parent && ! $parent instanceof CastMember && ($parent->poster_path ?? null) === $path) {
            $parent->forceFill(['poster_path' => null, 'poster_source' => null])->saveQuietly();
        }
    }
}
