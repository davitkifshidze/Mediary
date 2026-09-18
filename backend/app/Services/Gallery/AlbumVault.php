<?php

namespace App\Services\Gallery;

use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Support\GalleryParent;
use App\Support\StorageFolder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

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
 * ⚠️ **მაგრამ ფაილი ტრანზაქციაში არ ცოცხლობს და სწორედ ეს იყო ბაგი
 * (Tasks BUG-03).** `writeStream`/`delete` rollback-ს არ ემორჩილება, ე.ი.
 * ძველი რიგი „ჩაწერე ახალი → წაშალე ძველი → შეინახე `path`" DB-ის
 * ჩავარდნაზე **ალბომის ყველა ფოტოს 404-ად აქცევდა**: სვეტი ძველ
 * მნიშვნელობას იბრუნებდა, ფაილი კი იქ აღარ იყო. ახლა რიგი სამნაბიჯიანია —
 * **ჯერ ასლი, მერე commit, ბოლოს ძველის წაშლა**: ჩავარდნაზე ყველაზე ცუდი,
 * რაც შეიძლება დარჩეს, არის ზედმეტი ასლი (და `catch` მასაც ალაგებს),
 * ნამდვილი ფაილი კი ადგილზეა და რიგი მასზე მიუთითებს.
 *
 * ⚠️ **ასლი ტრანზაქციამდე კეთდება და არა შიგნით** — ათი მეგაბაიტის კოპირება
 * გახსნილ ტრანზაქციაში მთელი ამ დროით ინახავს ჩაკეტილ რიგებს.
 *
 * ⚠️ **`DB::afterCommit()` აქ განზრახ არ გამოიყენება.** ის ზუსტად ამისთვისაა,
 * მაგრამ ტესტებში `RefreshDatabase` მთელ ტესტს ერთ ტრანზაქციაში ატარებს,
 * რომელიც არასდროს commit-დება — ე.ი. callback **ტესტში საერთოდ არ
 * გაეშვებოდა** და კოდი პროდაქშენში სხვას იზამდა, ვიდრე ტესტში.
 * ამის ფასი: ამ სერვისს **გარე ტრანზაქციიდან არ ეძახიან** (და არც უნდა
 * დაეძახონ) — ჩადგმულ `DB::transaction()`-ს commit არ აქვს, savepoint აქვს.
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
    public static function place(GalleryImage $image, ?GalleryAlbum $album): int
    {
        return self::placeMany([$image], $album);
    }

    /**
     * იგივე, ცხადად გადმოცემულ ფოტოებზე (Tasks BUG-04).
     *
     * ⚠️ **ალბომის წაშლას სწორედ ეს სჭირდება და არა `seal`/`reveal`.** ისინი
     * ფოტოებს `where('album_id', …)`-ით პოულობენ, ე.ი. მას შემდეგ, რაც
     * რიგები უკვე გადავიდა (ან ალბომი წაიშალა), **ვეღარაფერს იპოვიან** —
     * ხოლო თუ მათ ჯერ დავარეკავთ, ისევ იმ რიგში ვართ, რომელიც BUG-04-ია.
     *
     * @param  iterable<GalleryImage>  $images
     * @return int რამდენი ფაილი გადავიდა
     */
    public static function placeMany(iterable $images, ?GalleryAlbum $album): int
    {
        $locked = $album && $album->isLocked();

        return self::relocateAll(
            $images,
            $locked ? StorageFolder::GALLERY_LOCKED : StorageFolder::GALLERY_IMAGES,
            $locked,
        );
    }

    /** @return int რამდენი ფაილი გადავიდა */
    private static function move(GalleryAlbum $album, string $target, bool $clearPosters): int
    {
        return self::relocateAll(
            GalleryImage::query()
                ->withoutGlobalScope('album_lock')
                ->withoutGlobalScope('owner')
                ->where('album_id', $album->id)
                ->get(),
            $target,
            $clearPosters,
        );
    }

    /**
     * **ასლი → commit → ძველის წაშლა** (Tasks BUG-03).
     *
     * ⚠️ დაბრუნებული რიცხვი **ნამდვილად გადატანილებია** და არა „რამდენ
     * რიგზე გავიარე": ადრე დისკზე დაკარგული ფაილიც „წარმატებით გადატანილად"
     * ითვლებოდა და `path`-ს არარსებულ მისამართზე გადააწერდა.
     *
     * @param  iterable<GalleryImage>  $images
     */
    private static function relocateAll(iterable $images, string $target, bool $clearPosters): int
    {
        /** @var list<array{image: GalleryImage, from: string, to: string, overwrote: bool}> $copied */
        $copied = [];

        try {
            foreach ($images as $image) {
                $step = self::copy($image, $target);
                if ($step) {
                    $copied[] = $step;
                }
            }

            DB::transaction(function () use ($copied, $clearPosters) {
                foreach ($copied as $step) {
                    if ($clearPosters) {
                        self::clearPoster($step['image'], $step['from']);
                    }

                    $step['image']->forceFill(['path' => $step['to']])->saveQuietly();
                }
            });
        } catch (Throwable $e) {
            /* ⚠️ commit-მდე ჩავარდნაზე ახალი ასლი ობოლია — ვასუფთავებთ.
               ⚠️ **გარდა იმ შემთხვევისა, როცა იქ ფაილი უკვე იდო**: ის ჩვენ
               არ შეგვიქმნია და მისი წაშლა სხვისი ფოტოს წაშლა იქნებოდა. */
            foreach ($copied as $step) {
                if (! $step['overwrote']) {
                    Storage::disk(StorageFolder::diskFor($step['to']))->delete($step['to']);
                }
            }

            throw $e;
        }

        // commit გავიდა — რიგი ახალ ასლზე მიუთითებს, ძველი აღარავის სჭირდება
        foreach ($copied as $step) {
            self::discard($step['from']);
        }

        return count($copied);
    }

    /**
     * ერთი ფაილის **ასლი** სამიზნე საქაღალდეში; ძველს ხელს არ ახლებს.
     *
     * ⚠️ **ნაკადით და არა `get()`-ით** — გალერეის ორიგინალი მეგაბაიტებია და
     * მთელი ფაილის PHP-ის სტრიქონში ჩატვირთვა ზუსტად ის ხაფანგია, რასაც
     * `StorageMeter::storeLocalFile()` არიდებს თავს.
     *
     * ⚠️ **კვოტა არ იცვლება**: იგივე ფაილია, უბრალოდ სხვა საქაღალდეში —
     * `size` ხელუხლებელია, ე.ი. მრიცხველს ხელი არ ეხება.
     *
     * ⚠️ **დისკზე არარსებული ფაილი `null`-ია და არა „გადავიტანე"** (BUG-03):
     * `path` უცვლელი რჩება. ადრე ის ახალ მისამართზე გადაიწერებოდა, ე.ი.
     * დაკარგული ფაილის რიგი მეორე, უკვე გამოუსწორებელ ადგილს უთითებდა.
     *
     * ⚠️ **I/O შეცდომა კი პირიქით — გამონაკლისია და არა გამოტოვება.** ჩუმად
     * გამოტოვებული ფოტო `seal()`-ზე იმას ნიშნავდა, რომ ალბომი „ჩაკეტილია",
     * ერთი ფაილი კი საჯარო დისკზე დარჩა — ზუსტად ის, რასაც ეს სერვისი
     * ხურავს. სჯობს მთელი ოპერაცია ჩავარდეს ხმამაღლა.
     *
     * @return array{image: GalleryImage, from: string, to: string, overwrote: bool}|null
     */
    private static function copy(GalleryImage $image, string $target): ?array
    {
        $path = (string) $image->path;
        if ($path === '' || str_starts_with($path, $target.'/')) {
            return null;
        }

        $from = Storage::disk(StorageFolder::diskFor($path));
        if (! $from->exists($path)) {
            return null;
        }

        $to = Storage::disk(StorageFolder::diskFor($target));
        $next = $target.'/'.basename($path);
        $overwrote = $to->exists($next);

        $stream = $from->readStream($path);
        if ($stream === false || $stream === null) {
            throw new RuntimeException('gallery: unreadable file '.$path);
        }

        $ok = $to->writeStream($next, $stream);
        if (is_resource($stream)) {
            fclose($stream);
        }

        if ($ok === false) {
            throw new RuntimeException('gallery: could not write '.$next);
        }

        return ['image' => $image, 'from' => $path, 'to' => $next, 'overwrote' => $overwrote];
    }

    /**
     * ძველი ასლის მოშორება commit-ის შემდეგ.
     *
     * ⚠️ **ჩავარდნა ჩუმი არ არის.** `seal()`-ზე წაუშლელი ძველი ფაილი საჯარო
     * დისკზე რჩება — ე.ი. დამახსოვრებული `/storage/...` ბმული კვლავ
     * იხსნება. აპლიკაცია მას აღარსად გასცემს (`path` უკვე პირად ასლზეა),
     * მაგრამ „რატომ ჩანს ისევ" პასუხგაუცემელი რომ არ დარჩეს, ლოგშია.
     */
    private static function discard(string $path): void
    {
        $disk = Storage::disk(StorageFolder::diskFor($path));

        if ($disk->exists($path) && ! $disk->delete($path)) {
            Log::warning('gallery: the old copy is still on disk', ['path' => $path]);
        }
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
        // ⚠️ სვეტი მშობლისაა — იხ. `GalleryParent::clearPrimaryIfAt()` (BUG-20)
        GalleryParent::clearPrimaryIfAt(
            $image->imageable,
            (string) $image->imageable_type,
            $path,
            quietly: true,
        );
    }
}
