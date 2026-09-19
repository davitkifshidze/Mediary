<?php

namespace App\Support;

use App\Models\Anime;
use App\Models\AnimeTranslation;
use App\Models\ApprovalRequest;
use App\Models\AuditLog;
use App\Models\BatchItem;
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
use App\Models\ConversationNickname;
use App\Models\DatabaseBackup;
use App\Models\EpisodeWatch;
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
use App\Models\MessageHide;
use App\Models\MessageReaction;
use App\Models\Module;
use App\Models\Movie;
use App\Models\MovieTranslation;
use App\Models\NoteCategory;
use App\Models\NoteEntry;
use App\Models\NoteEntryFile;
use App\Models\NoteNotification;
use App\Models\NoteReminder;
use App\Models\Playlist;
use App\Models\Role;
use App\Models\Series;
use App\Models\SeriesTranslation;
use App\Models\SerpSearch;
use App\Models\Song;
use App\Models\SongFile;
use App\Models\SongGenre;
use App\Models\SongNote;
use App\Models\Status;
use App\Models\TranslationUsage;
use App\Models\TvEpisode;
use App\Models\User;
use App\Models\UserBlock;
use App\Models\UserCredential;
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
     * ⚠️ **განზრახ გამოტოვებული მოდელები `NOT_LOGGED`-შია, თითოეული
     * მიზეზით** (Tasks DEBT-11) — და ეს სია **ტესტითაა** მიბმული: ყოველი
     * `app/Models/*.php` ან აქ უნდა იყოს, ან იქ.
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

    /**
     * **მოდელები, რომლებსაც `AuditObserver` განზრახ არ ებმება** (Tasks DEBT-11).
     *
     * ⚠️ **ეს სია დოკუმენტაცია არაა — ის ტესტითაა მიბმული.** ყოველი
     * `app/Models/*.php` ან `MODELS`-ში უნდა იყოს, ან აქ; ე.ი. ხვალინდელი
     * მოდელი აღარ დარჩება უხმოდ დაულოგავი და მისი გამოტოვება **გადაწყვეტილება**
     * გახდება და არა დავიწყება. სამი მიზეზი და სამივე სხვადასხვაა:
     *
     *  · **უსასრულო ციკლი** — ლოგის ლოგირება;
     *  · **მანქანის წერილი** — რიგები, რომლებსაც ადამიანი არ ქმნის (მიწოდების
     *    რიგი, გარე გამოძახებების მრიცხველები) ან ერთი დაწკაპუნებაა (რეაქცია,
     *    დამალვა, მეტსახელი): ისინი ლოგს დამარხავდნენ;
     *  · **ცხადად ლოგირდება კონტროლერიდან** — `UserCredential`-სა და
     *    `DatabaseBackup`-ს `AuditLogger` თვითონ იძახებს, რადგან ავტომატური
     *    `new_values` **საიდუმლო მასალას** ჩაწერდა (დაშიფრული გასაღები) ან
     *    ცრუ რიგებს დაბადებდა: აღდგენა `database_backups`-ს `DB::table()`-ით
     *    ხელახლა სვამს სწორედ იმიტომ, რომ observer-მა ორი „შეიქმნა" არ
     *    გამოიგონოს.
     *
     * @var array<class-string<Model>, string>
     */
    public const NOT_LOGGED = [
        AuditLog::class => 'ლოგის ლოგირება უსასრულო ციკლია',

        // მანქანის წერილი — ადამიანის ქმედება არაა
        NoteNotification::class => 'მიწოდების რიგი; მანქანა წერს და წუთში ერთხელ იცვლება',
        SerpSearch::class => 'გარე ძებნის მრიცხველი — თითო რიგი თითო გამოძახებაა',
        BatchItem::class => 'პარტიის მიწოდების ჟურნალი — worker წერს, და 300-ერთეულიანი გაშვება ლოგს დამარხავდა',
        TranslationUsage::class => 'Gemini-ს ხარჯის მრიცხველი — იგივე მიზეზი',

        // ერთი დაწკაპუნება — ლოგს დამარხავდნენ
        MessageReaction::class => 'ერთი დაწკაპუნება ბუშტზე',
        // FEAT-09 — სეზონის მონიშვნა ოცი რიგია ერთ დაჭერაზე (რეაქციის იგივე მიზეზი)
        EpisodeWatch::class => 'ეპიზოდის მონიშვნა — ერთი დაწკაპუნება, სეზონზე კი ოცი ერთდროულად',
        // TMDB-ის ფაქტი და არა ადამიანის ქმედება — გლობალური ლექსიკონი (`Genre`-ის რიგში)
        TvEpisode::class => 'TMDB-ის ეპიზოდი — გლობალური ფაქტი, რომელსაც მომხმარებელი არ ქმნის',
        MessageHide::class => 'ჩემთვის დამალვა; წაშლა კი ცხადად იწერება (§4.6)',
        ConversationNickname::class => 'საუბრის მეტსახელი — ჩემი ხედის პარამეტრი',

        // ცხადად ლოგირდება კონტროლერიდან
        UserCredential::class => 'CredentialController წერს მხოლოდ ველთა სახელებს — ავტომატური `new_values` გასაღებს ჩაწერდა',
        DatabaseBackup::class => 'DatabaseBackupController წერს; აღდგენა რიგებს `DB::table()`-ით სვამს, რომ ცრუ „შეიქმნა" არ გაჩნდეს',
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
