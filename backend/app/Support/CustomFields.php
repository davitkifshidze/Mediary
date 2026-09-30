<?php

namespace App\Support;

use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\Book;
use App\Models\Bookmark;
use App\Models\Course;
use App\Models\CustomRecord;
use App\Models\Game;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\Place;
use App\Models\Series;
use App\Models\Song;
use App\Models\Video;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder;

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

    /*
     * ⚠️ **`ფაილი` ველის ზომა და ფორმატები აქ აღარ წერია** (Tasks §34.3) —
     * ისინი `UploadLimits::KINDS['field']`-ია (25 MB, ნაგულისხმევად იგივე
     * 20 ფორმატი, რაც `FILE_MIMES`-ში იყო) და სუპერადმინი `/settings`-ზე ცვლის.
     *
     * ⚠️ **`svg` 2026-09-17-ს ამოვიდა (Tasks SEC-05) და არასდროს დაბრუნდეს** —
     * ისევე `html`/`xhtml`/`xml`-ც. ფაილი `<module>/fields`-ში, **საჯარო**
     * დისკზე ხვდება, ე.ი. `/storage/…/fields/<hash>.svg` ავტორიზაციის გარეშე,
     * `image/svg+xml`-ით, **აპის origin-ზე** იხსნება და ბრაუზერი მასში სკრიპტს
     * ასრულებს — ნებისმიერი მნახველის სესიით. ახლა ეს წესი `UploadLimits::NEVER`-შია
     * და **ვერც ერთი არჩევანით** (რედაქტორი, მოთხოვნა, პირადი გამონაკლისი) ვერ
     * ჩაირთვება; `CustomFieldTest` სამივე წყაროს ამოწმებს.
     */

    /**
     * რამდენი ფაილი ერთ ველზე (Tasks §7.3, 2026-09-11).
     *
     * ⚠️ **ცალკე „მრავლობითი" ჩამრთველი განზრახ არ დაემატა** — §7.3 ითხოვს,
     * რომ `file` ტიპს **შეეძლოს** რამდენიმე ფაილი, და არა იმას, რომ ეს
     * ყოველ ველზე ცალკე გადაწყდეს. ჩამრთველი, რომელსაც პრაქტიკულად ყველა
     * „დიახ"-ზე დატოვებდა, მხოლოდ კიდევ ერთი საპოვნელი პარამეტრი იქნებოდა.
     * ერთ ფაილს ისევ ატვირთავ — უბრალოდ მეორის დამატება აღარ შლის პირველს.
     *
     * ჭერი ნაგულისხმევად 25 MB × 10 = 250 MB ერთ ველზე, ე.ი. ნაგულისხმევი
     * 1 GB კვოტის 25% (ზომა `UploadLimits::KINDS['field']`-ია, §34.3).
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
        'course_field_values' => 'courses',
        'place_field_values' => 'places',
        /* Tasks §37 — **ერთი ცხრილი ყველა პირად მოდულზე**. ⚠️ ის მოდულის
           გასაღებს ატარებს (`module`), რადგან ველის წაშლა მნიშვნელობებს
           `field_key`-ით შლის — იხ. `scope()`. */
        CustomModules::VALUES_TABLE => CustomModules::TABLE,
    ];

    /** მოდულის key → მნიშვნელობების ცხრილი (საბაზისო; პირადი — `table()`) */
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
        'course' => 'course_field_values',
        'place' => 'place_field_values',
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
            'course' => Course::class,
            'place' => Place::class,
            // §37 — პირადი მოდულის ჩანაწერი; მოდულს `recordQuery()` ჭრის
            default => CustomModules::exists($module) ? CustomRecord::class : null,
        };
    }

    /**
     * ჩანაწერების query ამ მოდულზე — **პირად მოდულზე მოდულითაც დაჭრილი**.
     *
     * ⚠️ `model($module)::whereKey($id)` პირად მოდულზე საკმარისი არაა: ერთი
     * ანგარიშის ორი პირადი მოდულის ჩანაწერი ერთ ცხრილშია, ე.ი. მოდულის
     * გარეშე მეორე მოდულის ჩანაწერს ამ მოდულის ველებით წაიკითხავდა.
     *
     * @return EloquentBuilder<Model>|null
     */
    public static function recordQuery(string $module): ?EloquentBuilder
    {
        $model = self::model($module);

        if (! $model) {
            return null;
        }

        return $model === CustomRecord::class
            ? CustomRecord::query()->forModule($module)
            : $model::query();
    }

    /**
     * მნიშვნელობების რიგები ამ მოდულზე — საერთო ცხრილში მოდულით დაჭრილი.
     *
     * ⚠️ **ველის წაშლა `field_key`-ით შლის** (`CustomFieldService::saveDefinitions()`):
     * საერთო ცხრილში ამ შეზღუდვის გარეშე ერთი ანგარიშის **სხვა** პირადი
     * მოდულის იმავე სახელის ველიც წაიშლებოდა.
     */
    public static function scope(Builder $query, string $module): Builder
    {
        return self::isShared($module) ? $query->where('module', $module) : $query;
    }

    /** ჩასაწერი დამატებითი სვეტი — საერთო ცხრილში მოდულის გასაღები */
    public static function rowAttributes(string $module): array
    {
        return self::isShared($module) ? ['module' => $module] : [];
    }

    /** მნიშვნელობები საერთო (§37) ცხრილშია? */
    public static function isShared(string $module): bool
    {
        return ! isset(self::TABLE_BY_MODULE[$module]) && CustomModules::isKey($module);
    }

    /**
     * მარშრუტის `where()` — საბაზისო მოდულები **ან** პირადის ფორმა
     * (`StatusDomain::pattern()`-ის წესი: ბაზაში მცხოვრები გასაღები
     * route-ის რეგისტრაციისას ვერ ჩაიწერება; არსებობას კონტროლერი ამოწმებს).
     */
    public static function routePattern(): string
    {
        return implode('|', self::modules()).'|'.CustomModules::PATTERN;
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
        // §37 — პირადი მოდულის ჩანაწერის მოდული **რიგშია** და არა კლასში
        if ($model instanceof CustomRecord) {
            return $model->module ? (string) $model->module : null;
        }

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
        return isset(self::TABLE_BY_MODULE[$module]) || CustomModules::exists($module);
    }

    public static function table(string $module): ?string
    {
        if (isset(self::TABLE_BY_MODULE[$module])) {
            return self::TABLE_BY_MODULE[$module];
        }

        return CustomModules::exists($module) ? CustomModules::VALUES_TABLE : null;
    }

    /** **საბაზისო** მოდულები, რომლებსაც მორგებული ველები აქვთ (პირადი — `supports()`) */
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
