<?php

namespace App\Support;

use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\BoardGameFile;
use App\Models\BoardGameNote;
use App\Models\Book;
use App\Models\BookFile;
use App\Models\Bookmark;
use App\Models\BookNote;
use App\Models\Course;
use App\Models\CourseFile;
use App\Models\DatabaseBackup;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\GalleryVideo;
use App\Models\Game;
use App\Models\GameFile;
use App\Models\GameNote;
use App\Models\GameVideo;
use App\Models\MediaWatch;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\NoteEntryFile;
use App\Models\NoteReminder;
use App\Models\Place;
use App\Models\PlaceFile;
use App\Models\Playlist;
use App\Models\Series;
use App\Models\Song;
use App\Models\Video;
use App\Models\VideoFile;
use App\Models\VideoNote;
use Illuminate\Database\Eloquent\Model;

/**
 * **რომელი ჩანაწერი მიდის კალათაში (FEAT-11).**
 *
 * ⚠️ **ერთი რუკა და არა ათი ადგილას გამეორებული სია** — მიგრაცია,
 * კალათის კონტროლერი, გასუფთავების ბრძანება და `RegistryConsistencyTest`
 * ერთსა და იმავეს კითხულობენ. `MediaDomain`-ის იგივე წესი: `['movie',
 * 'series']` თოთხმეტ ადგილას ეწერა და ერთის გამორჩენა ჩუმი იყო.
 *
 * ⚠️ **სამი სახის ელემენტი, სამი რუკა** (Tasks §29): `MODELS` — მოდულის
 * ჩანაწერი (FEAT-11); `ITEMS` — რიგიანი ფაილი ან ბმული, რომელსაც თავისი
 * `trashed_at` აქვს (გალერეის ფოტო, ვიდეო-ბმული, მოდულების ფაილები, ბაზის
 * ასლი); `FILES` — `trashed_files`-ის რიგი, ე.ი. ფაილი, რომლის წყაროს რიგი
 * წაშლისას ქრება ან ცარიელდება (ჩატის მიმაგრება, დამატებითი ველის ფაილი).
 * სამივე ერთ სახელთა სივრცეშია (`kinds()`), რადგან ურნის მარშრუტი ერთია —
 * `/trash/{kind}/{id}`.
 *
 * ⚠️ **ჩანაწერის ურნაში გადატანა მის ფაილებს არ ეხება** — ისინი ადგილზე
 * რჩება და ჩანაწერთან ერთად ბრუნდება; ცალკე წაშლილი ფაილი კი ურნაში
 * თავისი ელემენტია. ⚠️ მოდულის ფაილის ცხრილი მშობლის `booted()`-ში
 * **`trash` scope-ის გარეშე** უნდა იშლებოდეს, თორემ ჩანაწერის საბოლოო
 * წაშლა ურნაში მყოფ ფაილს დისკზე ობლად დატოვებდა (BUG-21-ის გაკვეთილი).
 */
final class TrashDomain
{
    /**
     * დომენი → მოდელი.
     *
     * @var array<string, class-string<Model>>
     */
    public const MODELS = [
        'movie' => Movie::class,
        'series' => Series::class,
        'anime' => Anime::class,
        'video' => Video::class,
        'song' => Song::class,
        'book' => Book::class,
        'board_game' => BoardGame::class,
        'game' => Game::class,
        'note' => NoteEntry::class,
        'bookmark' => Bookmark::class,
        'course' => Course::class,
        'place' => Place::class,
    ];

    /**
     * **რიგიანი ფაილები და ბმულები (Tasks §29, ეტაპი 1)** — `kind` → მოდელი,
     * მოდული (უფლება და ფერი მისია) და მშობლის ურთიერთობა.
     *
     * ⚠️ `kind` **`StorageMeter::files()`-ის `owner_type`-ია** — ერთი სახელი
     * ერთი ფაქტისთვის; ურნის ზომის დათვლა სწორედ ამ დამთხვევაზე დგას.
     *
     * ⚠️ `module = null` — `modules` ცხრილში რიგი არ აქვს (ბაზის ასლი
     * `super_admin`-ისაა, ე.ი. ხილვადობას ის წყვეტს და არა მოდულის უფლება).
     * `@morph` — მოდული რიგისაა (ყურების ჟურნალი სამ მედია-დომენს ემსახურება).
     *
     * ⚠️ `size` — აქვს თუ არა ცხრილს `size` სვეტი: ჯგუფის მოცულობა SQL-ის
     * `sum()`-ით ითვლება და ფაილის გარეშე ცხრილზე ის შეცდომა იქნებოდა.
     *
     * @var array<string, array{model: class-string<Model>, module: ?string, parent: ?string, size: bool}>
     */
    public const ITEMS = [
        'gallery_image' => ['model' => GalleryImage::class, 'module' => 'gallery', 'parent' => 'imageable', 'size' => true],
        'gallery_video' => ['model' => GalleryVideo::class, 'module' => 'gallery', 'parent' => 'videoable', 'size' => false],
        'video_file' => ['model' => VideoFile::class, 'module' => 'video', 'parent' => 'video', 'size' => true],
        'book_file' => ['model' => BookFile::class, 'module' => 'book', 'parent' => 'book', 'size' => true],
        'board_game_file' => ['model' => BoardGameFile::class, 'module' => 'board_game', 'parent' => 'boardGame', 'size' => true],
        'game_file' => ['model' => GameFile::class, 'module' => 'game', 'parent' => 'game', 'size' => true],
        'note_entry_file' => ['model' => NoteEntryFile::class, 'module' => 'note', 'parent' => 'noteEntry', 'size' => true],
        'course_file' => ['model' => CourseFile::class, 'module' => 'course', 'parent' => 'course', 'size' => true],
        'place_file' => ['model' => PlaceFile::class, 'module' => 'place', 'parent' => 'place', 'size' => true],
        'database_backup' => ['model' => DatabaseBackup::class, 'module' => null, 'parent' => null, 'size' => true],

        // Tasks §29, ეტაპი 2 — ჩანაწერის ნაწილები
        'video_note' => ['model' => VideoNote::class, 'module' => 'video', 'parent' => 'video', 'size' => false],
        'book_note' => ['model' => BookNote::class, 'module' => 'book', 'parent' => 'book', 'size' => false],
        'game_note' => ['model' => GameNote::class, 'module' => 'game', 'parent' => 'game', 'size' => false],
        'board_game_note' => ['model' => BoardGameNote::class, 'module' => 'board_game', 'parent' => 'boardGame', 'size' => false],
        'game_video' => ['model' => GameVideo::class, 'module' => 'game', 'parent' => 'game', 'size' => false],
        'playlist' => ['model' => Playlist::class, 'module' => 'song', 'parent' => null, 'size' => false],
        'note_reminder' => ['model' => NoteReminder::class, 'module' => 'note', 'parent' => 'noteEntry', 'size' => false],
        'media_watch' => ['model' => MediaWatch::class, 'module' => '@morph', 'parent' => 'watchable', 'size' => false],
        'gallery_album' => ['model' => GalleryAlbum::class, 'module' => 'gallery', 'parent' => null, 'size' => false],
    ];

    /**
     * **`trashed_files`-ის სახეები** — ფაილი, რომლის წყაროს რიგიც წაშლისას
     * ქრება (ველის მნიშვნელობა) ან ცარიელდება (ჩატის შეტყობინება).
     *
     * ⚠️ ველის ფაილის მოდული **ჩანაწერისაა** (`record_type`) — ერთი `kind`
     * თერთმეტივე მოდულს ემსახურება, ამიტომ უფლება რიგ-რიგად მოწმდება.
     *
     * @var array<string, array{module: ?string}>
     */
    public const FILES = [
        'chat_file' => ['module' => null],
        'field_file' => ['module' => null],
    ];

    /**
     * **`trash_entries`-ის სახეები (Tasks §29, ეტაპი 2)** — ელემენტი, რომელსაც
     * არც საკუთარი რიგი აქვს და არც ფაილი: ჩანაწერიდან მოხსნილი მსახიობის
     * ბმული (`castables`-ს `id` არ აქვს). მოდული ჩანაწერისაა (`record_type`).
     *
     * @var array<string, array{permission: string}>
     */
    public const ENTRIES = [
        // ⚠️ `update` და არა `delete`: მსახიობის მოხსნა ჩანაწერის რედაქტირებაა (`RecordCastController`)
        'cast_link' => ['permission' => 'update'],
    ];

    /** რამდენ დღეს ინახება წაშლილი ჩანაწერი */
    public const KEEP_DAYS = 30;

    /** @return list<string> */
    public static function domains(): array
    {
        return array_keys(self::MODELS);
    }

    /**
     * ურნის ყველა სახე — ჩანაწერები, რიგიანი ფაილები და `trashed_files`.
     *
     * @return list<string>
     */
    public static function kinds(): array
    {
        return [
            ...array_keys(self::MODELS),
            ...array_keys(self::ITEMS),
            ...array_keys(self::FILES),
            ...array_keys(self::ENTRIES),
        ];
    }

    /** `record` · `item` · `file` · `entry` */
    public static function category(string $kind): ?string
    {
        return match (true) {
            isset(self::MODELS[$kind]) => 'record',
            isset(self::ITEMS[$kind]) => 'item',
            isset(self::FILES[$kind]) => 'file',
            isset(self::ENTRIES[$kind]) => 'entry',
            default => null,
        };
    }

    /**
     * რიგიანი ფაილების ცხრილები — მიგრაციისთვის.
     *
     * @return list<string>
     */
    public static function itemTables(): array
    {
        return array_values(array_map(
            fn (array $item) => (new $item['model'])->getTable(),
            self::ITEMS,
        ));
    }

    public static function has(string $domain): bool
    {
        return isset(self::MODELS[$domain]);
    }

    /** @return class-string<Model> */
    public static function model(string $domain): string
    {
        return self::MODELS[$domain];
    }

    /**
     * ცხრილების სია — მიგრაციისთვის.
     *
     * @return list<string>
     */
    public static function tables(): array
    {
        return array_values(array_map(
            fn (string $model) => (new $model)->getTable(),
            self::MODELS,
        ));
    }

    /**
     * ვალიდაციის წესი — `in:movie,series,…,gallery_image,…`.
     *
     * ⚠️ ჩაწერილი სია `MediaDomain::rule()`-ის იგივე ხაფანგს დაიჭერდა:
     * ახალი მოდული დაემატებოდა და ერთი endpoint ჩუმად 422-ს დააბრუნებდა.
     */
    public static function rule(): string
    {
        return 'in:'.implode(',', self::kinds());
    }
}
