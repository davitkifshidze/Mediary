<?php

namespace App\Support;

/**
 * **დისკის საქაღალდეები მოდულების მიხედვით** (user-ის გადაწყვეტილება 2026-09-04).
 *
 * აქამდე საქაღალდეები „დანიშნულების" მიხედვით ერქვა და მოდულებს ერეოდა:
 * `posters/` ერთდროულად ფილმისაც იყო და სერიალისაც, `videos/` — თამბნეილისაც
 * და მიმაგრებული ფოტოსიც, `documents/` კი ისე ჟღერდა, თითქოს ყველა მოდულის
 * დოკუმენტი იქ უნდა წასულიყო. ცხრილები უკვე სექციისაა (`video_files`,
 * `video_notes`, `gallery_images`), ე.ი. საქაღალდეც იმავე წესს უნდა
 * მიჰყვებოდეს: **ერთი მოდული = ერთი ფესვი**, შიგნით ქვესაქაღალდე დანიშნულებაზე.
 *
 *   account/avatars        — ავატარი (მოდული არაა, ანგარიშია)
 *   movies/posters         — ფილმის პოსტერი
 *   series/posters         — სერიალის პოსტერი
 *   videos/thumbnails      — ვიდეოს თამბნეილი
 *   videos/files/images    — `video_files` (kind = image)
 *   videos/files/docs      — `video_files` (kind = doc)
 *   songs/thumbnails       — სიმღერის ფოტო
 *   books/covers           — წიგნის ყდა
 *   books/files/{ebooks,images,docs} — `book_files` (pdf/epub და თანმხლები)
 *   boardgames/images      — ბორდგეიმის ფოტო
 *   boardgames/files/{rules,images,docs} — `board_game_files` (წესები, გალერეა)
 *   games/covers           — თამაშის ყდა
 *   games/files/{images,docs} — `game_files` (ატვირთული სქრინშოტი/დოკუმენტი)
 *   notes/files/{images,videos,docs} — `note_entry_files`
 *   bookmarks/thumbnails   — `bookmarks.thumbnail_path`
 *   bookmarks/files/images — `bookmark_files.path` (ჩემი ფოტოები)
 *   courses/thumbnails     — `courses.thumbnail_path`
 *   courses/files/*        — `course_files.path` (`image`/`doc`; ძველი სერტიფიკატები — `certificates/`)
 *   {მოდულის ფესვი}/fields — `<module>_field_values.value_path`
 *   gallery/images         — `gallery_images` (polymorphic)
 *   chat/files/{images,videos,docs} — `messages.attachment_path` (**პრივატული**)
 *   cast/photos            — მსახიობის ფოტო (გლობალური ლექსიკონი, არა მოდული)
 *   personal/{photos,videos,thumbs} — პირადი გალერეა (**პრივატული**)
 *
 * ⚠️ ეს კლასი **ერთადერთი წყაროა**: ატვირთვა პირდაპირ სტრიქონს არ წერს.
 * ახალი მოდული ერთ ფესვს ამატებს `ROOTS`-ში და თავის კონსტანტას აქ.
 */
final class StorageFolder
{
    public const AVATARS = 'account/avatars';

    public const MOVIE_POSTERS = 'movies/posters';

    public const SERIES_POSTERS = 'series/posters';

    /** ანიმეს **თავისი** ფესვი: ბრტყელ საქაღალდეში ერთნაირი
     *  slug-ის სერიალი და ანიმე ერთმანეთს გადააწერდნენ */
    public const ANIME_POSTERS = 'anime/posters';

    public const VIDEO_THUMBNAILS = 'videos/thumbnails';

    public const VIDEO_IMAGES = 'videos/files/images';

    public const VIDEO_DOCS = 'videos/files/docs';

    /**
     * `yt-dlp`-ით ლოკალურად ჩამოწერილი ვიდეო.
     *
     * ⚠️ **პრივატულ დისკზეა**, თუმცა ფესვი (`videos/`) საჯაროა — იხ.
     * `PRIVATE_FOLDERS`. მიზეზი მარტივია: ჩამოწერილი ფაილი მთელი ვიდეოა და
     * `/storage/*`-ით ღიად დადება მას ინტერნეტში გამოაქვს.
     */
    public const VIDEO_DOWNLOADS = 'videos/downloads';

    public const SONG_THUMBNAILS = 'songs/thumbnails';

    public const BOOK_COVERS = 'books/covers';

    public const BOOK_EBOOKS = 'books/files/ebooks';

    public const BOOK_IMAGES = 'books/files/images';

    public const BOOK_DOCS = 'books/files/docs';

    public const BOARD_GAME_IMAGES = 'boardgames/images';

    public const BOARD_GAME_RULES = 'boardgames/files/rules';

    public const BOARD_GAME_PHOTOS = 'boardgames/files/images';

    public const BOARD_GAME_DOCS = 'boardgames/files/docs';

    public const GAME_COVERS = 'games/covers';

    public const GAME_IMAGES = 'games/files/images';

    /** ბუკმარკის ატვირთული ფოტო (og:image **არ** ჩამოგვაქვს — ის დაშორებული URL-ია) */
    public const BOOKMARK_THUMBNAILS = 'bookmarks/thumbnails';

    /** ბუკმარკზე მიმაგრებული ჩემი ფოტოები („შოპინგის" სკრინშოტი) */
    public const BOOKMARK_IMAGES = 'bookmarks/files/images';

    /** კურსის ესკიზი (og:image დაშორებული რჩება, ბუკმარკის წესი) */
    public const COURSE_THUMBNAILS = 'courses/thumbnails';

    public const COURSE_IMAGES = 'courses/files/images';

    public const COURSE_DOCS = 'courses/files/docs';

    /** ადგილის მთავარი ფოტო */
    public const PLACE_PHOTOS = 'places/photos';

    public const PLACE_IMAGES = 'places/files/images';

    public const PLACE_DOCS = 'places/files/docs';

    public const NOTE_IMAGES = 'notes/files/images';

    public const NOTE_VIDEOS = 'notes/files/videos';

    public const NOTE_DOCS = 'notes/files/docs';

    public const GALLERY_IMAGES = 'gallery/images';

    /**
     * **ჩაკეტილი ალბომის ფოტოები — პირად დისკზე.**
     *
     * ⚠️ `videos/downloads`-ის ზუსტი პრეცედენტი: საჯარო ფესვის შიგნით
     * პრივატული ქვესაქაღალდე. უამისოდ ლოკი მხოლოდ **პასუხს** ფარავდა,
     * ფაილი კი საჯარო დისკზე რჩებოდა — ე.ი. დამახსოვრებული
     * `/storage/gallery/images/…` ბმული მაინც იხსნებოდა.
     */
    public const GALLERY_LOCKED = 'gallery/locked';

    public const CHAT_IMAGES = 'chat/files/images';

    public const CHAT_VIDEOS = 'chat/files/videos';

    public const CHAT_DOCS = 'chat/files/docs';

    public const CAST_PHOTOS = 'cast/photos';

    /**
     * **ხელით შექმნილი მსახიობის ატვირთული ფოტო** — `cast/uploads/{id}/…`.
     *
     * ⚠️ `cast/photos` TMDB-ის საერთო ფაილია და კვოტაში არ ითვლება; ეს კი
     * შემქმნელის ატვირთვაა და **მის კვოტაშია** (`StorageMeter::files()`). ცალკე
     * საქაღალდე სწორედ ამ ორის გასარჩევადაა (`CastMember::ownsPhotoFile()`).
     */
    public const CAST_UPLOADS = 'cast/uploads';

    /**
     * **პირადი გალერეა — მთელი ფესვი პირად დისკზეა.**
     *
     * ⚠️ ახლობლების ფოტოები და ვიდეოებია — `/storage/*`-ით ღიად დადება მათ
     * ინტერნეტში გამოიტანდა (ჩატის/ჩანაწერების წესი). ფაილი მხოლოდ
     * მფლობელობაშემოწმებული მარშრუტით გამოდის (`PersonalMediaController`).
     */
    public const PERSONAL_PHOTOS = 'personal/photos';

    public const PERSONAL_VIDEOS = 'personal/videos';

    /** ფოტოს შემცირებული ასლი და ვიდეოს კადრი — ბადეები და დასტები ამას ხატავს */
    public const PERSONAL_THUMBS = 'personal/thumbs';

    /**
     * **ბაზის დამპი**.
     *
     * ⚠️ **პრივატულ დისკზეა და ეს არ განიხილება.** ფაილი მთელი ბაზის ასლია —
     * `/storage/*`-ით დადებული ის ყველა ანგარიშის ყველა ჩანაწერს, ჰეშირებულ
     * პაროლსა და სესიას ინტერნეტში გამოიტანდა. გამოსვლის ერთადერთი გზა
     * `super_admin`-ით დაცული `GET /api/admin/backups/{id}/download`-ია.
     */
    public const BACKUPS = 'backups';

    /**
     * ატვირთვების **ფესვები** — ობოლების სკანერი მხოლოდ აქ იყურება.
     * სკანირება რეკურსიულია, ე.ი. ქვესაქაღალდის დამატება აქ არაფერს მოითხოვს.
     */
    public const ROOTS = [
        'account', 'movies', 'series', 'anime', 'videos', 'songs', 'books', 'boardgames', 'games', 'notes', 'bookmarks', 'courses', 'places', 'gallery', 'chat', 'cast', 'backups',
        // პირადი გალერეა (პრივატული ფესვი)
        'personal',
        // მორიგეობის დამატებითი ველების ფაილები (პრივატული)
        'duty',
        // ყველა პირადი მოდული ერთ ფესვში, `custom/{key}/…`
        CustomModules::ROOT,
    ];

    /**
     * **პრივატულ დისკზე მცხოვრები ფესვები.**
     *
     * ⚠️ ეს **ერთადერთი ადგილია**, სადაც წყდება, რომელი ატვირთვა არ უნდა
     * იხსნებოდეს `/storage/*`-ით. დანარჩენი კოდი მხოლოდ `diskFor()`-ს
     * ეკითხება — ე.ი. ახალი პრივატული სექცია (ჩატი) აქ ერთი
     * სტრიქონია და არა ათი `if`.
     *
     * ⚠️ **პოსტერები/გალერეა განზრახ საჯაროა**: ისინი TMDB-ის საჯარო
     * სურათებია და საჯარო პროფილზეც ჩანს. პრივატულია ის, რაც
     * user-ის **პირადი დოკუმენტია** — `notes/`.
     */
    public const PRIVATE_ROOTS = ['notes', 'chat', 'backups', 'personal', 'duty'];

    /**
     * **პრივატული ქვესაქაღალდე საჯარო ფესვში.**
     *
     * ⚠️ `PRIVATE_ROOTS` მხოლოდ **პირველ სეგმენტს** უყურებს და განზრახ —
     * თორემ ხვალინდელი `notes-archive/` ჩუმად პრივატული გახდებოდა. ვიდეოს
     * მოდულს კი ორივე სჭირდება: თამბნეილი საჯაროა (ბარათზე `<img>`-ია),
     * ჩამოწერილი ფაილი — არა. ამიტომ აქ **ორსეგმენტიანი** სია დგას და
     * შედარება ისევ სეგმენტებზეა (`videos/downloads-old` არ ჩაითვლება).
     *
     * ⚠️ ყოველი ასეთი საქაღალდე `StorageMeter::UPLOAD_FOLDERS`-შიც უნდა
     * მოხვდეს ცალკე: ობოლების სკანერი დისკს **ფესვზე** ირჩევს, ე.ი. საჯარო
     * `videos`-ის სკანი პრივატულ `videos/downloads`-ს ვერ დაინახავდა.
     */
    public const PRIVATE_FOLDERS = ['videos/downloads', 'gallery/locked'];

    /**
     * 2026-09-04-მდე გამოყენებული ბრტყელი საქაღალდეები. მიგრაცია ბაზაში
     * ნახსენებ ფაილებს გადაიტანს; რაც აქ დარჩება, **ობოლია** — ამიტომ სკანერს
     * ისინი კიდევ ვუჩვენოთ, რომ ადმინმა გაასუფთაოს და საქაღალდე გაქრეს.
     */
    public const LEGACY_ROOTS = ['avatars', 'posters', 'actors', 'documents'];

    /**
     * **ფესვი → მოდულის key.**
     *
     * ⚠️ ეს რუკა **უნდა ემთხვეოდეს** `StorageMeter::files()`-ის `module`
     * ველს — თორემ ატვირთვა ერთ მოდულს დაეთვლებოდა, ლიმიტი კი მეორეს
     * ამოწმებდა და user ვერ მიხვდებოდა, რატომ არ ეტევა.
     *
     * ⚠️ `account`, `chat` და `cast` **მოდულები არ არიან**: პირველი ანგარიშისაა
     * (ავატარი), მეორე სოციალური ფენაა (`modules` ცხრილში ჩანაწერი
     * არ აქვს), მესამე გლობალური ლექსიკონია და კვოტაში საერთოდ არ ითვლება.
     * სამივე საერთო აუზში რჩება — ლიმიტს ვერ მიიღებს.
     */
    private const MODULE_BY_ROOT = [
        'movies' => 'movie',
        'series' => 'series',
        'anime' => 'anime',
        'videos' => 'video',
        'songs' => 'song',
        'books' => 'book',
        'boardgames' => 'board_game',
        'games' => 'game',
        'notes' => 'note',
        'bookmarks' => 'bookmark',
        'courses' => 'course',
        'places' => 'place',
        // ფესვი და მოდული ერთი სიტყვაა (მოდულის ლიმიტი და კვოტის ჯამი ერთს ითვლის)
        'personal' => 'personal',
        // მორიგეობის ველის ფაილი (ტაბელის სკანი) მისი მოდულის ლიმიტშია
        'duty' => 'duty',
        'gallery' => 'gallery',
        'account' => 'account',
        'chat' => 'chat',
        'cast' => 'cast',
        /* ფსევდომოდული, `chat`/`account`-ის წესით: `modules` ცხრილში
           რიგი არ აქვს, ე.ი. ცალკე ლიმიტს ვერ იღებს და საერთო აუზში რჩება. */
        'backups' => 'backup',
    ];

    /** გზა/საქაღალდე → მოდულის key; `null` — უცნობი ფესვი (მაგ. legacy) */
    public static function moduleFor(string $pathOrFolder): ?string
    {
        $parts = explode('/', ltrim($pathOrFolder, '/'), 3);

        /* ⚠️ **პირადი მოდული მეორე სეგმენტშია** (`custom/{key}/…`):
           ერთი ფესვი ყველასთვის, რომ ობოლების სკანერს ახალი ფესვი არ
           სჭირდებოდეს, ხოლო მოდულის ლიმიტი ისევ თავის მოდულს
           ითვლიდეს. უცნობ გასაღებს მოდული არ ეძლევა. */
        if ($parts[0] === CustomModules::ROOT) {
            return isset($parts[1]) && CustomModules::isKey($parts[1]) ? $parts[1] : null;
        }

        return self::MODULE_BY_ROOT[$parts[0]] ?? null;
    }

    /**
     * რომელ დისკზე ცხოვრობს ეს გზა/საქაღალდე.
     *
     * ⚠️ მუშაობს **ორივეზე** — გზაზეც (`notes/files/docs/x.pdf`) და თვითონ
     * საქაღალდეზეც (`notes/files/docs`), რადგან ატვირთვამდე ჯერ მხოლოდ
     * საქაღალდე ვიცით. შედარება პირველ სეგმენტზეა და არა `str_starts_with`-ით:
     * თორემ ხვალინდელი `notes-archive/` ფესვი ჩუმად პრივატული გახდებოდა.
     */
    public static function diskFor(string $pathOrFolder): string
    {
        return self::isPrivate($pathOrFolder) ? 'private' : 'public';
    }

    public static function isPrivate(string $pathOrFolder): bool
    {
        $parts = explode('/', trim($pathOrFolder, '/'));

        if (in_array($parts[0], self::PRIVATE_ROOTS, true)) {
            return true;
        }

        // საჯარო ფესვის პრივატული ქვესაქაღალდე (`videos/downloads`)
        return isset($parts[1]) && in_array($parts[0].'/'.$parts[1], self::PRIVATE_FOLDERS, true);
    }

    /**
     * გალერეის ფაილია?
     *
     * ⚠️ „მთავარად დაყენება" ჩანაწერის სვეტს გალერეის ფაილზე მიუთითებს — ის
     * `gallery_images`-ის რიგს ეკუთვნის და არა სვეტს: მისი წაშლა ან ურნაში
     * „სვეტის ფაილად" გადატანა გალერეის ფოტოს ფაილს წაშლიდა და კვოტას
     * ორჯერ დააბრუნებდა.
     */
    public static function inGallery(string $path): bool
    {
        $root = explode('/', trim($path, '/'))[0];

        return $root === 'gallery';
    }

    /** პოსტერის საქაღალდე morph alias-ით (`movie` | `series` | `anime`) */
    public static function posters(string $morphAlias): string
    {
        return match ($morphAlias) {
            'series' => self::SERIES_POSTERS,
            'anime' => self::ANIME_POSTERS,
            default => self::MOVIE_POSTERS,
        };
    }

    /** `video_files.kind` → საქაღალდე */
    public static function videoFiles(string $kind): string
    {
        return $kind === 'doc' ? self::VIDEO_DOCS : self::VIDEO_IMAGES;
    }

    /** `book_files.kind` → საქაღალდე */
    public static function bookFiles(string $kind): string
    {
        return match ($kind) {
            'image' => self::BOOK_IMAGES,
            'doc' => self::BOOK_DOCS,
            default => self::BOOK_EBOOKS,
        };
    }

    /** კურსის ფაილი სახის მიხედვით */
    public static function courseFiles(string $kind): string
    {
        return match ($kind) {
            'image' => self::COURSE_IMAGES,
            default => self::COURSE_DOCS,
        };
    }

    /** ადგილის ფაილი სახის მიხედვით */
    public static function placeFiles(string $kind): string
    {
        return match ($kind) {
            'image' => self::PLACE_IMAGES,
            default => self::PLACE_DOCS,
        };
    }

    /** პირადი გალერეის ფაილი სახის მიხედვით (`photo` · `video`) */
    public static function personalMedia(string $kind): string
    {
        return $kind === 'video' ? self::PERSONAL_VIDEOS : self::PERSONAL_PHOTOS;
    }

    /** `board_game_files.kind` → საქაღალდე */
    public static function boardGameFiles(string $kind): string
    {
        return match ($kind) {
            'image' => self::BOARD_GAME_PHOTOS,
            'doc' => self::BOARD_GAME_DOCS,
            default => self::BOARD_GAME_RULES,
        };
    }

    /** `note_entry_files.kind` → საქაღალდე */
    public static function noteFiles(string $kind): string
    {
        return match ($kind) {
            'image' => self::NOTE_IMAGES,
            'video' => self::NOTE_VIDEOS,
            default => self::NOTE_DOCS,
        };
    }

    /**
     * **მორგებული `ფაილი` ველის საქაღალდე** — მოდულის key-დან.
     *
     * ⚠️ **ახალი ფესვი განზრახ არ ჩნდება**: ფაილი მოდულის **თავის** ფესვში
     * ჯდება (`movies/fields`, `videos/fields`…), ე.ი. სამივე მექანიზმი
     * უცვლელად მუშაობს — `moduleFor()` ლიმიტს სწორ მოდულს მიაწერს,
     * ობოლების სკანერი რეკურსიულია და მას აქ დამატება არ სჭირდება, ხოლო
     * `notes/fields` **ავტომატურად პრივატულ დისკზეა** (`PRIVATE_ROOTS`).
     * ცალკე `fields/` ფესვი სამივეს გატეხავდა.
     */
    public static function customFields(string $module): string
    {
        // პირადი მოდულის ველი თავის ქვესაქაღალდეშია (`custom/{key}/fields`)
        if (CustomModules::isKey($module)) {
            return CustomModules::folder($module, 'fields');
        }

        $root = array_search($module, self::MODULE_BY_ROOT, true);

        // უცნობ მოდულს (მაგ. კატალოგიდან ამოღებულს) ცალკე ფესვი არ ეძლევა —
        // `account` საერთო აუზშია და ლიმიტს ისედაც ვერ იღებს
        return ($root === false ? 'account' : $root).'/fields';
    }

    /** პირადი მოდულის ჩანაწერის მთავარი ფოტო */
    public static function customPhotos(string $module): string
    {
        return CustomModules::folder($module, 'photos');
    }

    /** პირადი მოდულის ჩანაწერის ფაილი სახის მიხედვით */
    public static function customFiles(string $module, string $kind): string
    {
        return CustomModules::folder($module, $kind === 'doc' ? 'files/docs' : 'files/images');
    }

    /**
     * `messages.type` → საქაღალდე.
     *
     * ⚠️ ფესვი `chat/` **პრივატულ დისკზეა** (`PRIVATE_ROOTS`): პირადი
     * მიმოწერის სურათი `/storage/*`-ით ვერ უნდა იხსნებოდეს, თუნდაც
     * ბმული ვინმემ გაიგოს.
     */
    public static function chatFiles(string $type): string
    {
        return match ($type) {
            'image' => self::CHAT_IMAGES,
            'video' => self::CHAT_VIDEOS,
            default => self::CHAT_DOCS,
        };
    }
}
