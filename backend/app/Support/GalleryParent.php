<?php

namespace App\Support;

use App\Models\Anime;
use App\Models\Book;
use App\Models\CastMember;
use App\Models\Game;
use App\Models\Movie;
use App\Models\Series;
use App\Models\Song;
use Illuminate\Database\Eloquent\Model;

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
     * morph alias → [მოდელი, მოდულის key, ნაგულისხმევი კატეგორია].
     *
     * ⚠️ **მსახიობის მოდული `gallery`-ია და არა `cast`** — `cast_members`
     * გლობალური ლექსიკონია, `modules` რიგი არ აქვს, ხოლო მისი ფოტოები
     * კვოტაში სწორედ გალერეის მოდულს ეწერება (`StorageFolder::moduleFor`).
     *
     * @var array<string, array{model: class-string<Model>, module: string, category: string}>
     */
    public const PARENTS = [
        'cast_member' => ['model' => CastMember::class, 'module' => 'gallery', 'category' => 'actor'],
        'movie' => ['model' => Movie::class, 'module' => 'movie', 'category' => 'backdrop'],
        'series' => ['model' => Series::class, 'module' => 'series', 'category' => 'backdrop'],
        'anime' => ['model' => Anime::class, 'module' => 'anime', 'category' => 'backdrop'],
        'song' => ['model' => Song::class, 'module' => 'song', 'category' => 'backdrop'],
        'book' => ['model' => Book::class, 'module' => 'book', 'category' => 'backdrop'],
        'game' => ['model' => Game::class, 'module' => 'game', 'category' => 'backdrop'],
    ];

    /** მსახიობის morph alias — ერთ ადგილას, რომ ლიტერალად აღარ ეწეროს */
    public const ACTOR = 'cast_member';

    /** @return list<string> ყველა შესაძლო მშობელი */
    public static function keys(): array
    {
        return array_keys(self::PARENTS);
    }

    /**
     * მხოლოდ **ჩანაწერები** — მსახიობის გარეშე.
     *
     * @return list<string>
     */
    public static function recordKeys(): array
    {
        return array_values(array_diff(self::keys(), [self::ACTOR]));
    }

    public static function has(string $key): bool
    {
        return isset(self::PARENTS[$key]);
    }

    /** @return class-string<Model>|null */
    public static function model(string $key): ?string
    {
        return self::PARENTS[$key]['model'] ?? null;
    }

    public static function module(string $key): ?string
    {
        return self::PARENTS[$key]['module'] ?? null;
    }

    public static function category(string $key): string
    {
        return self::PARENTS[$key]['category'] ?? 'backdrop';
    }

    /** ვალიდაციის წესი — `in:cast_member,movie,series,…` */
    public static function rule(): string
    {
        return 'in:'.implode(',', self::keys());
    }

    /**
     * იგივე, **მსახიობის გარეშე** — `in:movie,series,anime,song,book,game`.
     *
     * ⚠️ ჯგუფების ჭრილს დომენის ტაბები დაემატა (ეტაპი 2) და მისი `type`
     * `MediaDomain::rule()`-ზე იყო მიბმული — ე.ი. სიმღერის ან წიგნის ტაბი
     * **422-ს** აბრუნებდა, თუმცა თვითონ სია ამ მშობლებს ისედაც ხატავდა.
     */
    public static function recordRule(): string
    {
        return 'in:'.implode(',', self::recordKeys());
    }
}
