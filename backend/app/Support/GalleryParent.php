<?php

namespace App\Support;

use App\Models\Anime;
use App\Models\Book;
use App\Models\CastMember;
use App\Models\CustomRecord;
use App\Models\Game;
use App\Models\Movie;
use App\Models\Place;
use App\Models\Series;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/**
 * **ვის შეიძლება ეკიდოს გალერეის ფოტო/ვიდეო (Tasks §8.3).**
 *
 * ⚠️ **რატომ არსებობს ეს ფაილი.** იგივე სია სამ ადგილას იწერებოდა:
 * `WebSearchController::TARGETS` (სად მიება ვებიდან ჩამოწერილი),
 * `GalleryController::withOwners()` (ვისი ფოტოა) და `groups()`-ის ციკლი
 * (რომელი ჯგუფები დაიხატოს). ბოლო ორი **მხოლოდ `MediaDomain::TYPES`-ს**
 * იცნობდა, ე.ი. სიმღერაზე/წიგნზე/თამაშზე ვებიდან ჩამოწერილი ფოტო
 * `gallery_images`-ში ჯდებოდა და **გალერეაში აღარსად ჩანდა** — არც ჯგუფად,
 * არც მშობლის სახელით. ერთი რუკა ამ სამივეს ერთად აჭერს.
 *
 * ⚠️ **ეს `MediaDomain`-ის ჩანაცვლება არ არის.** `MediaDomain` TMDB-ის
 * დომენებია (სინქრონი, ტრეილერი, ჟანრები); აქ კი „ვისაც `HasGallery` აქვს"
 * — მათ შორის **მსახიობი**, რომელიც საერთოდ არ არის მედია-დომენი.
 *
 * ⚠️ **`category` ის ტექნიკური ტიპია, რომელსაც ამ მშობელზე ჩამოწერილი ფოტო
 * ბუნებრივად ეკუთვნის** (`gallery_images.category`): მსახიობზე — `actor`,
 * დანარჩენებზე — `backdrop`. ხელით არასდროს იცვლება (§4.5).
 */
final class GalleryParent
{
    /**
     * morph alias → [მოდელი, მოდულის key, ნაგულისხმევი კატეგორია, მთავარი სურათი].
     *
     * ⚠️ **მსახიობის მოდული `gallery`-ია და არა `cast`** — `cast_members`
     * გლობალური ლექსიკონია, `modules` რიგი არ აქვს, ხოლო მისი ფოტოები
     * კვოტაში სწორედ გალერეის მოდულს ეწერება (`StorageFolder::moduleFor`).
     *
     * ⚠️ **`primary` სამი ფაქტია და სამივე მშობლისეულია** (Tasks BUG-20):
     * რომელ სვეტში ზის მთავარი სურათი, სად წერია მისი წყარო და რა ჩაიწეროს
     * იქ. აქამდე `setPrimary()` ყველას `poster_path`/`poster_source`-ს
     * წერდა, რომელიც სიმღერას/წიგნს/თამაშს **საერთოდ არ აქვს** — `save()`
     * `Column not found`-ით ვარდებოდა და ღილაკი 500-ს აბრუნებდა.
     *
     * ⚠️ **წყაროს მნიშვნელობა მხოლოდ ერთ კითხვას პასუხობს: „ჩემი ატვირთვაა
     * თუ არა"** — მისგან დამოკიდებულია კვოტის დათვლა (`StorageMeter::files()`)
     * და ჩანაწერთან ერთად წაშლა. ამიტომ აქ ნებისმიერი არა-`upload` მნიშვნელობა
     * გამოდგება; მედია-დომენებზე ისტორიულად `tmdb` ეწერება (ფაილი მართლაც
     * TMDB-დან მოვიდა), დანარჩენებზე — **`gallery`**, რაც უფრო პატიოსანია:
     * წიგნის ყდა გალერეიდან აიღე და არა Open Library-დან.
     *
     * ⚠️ **სიმღერას წყაროს სვეტი არ აქვს** (`songs.thumbnail_path` მარტოა),
     * ე.ი. `source` იქ `null`-ია — და ეს ნიშნავს, რომ მისი ესკიზი კვოტაში
     * არასდროს ითვლება, ანუ ზუსტად ის, რაც გალერეის ფოტოზე გვინდა.
     *
     * @var array<string, array{model: class-string<Model>, module: string, category: string, primary: array{path: string, source: ?string, value: ?string}|null}>
     */
    public const PARENTS = [
        'cast_member' => [
            'model' => CastMember::class, 'module' => 'gallery', 'category' => 'actor',
            /* ⚠️ `cast_members.photo_path` **გლობალური ლექსიკონის სვეტია** —
               ერთი user-ის არჩევანი ყველას შეეცვლებოდა, ამიტომ `null`. */
            'primary' => null,
        ],
        'movie' => [
            'model' => Movie::class, 'module' => 'movie', 'category' => 'backdrop',
            'primary' => ['path' => 'poster_path', 'source' => 'poster_source', 'value' => 'tmdb'],
        ],
        'series' => [
            'model' => Series::class, 'module' => 'series', 'category' => 'backdrop',
            'primary' => ['path' => 'poster_path', 'source' => 'poster_source', 'value' => 'tmdb'],
        ],
        'anime' => [
            'model' => Anime::class, 'module' => 'anime', 'category' => 'backdrop',
            'primary' => ['path' => 'poster_path', 'source' => 'poster_source', 'value' => 'tmdb'],
        ],
        // Tasks §11 — სიმღერა გალერეიდან გავიდა (Q9); მისი მთავარი ფოტო „მოდულების“ ჭრილში რჩება
        'book' => [
            'model' => Book::class, 'module' => 'book', 'category' => 'backdrop',
            'primary' => ['path' => 'cover_path', 'source' => 'cover_source', 'value' => self::FROM_GALLERY],
        ],
        'game' => [
            'model' => Game::class, 'module' => 'game', 'category' => 'backdrop',
            'primary' => ['path' => 'cover_path', 'source' => 'cover_source', 'value' => self::FROM_GALLERY],
        ],
        /* FEAT-26 — ⚠️ **ადგილი გალერეის ყველაზე ბუნებრივი მშობელია**: ფოტო
           სწორედ ის არის, რაც ნანახ ადგილს რჩება. `photo_source` სვეტი
           განზრახ არ არსებობს (სიმღერის წესი), ე.ი. გალერეიდან არჩეული
           მთავარი ფოტო კვოტაში აღარ ითვლება — ერთი ფაილი ორჯერ არ იხდის. */
        'place' => [
            'model' => Place::class, 'module' => 'place', 'category' => 'backdrop',
            'primary' => ['path' => 'photo_path', 'source' => null, 'value' => null],
        ],
    ];

    /** `<record>.*_source`-ის მნიშვნელობა, როცა სურათი გალერეიდან აირჩა */
    public const FROM_GALLERY = 'gallery';

    /** მსახიობის morph alias — ერთ ადგილას, რომ ლიტერალად აღარ ეწეროს */
    public const ACTOR = 'cast_member';

    /**
     * **პირადი მოდულის ჩანაწერის მთავარი ფოტო (Tasks §37.4)** — ადგილის ფორმა:
     * წყაროს სვეტი არ არსებობს, ე.ი. გალერეიდან არჩეული ფოტო კვოტაში მეორედ
     * არ ითვლება (`StorageMeter::files()` გალერეის ფესვს გამოტოვებს).
     */
    private const CUSTOM_PRIMARY = ['path' => 'photo_path', 'source' => null, 'value' => null];

    /**
     * ყველა შესაძლო მშობელი — საბაზისოები და **ამ ანგარიშის** პირადი მოდულები (§37.4).
     *
     * ⚠️ **პირადი მოდული გასაღებითვეა მშობელი** (`c5-recipes`) და არა ერთი
     * `custom_record` ტიპით: გალერეის ჭრილს თითო მოდული ცალკე ტაბად სჭირდება
     * თავისი სახელით, ფერით და ხატულით — ერთ „პირად" კალათაში ორი მოდულის
     * ჩანაწერები ერთმანეთში აირეოდა (იხ. `CustomRecord::getMorphClass()`).
     *
     * ⚠️ **ჩამოთვლა მხოლოდ საკუთარ მოდულებს შეიცავს** — ვალიდაციის წესიც
     * აქედან იგება (`rule()`), ე.ი. სხვისი პირადი გასაღები და უცნობი
     * გასაღები ერთნაირ 422-ს იღებს: „ასეთი მოდული არსებობს" არ ჟონავს (Q28).
     * `$for` საჯარო პროფილისთვისაა — იქ ჩამოთვლა **მფლობელისაა** და არა სტუმრის.
     *
     * @return list<string>
     */
    public static function keys(?User $for = null): array
    {
        return [...array_keys(self::PARENTS), ...self::customKeys($for)];
    }

    /**
     * მხოლოდ **ჩანაწერები** — მსახიობის გარეშე.
     *
     * @return list<string>
     */
    public static function recordKeys(?User $for = null): array
    {
        return array_values(array_diff(self::keys($for), [self::ACTOR]));
    }

    public static function has(string $key): bool
    {
        return isset(self::PARENTS[$key]) || CustomModules::exists($key);
    }

    /**
     * ⚠️ პირად გასაღებზე მოდელი **ფორმით** ბრუნდება და არა არსებობით —
     * ჩანაწერს `query()` ეძებს მოდულის ფილტრით, ე.ი. უცნობი მოდული უბრალოდ
     * ვერაფერს იპოვის (404).
     *
     * @return class-string<Model>|null
     */
    public static function model(string $key): ?string
    {
        return self::PARENTS[$key]['model'] ?? (CustomModules::isKey($key) ? CustomRecord::class : null);
    }

    /** პირადი მოდულის მოდული თვითონ მისი გასაღებია */
    public static function module(string $key): ?string
    {
        return self::PARENTS[$key]['module'] ?? (CustomModules::isKey($key) ? $key : null);
    }

    /**
     * **მშობლის query — ერთადერთი გზა ჩანაწერამდე** (§37.4).
     *
     * ⚠️ `model($key)::query()` პირად მოდულზე ორ რამეს ცდებოდა: ერთი ცხრილი
     * ყველა პირად მოდულს ემსახურება (მოდულის ფილტრი უნდა), ხოლო
     * `withCount('galleryImages')` ცარიელი ინსტანციის morph-კლასს იყენებდა —
     * იხ. `CustomRecord::queryFor()`.
     */
    public static function query(string $key): ?Builder
    {
        if (CustomModules::isKey($key)) {
            return CustomRecord::queryFor($key);
        }

        $model = self::model($key);

        return $model ? $model::query() : null;
    }

    /** @return list<string> */
    private static function customKeys(?User $for): array
    {
        $user = $for ?? Auth::user();

        return $user instanceof User ? CustomModules::keysOf($user) : [];
    }

    public static function category(string $key): string
    {
        return self::PARENTS[$key]['category'] ?? 'backdrop';
    }

    /**
     * მთავარი სურათის სვეტები ამ მშობელზე, ან `null` — თუ არ აქვს.
     *
     * @return array{path: string, source: ?string, value: ?string}|null
     */
    public static function primary(string $key): ?array
    {
        if (isset(self::PARENTS[$key])) {
            return self::PARENTS[$key]['primary'];
        }

        return CustomModules::isKey($key) ? self::CUSTOM_PRIMARY : null;
    }

    /** ხატავს თუ არა ინტერფეისი „მთავარად დაყენების" ღილაკს */
    public static function supportsPrimary(string $key): bool
    {
        return self::primary($key) !== null;
    }

    /**
     * მთავარი სურათის ბმულის მოხსნა, თუ ის სწორედ ამ ფაილზე მიუთითებს.
     *
     * ⚠️ **ორი გამომძახებელი აქვს და ორივეს ერთი და იგივე სჭირდება**
     * (Tasks BUG-20): ფოტოს წაშლა (`GalleryController::destroyImage()`) და
     * ალბომის ჩაკეტვა (`AlbumVault::clearPoster()` — §7.14, ლოკის ერთადერთი
     * შემოვლა). ორივე `poster_path`-ს ხელით წერდა, ე.ი. ღილაკის სხვა
     * მშობლებზე ამუშავება მათ **ჩუმად დაკიდებულ ბმულს** დაუტოვებდა.
     *
     * @param  bool  $quietly  ჩაკეტვისას `true` — ეს დამალვის ტექნიკური
     *                         ნაბიჯია და აუდიტის ლოგში „ჩანაწერი შეიცვალა"
     *                         მხოლოდ დააბნევდა
     */
    public static function clearPrimaryIfAt(?Model $parent, string $type, ?string $path, bool $quietly = false): bool
    {
        $columns = self::primary($type);

        if (! $parent || ! $columns || $path === null || ($parent->{$columns['path']} ?? null) !== $path) {
            return false;
        }

        $parent->{$columns['path']} = null;
        if ($columns['source']) {
            $parent->{$columns['source']} = null;
        }

        $quietly ? $parent->saveQuietly() : $parent->save();

        return true;
    }

    /** ვალიდაციის წესი — `in:cast_member,movie,series,…` (+ ამ ანგარიშის პირადი მოდულები) */
    public static function rule(?User $for = null): string
    {
        return 'in:'.implode(',', self::keys($for));
    }

    /**
     * იგივე, **მსახიობის გარეშე** — `in:movie,series,anime,song,book,game`.
     *
     * ⚠️ ჯგუფების ჭრილს დომენის ტაბები დაემატა (ეტაპი 2) და მისი `type`
     * `MediaDomain::rule()`-ზე იყო მიბმული — ე.ი. სიმღერის ან წიგნის ტაბი
     * **422-ს** აბრუნებდა, თუმცა თვითონ სია ამ მშობლებს ისედაც ხატავდა.
     */
    public static function recordRule(?User $for = null): string
    {
        return 'in:'.implode(',', self::recordKeys($for));
    }
}
