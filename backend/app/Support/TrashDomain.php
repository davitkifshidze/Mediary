<?php

namespace App\Support;

use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\BoardGameFile;
use App\Models\BoardGameGenre;
use App\Models\BoardGameNote;
use App\Models\Book;
use App\Models\BookFile;
use App\Models\BookGenre;
use App\Models\Bookmark;
use App\Models\BookmarkCategory;
use App\Models\BookNote;
use App\Models\Course;
use App\Models\CourseCategory;
use App\Models\CourseFile;
use App\Models\CustomCategory;
use App\Models\CustomRecord;
use App\Models\CustomRecordFile;
use App\Models\CustomRecordNote;
use App\Models\DatabaseBackup;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\GalleryVideo;
use App\Models\Game;
use App\Models\GameFile;
use App\Models\GameGenre;
use App\Models\GameNote;
use App\Models\GameVideo;
use App\Models\MediaWatch;
use App\Models\Movie;
use App\Models\NoteCategory;
use App\Models\NoteEntry;
use App\Models\NoteEntryFile;
use App\Models\NoteReminder;
use App\Models\Place;
use App\Models\PlaceCategory;
use App\Models\PlaceFile;
use App\Models\PlaceRoute;
use App\Models\Playlist;
use App\Models\Series;
use App\Models\Song;
use App\Models\SongGenre;
use App\Models\Status;
use App\Models\Video;
use App\Models\VideoFile;
use App\Models\VideoNote;
use App\Models\VideoType;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * **რომელი ჩანაწერი მიდის კალათაში (FEAT-11).**
 *
 * ⚠️ **ერთი რუკა და არა ათი ადგილას გამეორებული სია** — მიგრაცია,
 * კალათის კონტროლერი, გასუფთავების ბრძანება და `RegistryConsistencyTest`
 * ერთსა და იმავეს კითხულობენ. `MediaDomain`-ის იგივე წესი: `['movie',
 * 'series']` თოთხმეტ ადგილას ეწერა და ერთის გამორჩენა ჩუმი იყო.
 *
 * ⚠️ **ხუთი სახის ელემენტი, ხუთი რუკა** (Tasks §29): `MODELS` — მოდულის
 * ჩანაწერი (FEAT-11); `ITEMS` — რიგიანი ფაილი ან ბმული, რომელსაც თავისი
 * `trashed_at` აქვს (გალერეის ფოტო, ვიდეო-ბმული, მოდულების ფაილები, ბაზის
 * ასლი); `FILES` — `trashed_files`-ის რიგი, ე.ი. ფაილი, რომლის წყაროს რიგი
 * წაშლისას ქრება ან ცარიელდება (ჩატის მიმაგრება, დამატებითი ველის ფაილი).
 * `ENTRIES` — `trash_entries` (მსახიობის ბმული), `MESSAGES` — `trashed_messages`
 * (ჩატის წერილი). ყველა ერთ სახელთა სივრცეშია (`kinds()`), რადგან ურნის
 * მარშრუტი ერთია — `/trash/{kind}/{id}`.
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
     * `module_column` — მოდული **რიგისაა** და ამ სვეტიდან იკითხება (ყურების
     * ჟურნალი სამ მედია-დომენს ემსახურება, სტატუსი — ექვსს).
     *
     * ⚠️ `size` — აქვს თუ არა ცხრილს `size` სვეტი: ჯგუფის მოცულობა SQL-ის
     * `sum()`-ით ითვლება და ფაილის გარეშე ცხრილზე ის შეცდომა იქნებოდა.
     *
     * @var array<string, array{model: class-string<Model>, module: ?string, module_column?: string, parent: ?string, size: bool}>
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
        // Tasks §30.4 — შენახული მარშრუტი: ფაილი არ აქვს, ზომა არ ითვლება
        'place_route' => ['model' => PlaceRoute::class, 'module' => 'place', 'parent' => 'place', 'size' => false],
        'database_backup' => ['model' => DatabaseBackup::class, 'module' => null, 'parent' => null, 'size' => true],

        // Tasks §29, ეტაპი 2 — ჩანაწერის ნაწილები
        'video_note' => ['model' => VideoNote::class, 'module' => 'video', 'parent' => 'video', 'size' => false],
        'book_note' => ['model' => BookNote::class, 'module' => 'book', 'parent' => 'book', 'size' => false],
        'game_note' => ['model' => GameNote::class, 'module' => 'game', 'parent' => 'game', 'size' => false],
        'board_game_note' => ['model' => BoardGameNote::class, 'module' => 'board_game', 'parent' => 'boardGame', 'size' => false],
        'game_video' => ['model' => GameVideo::class, 'module' => 'game', 'parent' => 'game', 'size' => false],
        'playlist' => ['model' => Playlist::class, 'module' => 'song', 'parent' => null, 'size' => false],
        'note_reminder' => ['model' => NoteReminder::class, 'module' => 'note', 'parent' => 'noteEntry', 'size' => false],
        'media_watch' => ['model' => MediaWatch::class, 'module' => null, 'module_column' => 'watchable_type', 'parent' => 'watchable', 'size' => false],
        'gallery_album' => ['model' => GalleryAlbum::class, 'module' => 'gallery', 'parent' => null, 'size' => false],

        // Tasks §29, ეტაპი 3 — კლასიფიკატორის რიგი (`DictionaryTrash`)
        'status' => ['model' => Status::class, 'module' => null, 'module_column' => 'module', 'parent' => null, 'size' => false],
        'video_type' => ['model' => VideoType::class, 'module' => 'video', 'parent' => null, 'size' => false],
        'song_genre' => ['model' => SongGenre::class, 'module' => 'song', 'parent' => null, 'size' => false],
        'book_genre' => ['model' => BookGenre::class, 'module' => 'book', 'parent' => null, 'size' => false],
        'board_game_genre' => ['model' => BoardGameGenre::class, 'module' => 'board_game', 'parent' => null, 'size' => false],
        'game_genre' => ['model' => GameGenre::class, 'module' => 'game', 'parent' => null, 'size' => false],
        'note_category' => ['model' => NoteCategory::class, 'module' => 'note', 'parent' => null, 'size' => false],
        'bookmark_category' => ['model' => BookmarkCategory::class, 'module' => 'bookmark', 'parent' => null, 'size' => false],
        'course_category' => ['model' => CourseCategory::class, 'module' => 'course', 'parent' => null, 'size' => false],
        'place_category' => ['model' => PlaceCategory::class, 'module' => 'place', 'parent' => null, 'size' => false],
        /* Tasks §37 — პირადი მოდულის კლასიფიკატორი; მოდული რიგშია (`module`),
           ერთი სახე ყველა პირად მოდულზე (სტატუსის იგივე ფორმა). */
        'custom_category' => ['model' => CustomCategory::class, 'module' => null, 'module_column' => 'module', 'parent' => null, 'size' => false],
        /* Tasks §37.5 — პირადი მოდულის ჩანაწერის ფაილი და ჩანიშვნა. ⚠️ მოდული
           რიგშია და მშობელიც მისი გასაღებით იკითხება (`TrashBin::parentRef()`). */
        'custom_record_file' => ['model' => CustomRecordFile::class, 'module' => null, 'module_column' => 'module', 'parent' => 'record', 'size' => true],
        'custom_record_note' => ['model' => CustomRecordNote::class, 'module' => null, 'module_column' => 'module', 'parent' => 'record', 'size' => false],
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
        // ეტაპი 4 — სვეტის ფაილი (`ColumnTrash`); მოდული ჩანაწერისაა, უფლება — `update`
        'record_photo' => ['module' => null],
        'avatar' => ['module' => null],
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
        /* Tasks §29.8 — აუდიტის ლოგის გასუფთავება ერთ ელემენტად (`AuditLogTrash`).
           ⚠️ მოდულის უფლება აქ არაფერს ნიშნავს (`null`): ელემენტი გამწმენდისაა
           და ყოველთვის ჩანს, აღდგენას კი `admin:audit` სჭირდება. */
        'audit_log' => ['permission' => null],
        /* Tasks §37.7 — პირადი მოდული ჩანაწერებთან ერთად, ერთ ელემენტად
           (`CustomModuleTrash`). ⚠️ უფლება მფლობელობაა და არა როლი: მოდული
           პირადია და მისი ელემენტი მხოლოდ მფლობელის ურნაშია. */
        'custom_module' => ['permission' => null],
    ];

    /**
     * **ჩატის წერილი (Tasks §29, ეტაპი 5)** — `trashed_messages`-ის რიგი.
     *
     * ⚠️ **წერილი ისედაც რჩება** (`removed_at` · `message_hides`), ე.ი. ეს სახე
     * მხოლოდ „ჯერ კიდევ აღდგება"-ს ამბობს: საბოლოო წაშლა და ვადის გასვლა
     * ურნის რიგს შლის და წერილს დამალულს ტოვებს. მოდული არ აქვს (ჩატი
     * `modules`-ში არ არის), ამიტომ ყველას ეკუთვნის თავისი.
     *
     * @var list<string>
     */
    public const MESSAGES = ['chat_message'];

    /**
     * რამდენ დღეს ინახება წაშლილი — **ნაგულისხმევი** ვადა.
     *
     * ⚠️ Tasks §29.6-ის შემდეგ ვადა თითო ანგარიშისაა (`UserSettings::trashDays()`);
     * ეს მხოლოდ მისი ნაგულისხმევია და ზედა ზღვრით იკვეცება (`defaultDays()`).
     */
    public const KEEP_DAYS = 30;

    /** ვადის ქვედა ზღვარი — 0 დღე ურნას საერთოდ გააუქმებდა */
    public const MIN_DAYS = 1;

    /** ზედა ზღვრის ჭერი — სუპერადმინი მეტს ვერ დააწესებს (ათი წელი) */
    public const MAX_DAYS_CEILING = 3650;

    /** `app_settings`-ის გასაღები (Tasks §34.1) */
    public const MAX_DAYS_SETTING = 'trash.max_days';

    /**
     * **ზედა ზღვარი — ინსტალაციისაა** (Tasks §29.6 → §34.1): სუპერადმინი
     * `/settings`-ზე ცვლის (`app_settings`), ნაგულისხმევი კი ისევ
     * `config('mediary.trash.max_days')`-ია (`TRASH_MAX_DAYS`, 365).
     */
    public static function maxDays(): int
    {
        $days = AppSettings::get(self::MAX_DAYS_SETTING, self::configMaxDays());

        return min(max(self::MIN_DAYS, (int) $days), self::MAX_DAYS_CEILING);
    }

    /** ნაგულისხმევი ზედა ზღვარი — `config`-იდან (სუპერადმინის ცვლილების გარეშე) */
    public static function configMaxDays(): int
    {
        return min(max(self::MIN_DAYS, (int) config('mediary.trash.max_days', 365)), self::MAX_DAYS_CEILING);
    }

    /** ნაგულისხმევი ვადა — `KEEP_DAYS`, ზედა ზღვრით შეკვეცილი */
    public static function defaultDays(): int
    {
        return self::clampDays(self::KEEP_DAYS);
    }

    /** ვადა დასაშვებ ფარგლებში — `MIN_DAYS`…`maxDays()` */
    public static function clampDays(int $days): int
    {
        return min(max($days, self::MIN_DAYS), self::maxDays());
    }

    /**
     * ჩანაწერის სახეები — საბაზისო მოდულები **და პირადი მოდულები** (Tasks §37).
     *
     * ⚠️ პირადი მოდული **თავისი გასაღებით** არის სახე: ურნაში ის ცალკე ჯგუფად
     * ჩანს თავისი სახელით, ფერით და აიქონით — ზუსტად ისე, როგორც ფილმი ან
     * წიგნი. ყველა ერთ ცხრილშია (`custom_records`), ამიტომ ყოველი query
     * მოდულით იჭრება (`trashOf()` · `trashedBefore()`).
     *
     * @return list<string>
     */
    public static function domains(): array
    {
        return [...array_keys(self::MODELS), ...CustomModules::keys()];
    }

    /**
     * ერთი ანგარიშის ურნაში მყოფი ჩანაწერები ამ სახეზე — **პირად მოდულზე
     * მოდულითაც დაჭრილი**. ⚠️ `model($kind)::trashOf()` პირად მოდულზე ყველა
     * პირადი მოდულის ჩანაწერს დააბრუნებდა ერთ ჯგუფში.
     */
    public static function trashOf(string $kind, int $userId): Builder
    {
        $query = self::model($kind)::trashOf($userId);

        return self::isCustom($kind) ? $query->where(CustomModules::TABLE.'.module', $kind) : $query;
    }

    /** ვადაგასული ამ სახეზე (ყველა ანგარიშის) — იგივე მოდულის ჭრით */
    public static function trashedBefore(string $kind, CarbonInterface $before): Builder
    {
        $query = self::model($kind)::trashedBefore($before);

        return self::isCustom($kind) ? $query->where(CustomModules::TABLE.'.module', $kind) : $query;
    }

    /** პირადი მოდულის ჩანაწერის სახეა? */
    public static function isCustom(string $kind): bool
    {
        return ! isset(self::MODELS[$kind]) && CustomModules::exists($kind);
    }

    /**
     * ურნის ყველა სახე — ჩანაწერები, რიგიანი ფაილები და `trashed_files`.
     *
     * @return list<string>
     */
    public static function kinds(): array
    {
        return [
            ...self::domains(),
            ...array_keys(self::ITEMS),
            ...array_keys(self::FILES),
            ...array_keys(self::ENTRIES),
            ...self::MESSAGES,
        ];
    }

    /** `record` · `item` · `file` · `entry` · `message` */
    public static function category(string $kind): ?string
    {
        return match (true) {
            isset(self::MODELS[$kind]), self::isCustom($kind) => 'record',
            isset(self::ITEMS[$kind]) => 'item',
            isset(self::FILES[$kind]) => 'file',
            isset(self::ENTRIES[$kind]) => 'entry',
            in_array($kind, self::MESSAGES, true) => 'message',
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
        return isset(self::MODELS[$domain]) || self::isCustom($domain);
    }

    /** @return class-string<Model> */
    public static function model(string $domain): string
    {
        return self::MODELS[$domain] ?? CustomRecord::class;
    }

    /**
     * ცხრილების სია — მიგრაციისთვის.
     *
     * @return list<string>
     */
    public static function tables(): array
    {
        return [
            ...array_values(array_map(
                fn (string $model) => (new $model)->getTable(),
                self::MODELS,
            )),
            // Tasks §37 — პირადი მოდულის ჩანაწერები (სახე = მოდულის გასაღები, `domains()`)
            CustomModules::TABLE,
        ];
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
