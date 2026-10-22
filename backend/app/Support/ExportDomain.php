<?php

namespace App\Support;

use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\Book;
use App\Models\Bookmark;
use App\Models\Course;
use App\Models\CustomRecord;
use App\Models\DutyShift;
use App\Models\Game;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\Place;
use App\Models\Series;
use App\Models\Song;
use App\Models\Video;
use Illuminate\Database\Eloquent\Model;

/**
 * **რა და რა თანმიმდევრობით გადის ექსპორტში.**
 *
 * ერთადერთი რუკა „მოდული → მოდელი + ველების **დალაგებული** სია". მას ორი
 * მკითხველი ჰყავს: `RecordExporter` (რიგების აგება) და `ExportController`
 * (რა შეიძლება მოითხოვო).
 *
 * ⚠️ **`PublicDomain::card()` აქ ვერ გამოდგებოდა და ეს ორმხრივია.** ის
 * **საჯარო** ვიწრო ფორმაა — განზრახ ნაკლებს ამბობს, ვიდრე ჩანაწერს აქვს,
 * რადგან უცხო თვალისთვისაა; ექსპორტი კი პირიქითაა: ჩემი საკუთარი მონაცემია
 * და მისი დანიშნულება სისრულეა. და პირიქითაც — `note` `PublicDomain`-ში
 * **საერთოდ არ არის** (მკაცრი წესი: პირადი დოკუმენტები საჯარო
 * პროფილზე არ ჩნდება), ექსპორტში კი სწორედ ისაა ერთ-ერთი ყველაზე საჭირო —
 * ეს ჩემი ტექსტებია და წაღება უნდა შემეძლოს.
 *
 * ⚠️ **`$record->toArray()` განზრახ არ გამოიყენება.** სამი მიზეზი:
 *  · მასში `user_id`, `status_id`, `sync_status`, `sort_order` ხვდება —
 *    შიდა რიცხვები, რომლებიც ამ ბაზის გარეთ **არაფერს ნიშნავს**;
 *  · CSV-ს სვეტების **სტაბილური რიგი** სჭირდება, `toArray()` კი მიგრაციის
 *    დღიდან ჩუმად სხვა ფორმას დააბრუნებდა — ფაილის ფორმატი, რომელიც
 *    თვითონ იცვლება, ფორმატი არ არის (და იმპორტი სწორედ ამას
 *    დაეყრდნობა);
 *  · ერთი დავიწყებული `$hidden` და ექსპორტში ისეთი ველი ხვდება, რომელიც
 *    იქ არასდროს ყოფილა განზრახული.
 *
 * ⚠️ **ველი ან სვეტია, ან აქსესორი, ან `RecordExporter::VIRTUAL`-ში წერია.**
 * სიაში მხოლოდ სახელია — ე.ი. სია იკითხება და დიფშიც ჩანს; მხოლოდ იმ
 * მუჭა ველს სჭირდება კოდი, რომელიც რელაციიდან იკრიბება (ჟანრები, სტატუსი,
 * კატეგორია, ტიპი).
 */
final class ExportDomain
{
    /** ორივე დასაშვები ფორმატი — ვალიდაციის ერთადერთი წყარო */
    public const FORMATS = ['json', 'csv'];

    /**
     * მოდული → [მოდელი, ველები, წინასწარ ჩასატვირთი რელაციები].
     *
     * ⚠️ **`status` და `status_name` ორივე გადის და ეს დუბლირება არ არის.**
     * გასაღები (`watched`) **არასდროს იცვლება** — ის არის ის, რითიც იმპორტი
     * დაამთხვევს; სახელი („ნანახი") კი ის არის, რასაც ადამიანი
     * Excel-ში კითხულობს და მისი გადარქმევა ლექსიკონში ნებისმიერ დღეს
     * შეიძლება. ერთი მათგანი ან წასაკითხს კარგავს, ან სტაბილურობას.
     *
     * ⚠️ **ფაილის გზა (`poster_path`, `cover_path`…) განზრახ გადის.**
     * ცალკე ფაილი (JSON/CSV) ფაილებს **არ ფუთავს**; გზა კი ის ერთადერთი რამაა,
     * რაც არქივის ფაილს ჩანაწერს უკავშირებს — „ჩემი სრული ექსპორტის" ZIP-ში
     * ფაილი ზუსტად ამ გზით დევს (`files/<გზა>`).
     *
     * ⚠️ **ბოლო ველები ჩანაწერის „დამატებებია"** (`EXTRAS`):
     * დამატებითი ველები, მიმაგრებული ფაილები, ჩანიშვნები, გალერეა, მსახიობები,
     * მარშრუტები, თამაშის ვიდეოები, ნახვების ჟურნალი, ეპიზოდები — რელაციიდან
     * აწყობილი სიები (`RecordExtras`), რომ ექსპორტი **უკან შემოვიდეს**
     * (`MediaryImporter`). CSV-ში ისინი JSON-ის უჯრებია (`RecordExporter::flat()`).
     * ფოტოს წყარო (`poster_source`…) იმიტომ გადის, რომ იმპორტმა იცოდეს —
     * ფაილი ატვირთვაა (კვოტაში) თუ TMDB-ის საერთო ფაილი (კვოტის გარეშე).
     *
     * @var array<string, array{model: class-string<Model>, fields: list<string>, with: list<string>}>
     */
    public const MODULES = [
        'movie' => [
            'model' => Movie::class,
            'with' => ['translations', 'status', 'genres.translations', 'castLinks', 'galleryImages', 'galleryVideos', 'watches'],
            'fields' => [
                'id', 'title_ka', 'title_en', 'year', 'genres', 'status', 'status_name',
                'rating', 'my_rating', 'runtime', 'is_favorite', 'watched_at', 'imdb_id', 'tmdb_id',
                'imdb_url', 'ge_url', 'collection_name', 'trailer_url',
                'description_ka', 'description_en', 'poster_path', 'poster_source', 'visibility', 'created_at',
                'custom_fields', 'cast', 'gallery', 'watches',
            ],
        ],
        'series' => [
            'model' => Series::class,
            'with' => ['translations', 'status', 'genres.translations', 'castLinks', 'galleryImages', 'galleryVideos', 'watches'],
            'fields' => [
                'id', 'title_ka', 'title_en', 'year', 'genres', 'status', 'status_name',
                'rating', 'my_rating', 'runtime', 'seasons', 'episodes', 'is_favorite', 'watched_at',
                'imdb_id', 'tmdb_id', 'imdb_url', 'ge_url', 'trailer_url',
                'description_ka', 'description_en', 'poster_path', 'poster_source', 'visibility', 'created_at',
                'custom_fields', 'cast', 'gallery', 'watches', 'episode_watches',
            ],
        ],
        'anime' => [
            'model' => Anime::class,
            'with' => ['translations', 'status', 'genres.translations', 'castLinks', 'galleryImages', 'galleryVideos', 'watches'],
            'fields' => [
                'id', 'title_ka', 'title_en', 'year', 'genres', 'status', 'status_name',
                'rating', 'my_rating', 'runtime', 'seasons', 'episodes', 'is_favorite', 'watched_at',
                'imdb_id', 'tmdb_id', 'imdb_url', 'ge_url', 'trailer_url',
                'description_ka', 'description_en', 'poster_path', 'poster_source', 'visibility', 'created_at',
                'custom_fields', 'cast', 'gallery', 'watches', 'episode_watches',
            ],
        ],
        'video' => [
            'model' => Video::class,
            'with' => ['status', 'type', 'files', 'notes'],
            'fields' => [
                'id', 'title', 'type', 'status', 'status_name', 'tags', 'url', 'platform',
                'external_id', 'embed_url', 'channel', 'published_at', 'duration', 'is_favorite', 'watch_count',
                'watched_at', 'description', 'thumbnail_path', 'thumbnail_url', 'download_name', 'visibility', 'created_at',
                'custom_fields', 'files', 'notes',
            ],
        ],
        'song' => [
            'model' => Song::class,
            'with' => ['genres'],
            'fields' => [
                'id', 'title', 'artist', 'album', 'year', 'genres', 'tags', 'duration',
                'url', 'platform', 'external_id', 'embed_url', 'rating', 'is_favorite', 'play_count',
                'played_at', 'thumbnail_path', 'thumbnail_url', 'visibility', 'created_at',
                'custom_fields',
            ],
        ],
        'book' => [
            'model' => Book::class,
            'with' => ['genre', 'files', 'notes'],
            'fields' => [
                'id', 'title_ka', 'title_en', 'author', 'publisher', 'year', 'genre',
                'status', 'finished_at', 'rating', 'is_favorite', 'progress_page', 'progress_percent',
                'pages', 'language', 'format', 'isbn', 'series_name', 'series_number',
                'tags', 'links', 'openlibrary_id', 'source_url',
                'description_ka', 'description_en', 'cover_path', 'cover_url', 'cover_source', 'visibility', 'created_at',
                'custom_fields', 'files', 'notes',
            ],
        ],
        'board_game' => [
            'model' => BoardGame::class,
            'with' => ['genre', 'files', 'notes'],
            'fields' => [
                'id', 'title', 'designer', 'publisher', 'year', 'genre', 'mechanics', 'rating',
                'is_favorite', 'players_min', 'players_max', 'age_min', 'playtime_min',
                'playtime_max', 'complexity', 'bgg_id', 'bgg_rating', 'links',
                'description', 'image_path', 'image_url', 'image_source', 'visibility', 'created_at',
                'custom_fields', 'files', 'notes',
            ],
        ],
        'game' => [
            'model' => Game::class,
            'with' => ['genres', 'files', 'notes', 'videos'],
            'fields' => [
                'id', 'title_ka', 'title_en', 'release_date', 'genres', 'status', 'finished_at', 'rating',
                'is_favorite', 'developer', 'publisher', 'franchise', 'platforms',
                'my_platform', 'modes',
                'opencritic', 'users_score', 'age_rating',
                'size_gb', 'rawg_id', 'rawg_slug', 'igdb_id', 'igdb_slug', 'links',
                'description_ka', 'description_en', 'cover_path', 'cover_url', 'cover_source', 'visibility', 'created_at',
                'custom_fields', 'files', 'notes', 'videos',
            ],
        ],
        /* ⚠️ **ჩანიშვნები ექსპორტში არიან, საჯარო პროფილზე კი — არასდროს.**
           ეს ორი სხვადასხვა კითხვაა: „ვინ ნახოს" და „წავიღო თუ არა ჩემი
           საკუთარი ტექსტი". წესი პირველს კრძალავს, მეორეს — არა. */
        'note' => [
            'model' => NoteEntry::class,
            'with' => ['status', 'category', 'files'],
            'fields' => [
                'id', 'title', 'category', 'status', 'status_name', 'finished_at', 'tags', 'description',
                'links', 'is_favorite', 'visibility', 'created_at',
                'custom_fields', 'files',
            ],
        ],
        'bookmark' => [
            'model' => Bookmark::class,
            'with' => ['status', 'category', 'files', 'galleryImages', 'galleryVideos'],
            'fields' => [
                'id', 'title', 'url', 'domain', 'category', 'status', 'status_name', 'tags',
                // დამატებითი ბმულები (CSV-ში JSON-ად, `RecordExporter::flat()`)
                'links',
                'description', 'is_favorite', 'visit_count', 'visited_at',
                'thumbnail_path', 'image_url', 'favicon_url', 'visibility', 'created_at',
                'custom_fields', 'files', 'gallery',
            ],
        ],
        'course' => [
            'model' => Course::class,
            'with' => ['category', 'files'],
            'fields' => [
                'id', 'title', 'url', 'platform', 'category', 'status',
                'status_name', 'tags', 'description', 'is_favorite', 'started_at', 'finished_at',
                'thumbnail_path', 'image_url', 'visibility', 'created_at',
                'custom_fields', 'files',
            ],
        ],
        'place' => [
            'model' => Place::class,
            'with' => ['category', 'files', 'routes', 'galleryImages', 'galleryVideos'],
            'fields' => [
                'id', 'name', 'category', 'status', 'status_name', 'tags',
                'address', 'city', 'country', 'lat', 'lng', 'osm_id', 'osm_type',
                'phone', 'website', 'opening_hours', 'source_rating', 'source_rating_count',
                'rating', 'description', 'is_favorite', 'visited_at',
                'photo_path', 'visibility', 'created_at',
                'custom_fields', 'files', 'gallery', 'routes',
            ],
        ],
        /* მორიგეობა CSV-ით (კალკულატორის „ექსპორტი“): სამსახური
           სახელით (`workplace_name`), ტიპი ლექსიკონის სახელით (`type`). */
        'duty' => [
            'model' => DutyShift::class,
            'with' => ['workplace', 'type'],
            'fields' => [
                'id', 'date', 'start_time', 'workplace_name', 'type', 'hours', 'pay',
                'note', 'is_favorite', 'created_at',
                'custom_fields',
            ],
        ],
    ];

    /**
     * **ჩანაწერის „დამატებები"**: ველები, რომლებიც სვეტი კი არა,
     * რელაციიდან აწყობილი სიაა (`RecordExtras`) და იმპორტი მათ ცალკე წერს.
     *
     * ⚠️ `episode_watches` და არა `episodes` — ეს უკანასკნელი სერიალის **სვეტია**
     * (ეპიზოდების რაოდენობა); ეპიზოდების ნახვა კი `episode_watches`-ია.
     */
    public const EXTRAS = ['custom_fields', 'files', 'notes', 'gallery', 'cast', 'routes', 'videos', 'watches', 'episode_watches'];

    /**
     * **ჩანაწერის მთავარი ფოტო**: სვეტი და (თუ აქვს) წყაროს სვეტი.
     *
     * ⚠️ წყარო განსაზღვრავს, ვისია ფაილი: `upload` — ჩემი ატვირთვაა (კვოტაში),
     * სხვა (`tmdb`, `openlibrary`, `rawg`, `bgg`) — საერთო ფაილია და კვოტას
     * არ ეხება (`StorageMeter::files()`). წყაროს გარეშე მოდულის ფოტო ყოველთვის
     * მფლობელისაა. პირადი მოდული — `photo_path` (`photo()`).
     *
     * @var array<string, array{0: string, 1: string|null}>
     */
    public const PHOTOS = [
        'movie' => ['poster_path', 'poster_source'],
        'series' => ['poster_path', 'poster_source'],
        'anime' => ['poster_path', 'poster_source'],
        'video' => ['thumbnail_path', null],
        'song' => ['thumbnail_path', null],
        'book' => ['cover_path', 'cover_source'],
        'board_game' => ['image_path', 'image_source'],
        'game' => ['cover_path', 'cover_source'],
        'bookmark' => ['thumbnail_path', null],
        'course' => ['thumbnail_path', null],
        'place' => ['photo_path', null],
    ];

    /**
     * მოდული, რომელსაც ჩანაწერები აქვს, მაგრამ ექსპორტი **განზრახ** არ აქვს —
     * მიზეზთან ერთად. იკითხავს `RegistryConsistencyTest`.
     *
     * ⚠️ **ცარიელი სია ტყუილი იქნებოდა, სია მიზეზის გარეშე კი — დავიწყება.**
     * `DashboardController::COUNTERS`-ის თითოეული მოდული ან აქ წერია, ან
     * `MODULES`-ში; მესამე მდგომარეობა („არც აქ, არც იქ") სწორედ ის ჩუმი
     * გამორჩენაა, რომელიც `gallery`-ს დეშბორდზე თვეობით `—`-ს აჩვენებდა.
     *
     * @var array<string, string>
     */
    public const NOT_EXPORTED = [
        /* გალერეის შიგთავსი **ფაილებია** და არა ჩანაწერები: მათ წაღებას
           `POST /storage/files/download` ემსახურება (ზუსტად ის, რაც ამ
           მოდულს სჭირდება — თვითონ სურათები). მეტამონაცემის ცალკე CSV
           იმ ჩანაწერების გარეშე, რომლებზეც ფოტო ჰკიდია, არაფერს ამბობს. */
        'gallery' => 'files_are_exported_as_a_zip',
        /* პირადი გალერეაც **ფაილებია** (ფოტო და ვიდეო): მათი წაღება
           საცავის გვერდის ZIP-ია (`POST /storage/files/download`, პირადი დისკიც —
           მფლობელობით შემოწმებული). ადამიანების სახელების ცალკე CSV ფოტოების
           გარეშე არაფერს ამბობს. */
        'personal' => 'files_are_exported_as_a_zip',
    ];

    /**
     * **ინტერფეისიდან შექმნილი მოდულის ველები.** ერთი სია ყველა
     * პირად მოდულზე — ჩანაწერის სვეტები ერთია (`custom_records`).
     * ⚠️ დამატებითი ველები ახლა **შედის** (`custom_fields`), ისევე
     * როგორც ყველა საბაზისო მოდულზე: ექსპორტი უკან უნდა შემოვიდეს.
     */
    public const CUSTOM_FIELDS = [
        'id', 'title', 'url', 'platform', 'external_id', 'embed_url', 'category', 'status', 'status_name', 'tags',
        'description', 'is_favorite', 'finished_at', 'photo_path', 'image_url', 'visibility', 'created_at',
        'custom_fields', 'files', 'notes', 'gallery',
    ];

    /** **საბაზისო** მოდულები (პირადს `has()` ცალკე ცნობს) */
    public static function keys(): array
    {
        return array_keys(self::MODULES);
    }

    public static function has(string $module): bool
    {
        return isset(self::MODULES[$module]) || CustomModules::exists($module);
    }

    /** ვალიდაციის წესი — `in:movie,series,…` */
    public static function rule(): string
    {
        return 'in:'.implode(',', self::keys());
    }

    /** @return class-string<Model> */
    public static function model(string $module): string
    {
        return self::MODULES[$module]['model'] ?? CustomRecord::class;
    }

    /** @return list<string> */
    public static function fields(string $module): array
    {
        return self::MODULES[$module]['fields'] ?? self::CUSTOM_FIELDS;
    }

    /** @return list<string> */
    public static function with(string $module): array
    {
        return self::MODULES[$module]['with']
            ?? (CustomModules::isKey($module) ? ['status', 'category', 'files', 'notes', 'galleryImages', 'galleryVideos'] : []);
    }

    /** ამ მოდულის „დამატებები" (ველების სიის რიგით) */
    public static function extras(string $module): array
    {
        return array_values(array_intersect(self::fields($module), self::EXTRAS));
    }

    /**
     * მთავარი ფოტოს სვეტი და წყაროს სვეტი (ან `null`).
     *
     * @return array{0: string, 1: string|null}|null
     */
    public static function photo(string $module): ?array
    {
        return self::PHOTOS[$module] ?? (CustomModules::isKey($module) ? ['photo_path', null] : null);
    }

    /**
     * **ექსპორტის ერთი რიგის ყველა ფაილი** (ZIP-ში ჩასადები):
     * მთავარი ფოტო, მიმაგრებული ფაილები, გალერეის ფოტოები, `file` ტიპის
     * დამატებითი ველები და მსახიობების ფოტოები.
     *
     * @param  array<string, mixed>  $row
     * @return list<string>
     */
    public static function paths(string $module, array $row): array
    {
        $out = [];

        if (($photo = self::photo($module)) && is_string($row[$photo[0]] ?? null)) {
            $out[] = $row[$photo[0]];
        }

        foreach (['files', 'gallery'] as $list) {
            foreach ((array) ($row[$list] ?? []) as $item) {
                if (is_array($item) && is_string($item['path'] ?? null)) {
                    $out[] = $item['path'];
                }
            }
        }

        foreach ((array) ($row['custom_fields'] ?? []) as $value) {
            foreach (is_array($value) ? $value : [] as $file) {
                if (is_array($file) && is_string($file['path'] ?? null)) {
                    $out[] = $file['path'];
                }
            }
        }

        foreach ((array) ($row['cast'] ?? []) as $member) {
            if (is_array($member) && is_string($member['photo_path'] ?? null)) {
                $out[] = $member['photo_path'];
            }
        }

        return array_values(array_unique(array_filter($out, fn (string $path) => $path !== '')));
    }
}
