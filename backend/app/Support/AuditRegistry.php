<?php

namespace App\Support;

use App\Models\Anime;
use App\Models\AnimeTranslation;
use App\Models\ApprovalRequest;
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
use App\Models\CastMember;
use App\Models\CastMemberTag;
use App\Models\CastMemberTranslation;
use App\Models\Conversation;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\GalleryVideo;
use App\Models\Game;
use App\Models\GameFile;
use App\Models\GameGenre;
use App\Models\GameNote;
use App\Models\GameVideo;
use App\Models\Genre;
use App\Models\GenreTranslation;
use App\Models\Message;
use App\Models\Module;
use App\Models\Movie;
use App\Models\MovieTranslation;
use App\Models\NoteCategory;
use App\Models\NoteEntry;
use App\Models\NoteEntryFile;
use App\Models\NoteReminder;
use App\Models\Playlist;
use App\Models\Role;
use App\Models\Series;
use App\Models\SeriesTranslation;
use App\Models\Song;
use App\Models\SongFile;
use App\Models\SongGenre;
use App\Models\SongNote;
use App\Models\Status;
use App\Models\User;
use App\Models\UserBlock;
use App\Models\Video;
use App\Models\VideoFile;
use App\Models\VideoNote;
use App\Models\VideoType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Str;

/**
 * **რა შედის აუდიტ-ლოგში (Tasks §4.3)** — ერთი რუკა, ერთი წყარო.
 *
 * ⚠️ **ეს რუკა თვითონაა მექანიზმი და არა დოკუმენტაცია.** `AppServiceProvider`
 * მასზე ატარებს ციკლს და ყოველ მოდელს `AuditObserver`-ს აბამს, ე.ი. ახალი
 * მოდელის ლოგირება = **ერთი რიგი აქ**. თუ ყოველი კონტროლერი თავისთვის
 * წერდა, ერთი აუცილებლად დაგვავიწყდებოდა — სწორედ ამას ითხოვს §4.3
 * („ერთი სერვისი + მოდელის მოვლენებზე მიბმა, ისე როგორც `StorageMeter`").
 *
 * ⚠️ **`module` აქ ყოველთვის `modules.key` არ არის.** ლოგში ისეთი რამეც
 * ხვდება, რასაც მოდულის რიგი არ აქვს — ანგარიში, ადმინის ზონა, ჩატი,
 * გლობალური ლექსიკონები. ისინი `PSEUDO_MODULES`-შია და ფილტრში ჩვეულებრივ
 * ჩანს; ე.ი. ლოგის „მოდულის" ფილტრი = `Module::key` ∪ `PSEUDO_MODULES`.
 */
class AuditRegistry
{
    /**
     * მოდელი → მოდულის (ან ფსევდო-მოდულის) key.
     *
     * ⚠️ **სექციური ცხრილებიც შედის** (`<module>_files`, `<module>_notes`):
     * ფაილის მიმაგრება ჩანაწერის ცვლილებაა და ლოგშიც ასე უნდა ჩანდეს.
     *
     * ⚠️ **განზრახ გამოტოვებული:** `NoteNotification` (მიწოდების რიგი —
     * მანქანა წერს, არა ადამიანი, და წუთში ერთხელ იცვლება) და თვითონ
     * `AuditLog` (ლოგის ლოგირება უსასრულო ციკლია).
     *
     * @var array<class-string<Model>, string>
     */
    public const MODELS = [
        // ---- მედია-დომენები
        Movie::class => 'movie',
        MovieTranslation::class => 'movie',
        Series::class => 'series',
        SeriesTranslation::class => 'series',
        Anime::class => 'anime',
        AnimeTranslation::class => 'anime',

        // ---- ვიდეო
        Video::class => 'video',
        VideoType::class => 'video',
        VideoFile::class => 'video',
        VideoNote::class => 'video',

        // ---- სიმღერები (+ პლეილისტები, რომლებიც ამ მოდულში ცხოვრობს)
        Song::class => 'song',
        SongGenre::class => 'song',
        // §7.4 — სიმღერის სექციის ცხრილები
        SongFile::class => 'song',
        SongNote::class => 'song',
        Playlist::class => 'song',

        // ---- წიგნები
        Book::class => 'book',
        BookGenre::class => 'book',
        BookFile::class => 'book',
        BookNote::class => 'book',

        // ---- ბორდგეიმები
        BoardGame::class => 'board_game',
        BoardGameGenre::class => 'board_game',
        BoardGameFile::class => 'board_game',
        BoardGameNote::class => 'board_game',

        // ---- თამაშები
        Game::class => 'game',
        GameGenre::class => 'game',
        GameVideo::class => 'game',
        GameFile::class => 'game',
        GameNote::class => 'game',

        // ---- ჩანაწერები
        NoteEntry::class => 'note',
        NoteCategory::class => 'note',
        NoteEntryFile::class => 'note',
        NoteReminder::class => 'note',

        // ---- ბუკმარკები
        Bookmark::class => 'bookmark',
        BookmarkCategory::class => 'bookmark',

        // ---- გალერეა
        GalleryAlbum::class => 'gallery',
        GalleryImage::class => 'gallery',
        // §8.1 — ვიდეო-ბმული იმავე მშობლებზე; ადამიანი ამატებს და შლის, ე.ი. ლოგში ხვდება
        GalleryVideo::class => 'gallery',

        // ---- გლობალური ლექსიკონები (მოდულის რიგი არ აქვთ)
        Genre::class => 'genre',
        GenreTranslation::class => 'genre',
        CastMember::class => 'cast',
        CastMemberTranslation::class => 'cast',
        // §7.5 — საძიებო ტეგები **მომხმარებლისაა** და არა ლექსიკონის (იხ. `CastMemberTag`)
        CastMemberTag::class => 'cast',

        /* ---- სტატუსების ლექსიკონი (§6.4)
           ⚠️ **მისი მოდული რიგშია და არა კლასში**: ერთი ცხრილი ექვს დომენს
           ემსახურება (`statuses.module`). აქ ჩაწერილი მნიშვნელობა მხოლოდ
           საწყისია — ნამდვილს `moduleFor()` კითხულობს `auditModule()`-იდან,
           თორემ ფილმის სტატუსის ცვლილება ლოგის „ანგარიშის" ჭრილში
           აღმოჩნდებოდა და მოდულის ფილტრი მას ვერასდროს იპოვიდა. */
        Status::class => 'account',

        // ---- ანგარიში, ადმინის ზონა, ჩატი
        User::class => 'account',
        Role::class => 'admin',
        Module::class => 'admin',
        ApprovalRequest::class => 'admin',
        Conversation::class => 'chat',
        Message::class => 'chat',
        UserBlock::class => 'chat',
    ];

    /** მოდულის რიგის გარეშე არსებული ჭრილები — ფილტრში მოდულების გვერდით ჩანს */
    public const PSEUDO_MODULES = ['account', 'admin', 'chat', 'genre', 'cast'];

    /**
     * ველები, რომლებიც ლოგში **არასდროს** ხვდება.
     *
     * ⚠️ პაროლის ჰეშისა და ტოკენის ჩაწერა ლოგს ავტორიზაციის ვექტორად
     * აქცევს: ლოგი ადმინს უჩანს, პაროლი კი მას არ ეკუთვნის.
     */
    public const HIDDEN = [
        'password',
        'remember_token',
        'two_factor_secret',
        'two_factor_recovery_codes',
    ];

    /**
     * საიდან იკითხება ჩანაწერის ადამიანური სახელი — **პირველი არსებული**.
     *
     * ⚠️ სახელი ლოგში **ასლად** ინახება და არა კავშირად: ჩანაწერის წაშლის
     * შემდეგ „რა წაშალა" სხვაგვარად წაუკითხავი იქნებოდა.
     */
    public const LABEL_COLUMNS = [
        'title_ka', 'title_en', 'title',
        'name_ka', 'name_en', 'name',
        'username', 'key', 'url', 'body', 'email',
    ];

    /** ამ მოდელს ვლოგავთ? */
    public static function tracks(Model $model): bool
    {
        return isset(self::MODELS[$model::class]);
    }

    /**
     * მოდელის მოდული (ან ფსევდო-მოდული).
     *
     * ⚠️ **`auditModule()` რუკაზე ძლიერია.** არის მოდელი, რომლის მოდული
     * კლასით არ იკითხება — `Status` ერთი ცხრილია ექვს დომენზე და პასუხი
     * მის `module` სვეტშია. სტატიკური რუკა მათ ერთ ჭრილში ჩააგდებდა.
     */
    public static function moduleFor(Model $model): ?string
    {
        if (method_exists($model, 'auditModule')) {
            return $model->auditModule();
        }

        return self::MODELS[$model::class] ?? null;
    }

    /**
     * სუბიექტის ტიპი — **morph alias, სადაც არსებობს**.
     *
     * ⚠️ სრული კლასის სახელი აქ არ გამოდგება: ის refactor-ზე იცვლება და
     * ძველი ლოგი მაშინვე „უცნობ ტიპს" აჩვენებდა. alias სწორედ ამისთვისაა
     * (`AppServiceProvider::enforceMorphMap`); ვისაც alias არ აქვს,
     * snake_case-ად გადადის (`board_game_file`).
     *
     * ⚠️ **`getMorphClass()` აქ არ გამოდგება.** `enforceMorphMap()` რუკის
     * გარეთ დარჩენილ მოდელზე **გამონაკლისს აგდებს**, ლოგში კი სწორედ
     * ისეთი მოდელებია, რომელთაც polymorphic კავშირი არ სჭირდებათ
     * (`Module`, `Role`, `<module>_files`…). ამიტომ რუკა პირდაპირ იკითხება.
     */
    public static function typeFor(Model $model): string
    {
        $alias = array_search($model::class, Relation::morphMap() ?: [], true);

        return is_string($alias) ? $alias : Str::snake(class_basename($model));
    }

    /**
     * ჩანაწერის ადამიანური სახელი (იხ. `LABEL_COLUMNS`).
     *
     * ⚠️ **ლოგირება მოდელს ვერ შეეხება.** ჯერ მხოლოდ **ნედლი სვეტები**
     * იკითხება; accessor-ს მაშინ ვეკითხებით, თუ მისი კავშირი უკვე
     * ჩატვირთულია. მიზეზი რეალურია: `Movie::$title_ka` თარგმანების
     * კავშირზე დგას და მისი გამოძახება `created`-ზე **ცარიელ კოლექციას
     * აქეშებდა** — შემდეგ იმავე ობიექტზე ნამდვილი სათაური აღარ იკითხებოდა.
     * ლოგმა თვითონ არ უნდა შეცვალოს ის, რასაც ლოგავს.
     */
    public static function labelFor(Model $model): ?string
    {
        $raw = $model->getAttributes();

        foreach (self::LABEL_COLUMNS as $column) {
            if (! array_key_exists($column, $raw)) {
                continue;
            }

            if (($label = self::text($model->getAttribute($column))) !== null) {
                return $label;
            }
        }

        // ორენოვანი დომენები (ფილმი/სერიალი) — მხოლოდ **უკვე ჩატვირთულ** თარგმანზე
        if ($model->relationLoaded('translations')) {
            foreach (self::LABEL_COLUMNS as $column) {
                if (($label = self::text($model->getAttribute($column))) !== null) {
                    return $label;
                }
            }
        }

        return null;
    }

    private static function text(mixed $value): ?string
    {
        return is_string($value) && trim($value) !== ''
            ? mb_substr(trim($value), 0, 200)
            : null;
    }
}
