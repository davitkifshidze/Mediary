<?php

namespace App\Support;

use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\Book;
use App\Models\Bookmark;
use App\Models\Game;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\Series;
use App\Models\Song;
use App\Models\Video;
use Illuminate\Database\Eloquent\Model;

/**
 * **მორგებული ველების რუკა (Tasks §6, ფაზა 3).**
 *
 * ერთ ადგილას წერია სამივე ფაქტი, რომელიც სხვაგვარად ხუთ ფაილს გაეფანტებოდა:
 * რომელ მოდულს აქვს მორგებული ველები, სად ჯდება მნიშვნელობა და რა ტიპები არსებობს.
 *
 * ⚠️ **`file` ტიპი დაემატა ფაზა 4b-ში** (2026-09-06). ის ფაზა 3-ში განზრახ
 * არ შედიოდა: ატვირთვას `StorageMeter::storeUpload()`-ზე გასვლა და წაშლის
 * ქცევა სჭირდება, უამისოდ §17-ის ცენტრალური წესი ირღვეოდა. სამი წესი,
 * რომელიც ამ ტიპს გამოარჩევს დანარჩენებისგან:
 *  · მნიშვნელობა **მნიშვნელობების `PUT`-ში არ მიდის** — ფაილს თავისი
 *    endpoint აქვს (`POST|DELETE /custom-fields/{module}/{id}/file`), თორემ
 *    ფორმის ჩვეულებრივი შენახვა ატვირთულ ფაილს ჩუმად წაშლიდა;
 *  · ველის წაშლა/ტიპის შეცვლა ფაილსაც იტანს და კვოტასაც ათავისუფლებს;
 *  · ჩანაწერის წაშლაზე ეს `HasCustomFields`-ს აკისრია — SQL-ის კასკადი
 *    მოდელის ივენთს არ ისვრის.
 *
 * ⚠️ **`gallery` და `playlist` სიაში არ არიან**: პირველს საკუთარი ჩანაწერი
 * არ აქვს, მეორე კი მოდული არაა (ის `song`-ის შიგნითაა).
 */
final class CustomFields
{
    /** ტიპები, რომლებსაც ფორმა მართლა ხატავს */
    public const TYPES = ['text', 'number', 'date', 'list', 'switch', 'link', 'file'];

    /**
     * `ფაილი` ველის ჭერი — 25 MB. ნაგულისხმევი კვოტა 1 GB-ია, ე.ი. ერთ
     * ველს ანგარიშის 2.5%-ზე მეტი არ უნდა შეეძლოს ერთ ჩანაწერზე დაკავება.
     * (წიგნის ebook-ს 50 MB აქვს, ჩანაწერის ვიდეოს — 100 MB, მაგრამ ისინი
     * კონკრეტული დანიშნულების ველებია და ერთ სექციაზეა შემოსაზღვრული.)
     */
    public const FILE_MAX_KB = 25600;

    /**
     * დაშვებული გაფართოებები. ⚠️ **სია ცხადია და არა „ყველაფერი"**: ველი
     * ზოგადი დანიშნულებისაა, ე.ი. `.php`/`.exe` ატვირთვა აქ არაფერს ემსახურება.
     */
    public const FILE_MIMES = 'jpg,jpeg,png,webp,gif,svg,pdf,doc,docx,txt,rtf,odt,xls,xlsx,csv,ppt,pptx,zip,epub,mp3,mp4,webm';

    /**
     * რამდენი ფაილი ერთ ველზე (Tasks §7.3, 2026-09-11).
     *
     * ⚠️ **ცალკე „მრავლობითი" ჩამრთველი განზრახ არ დაემატა** — §7.3 ითხოვს,
     * რომ `file` ტიპს **შეეძლოს** რამდენიმე ფაილი, და არა იმას, რომ ეს
     * ყოველ ველზე ცალკე გადაწყდეს. ჩამრთველი, რომელსაც პრაქტიკულად ყველა
     * „დიახ"-ზე დატოვებდა, მხოლოდ კიდევ ერთი საპოვნელი პარამეტრი იქნებოდა.
     * ერთ ფაილს ისევ ატვირთავ — უბრალოდ მეორის დამატება აღარ შლის პირველს.
     *
     * ჭერი 25 MB × 10 = 250 MB ერთ ველზე, ე.ი. ნაგულისხმევი 1 GB კვოტის 25%.
     */
    public const FILE_MAX_COUNT = 10;

    /** მნიშვნელობების ცხრილი → მშობელი ცხრილი (მიგრაციაც ამას კითხულობს) */
    public const TABLES = [
        'movie_field_values' => 'movies',
        'series_field_values' => 'series',
        'anime_field_values' => 'animes',
        'video_field_values' => 'videos',
        'song_field_values' => 'songs',
        'book_field_values' => 'books',
        'board_game_field_values' => 'board_games',
        'game_field_values' => 'games',
        'note_field_values' => 'note_entries',
        'bookmark_field_values' => 'bookmarks',
    ];

    /** მოდულის key → მნიშვნელობების ცხრილი */
    public const TABLE_BY_MODULE = [
        'movie' => 'movie_field_values',
        'series' => 'series_field_values',
        'anime' => 'anime_field_values',
        'video' => 'video_field_values',
        'song' => 'song_field_values',
        'book' => 'book_field_values',
        'board_game' => 'board_game_field_values',
        'game' => 'game_field_values',
        'note' => 'note_field_values',
        'bookmark' => 'bookmark_field_values',
    ];

    /**
     * მოდულის key → მოდელი. ⚠️ **`PublicDomain::model()` აქ არ გამოდგება**:
     * იქ `note` განზრახ არ არის (§16.5 — ჩანაწერები არასდროს საჯაროვდება),
     * მორგებული ველები კი ჩანაწერებსაც სჭირდება.
     *
     * @return class-string<Model>|null
     */
    public static function model(string $module): ?string
    {
        return match ($module) {
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
            default => null,
        };
    }

    /**
     * უკუმიმართულება: მოდელი → მოდულის key (§6 ფაზა 4b).
     *
     * ⚠️ `HasCustomFields`-ს ეს **სჭირდება**: trait-ი რვავე მოდელზეა და
     * `deleting`-ზე უნდა იცოდეს, რომელი ცხრილიდან წაიღოს ფაილები. `morphAlias`
     * აქ არ გამოდგება — `note_entries`-ს ის საერთოდ არ აქვს.
     *
     * @param  Model|class-string<Model>  $model
     */
    public static function moduleOf(Model|string $model): ?string
    {
        $class = is_string($model) ? $model : $model::class;

        foreach (array_keys(self::TABLE_BY_MODULE) as $module) {
            if (self::model($module) === $class) {
                return $module;
            }
        }

        return null;
    }

    public static function supports(string $module): bool
    {
        return isset(self::TABLE_BY_MODULE[$module]);
    }

    public static function table(string $module): ?string
    {
        return self::TABLE_BY_MODULE[$module] ?? null;
    }

    /** მოდულები, რომლებსაც მორგებული ველები აქვთ — route-ის `whereIn`-ისთვის */
    public static function modules(): array
    {
        return array_keys(self::TABLE_BY_MODULE);
    }

    /**
     * სახელიდან key. ⚠️ **ლათინური slug ქართულ სახელზეც** — key ბაზაში
     * სვეტის მნიშვნელობაა და მას ადამიანი არ კითხულობს; უნიკალურობას
     * გამომძახებელი უზრუნველყოფს არსებულ სიაზე დაყრდნობით.
     */
    public static function makeKey(string $name, array $taken): string
    {
        /* ⚠️ **ეს იყო ერთადერთი სწორი ასლი** ათიდან (აუდიტი §B3): ის ჯერ
           ჭრიდა და მერე ამოწმებდა. ახლა ალგორითმი საერთოა, ხოლო აქაური
           განსხვავებები — `_` გამყოფი, 50 სიმბოლო და მზა სია `$taken` —
           პარამეტრებად გადმოვიდა. */
        return DictionaryKey::make(
            $name,
            fn (string $key) => in_array($key, $taken, true),
            'field',
            max: 50,
            separator: '_',
        );
    }
}
