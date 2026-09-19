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
 * **FEAT-06 — რა და რა თანმიმდევრობით გადის ექსპორტში.**
 *
 * ერთადერთი რუკა „მოდული → მოდელი + ველების **დალაგებული** სია". მას ორი
 * მკითხველი ჰყავს: `RecordExporter` (რიგების აგება) და `ExportController`
 * (რა შეიძლება მოითხოვო).
 *
 * ⚠️ **`PublicDomain::card()` აქ ვერ გამოდგებოდა და ეს ორმხრივია.** ის
 * **საჯარო** ვიწრო ფორმაა — განზრახ ნაკლებს ამბობს, ვიდრე ჩანაწერს აქვს,
 * რადგან უცხო თვალისთვისაა; ექსპორტი კი პირიქითაა: ჩემი საკუთარი მონაცემია
 * და მისი დანიშნულება სისრულეა. და პირიქითაც — `note` `PublicDomain`-ში
 * **საერთოდ არ არის** (§16.5-ის მკაცრი წესი: პირადი დოკუმენტები საჯარო
 * პროფილზე არ ჩნდება), ექსპორტში კი სწორედ ისაა ერთ-ერთი ყველაზე საჭირო —
 * ეს ჩემი ტექსტებია და წაღება უნდა შემეძლოს.
 *
 * ⚠️ **`$record->toArray()` განზრახ არ გამოიყენება.** სამი მიზეზი:
 *  · მასში `user_id`, `status_id`, `sync_status`, `sort_order` ხვდება —
 *    შიდა რიცხვები, რომლებიც ამ ბაზის გარეთ **არაფერს ნიშნავს**;
 *  · CSV-ს სვეტების **სტაბილური რიგი** სჭირდება, `toArray()` კი მიგრაციის
 *    დღიდან ჩუმად სხვა ფორმას დააბრუნებდა — ფაილის ფორმატი, რომელიც
 *    თვითონ იცვლება, ფორმატი არ არის (და FEAT-07-ის იმპორტი სწორედ ამას
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
     * (FEAT-07) დაამთხვევს; სახელი („ნანახი") კი ის არის, რასაც ადამიანი
     * Excel-ში კითხულობს და მისი გადარქმევა ლექსიკონში ნებისმიერ დღეს
     * შეიძლება. ერთი მათგანი ან წასაკითხს კარგავს, ან სტაბილურობას.
     *
     * ⚠️ **ფაილის გზა (`poster_path`, `cover_path`…) განზრახ გადის.**
     * ფაილები აქ **არ იფუთება** — ამისთვის `POST /storage/files/download`
     * უკვე არსებობს; გზა კი ის ერთადერთი რამაა, რაც არქივის ფაილს
     * ჩანაწერს უკავშირებს. მის გარეშე ორივე ექსპორტი ცალკე დგება.
     *
     * @var array<string, array{model: class-string<Model>, fields: list<string>, with: list<string>}>
     */
    public const MODULES = [
        'movie' => [
            'model' => Movie::class,
            'with' => ['translations', 'status', 'genres.translations'],
            'fields' => [
                'id', 'title_ka', 'title_en', 'year', 'genres', 'status', 'status_name',
                'rating', 'runtime', 'is_favorite', 'watched_at', 'imdb_id', 'tmdb_id',
                'imdb_url', 'ge_url', 'collection_name', 'trailer_url',
                'description_ka', 'description_en', 'poster_path', 'visibility', 'created_at',
            ],
        ],
        'series' => [
            'model' => Series::class,
            'with' => ['translations', 'status', 'genres.translations'],
            'fields' => [
                'id', 'title_ka', 'title_en', 'year', 'genres', 'status', 'status_name',
                'rating', 'runtime', 'seasons', 'episodes', 'is_favorite', 'watched_at',
                'imdb_id', 'tmdb_id', 'imdb_url', 'ge_url', 'trailer_url',
                'description_ka', 'description_en', 'poster_path', 'visibility', 'created_at',
            ],
        ],
        'anime' => [
            'model' => Anime::class,
            'with' => ['translations', 'status', 'genres.translations'],
            'fields' => [
                'id', 'title_ka', 'title_en', 'year', 'genres', 'status', 'status_name',
                'rating', 'runtime', 'seasons', 'episodes', 'is_favorite', 'watched_at',
                'imdb_id', 'tmdb_id', 'imdb_url', 'ge_url', 'trailer_url',
                'description_ka', 'description_en', 'poster_path', 'visibility', 'created_at',
            ],
        ],
        'video' => [
            'model' => Video::class,
            'with' => ['status', 'type'],
            'fields' => [
                'id', 'title', 'type', 'status', 'status_name', 'tags', 'url', 'platform',
                'external_id', 'duration', 'is_favorite', 'watch_count', 'watched_at',
                'description', 'thumbnail_path', 'download_name', 'visibility', 'created_at',
            ],
        ],
        'song' => [
            'model' => Song::class,
            'with' => ['genres'],
            'fields' => [
                'id', 'title', 'artist', 'album', 'year', 'genres', 'tags', 'duration',
                'url', 'platform', 'external_id', 'rating', 'is_favorite', 'play_count',
                'played_at', 'thumbnail_path', 'visibility', 'created_at',
            ],
        ],
        'book' => [
            'model' => Book::class,
            'with' => ['genre'],
            'fields' => [
                'id', 'title_ka', 'title_en', 'author', 'publisher', 'year', 'genre',
                'status', 'rating', 'is_favorite', 'progress_page', 'progress_percent',
                'pages', 'language', 'format', 'isbn', 'series_name', 'series_number',
                'tags', 'openlibrary_id', 'source_url',
                'description_ka', 'description_en', 'cover_path', 'visibility', 'created_at',
            ],
        ],
        'board_game' => [
            'model' => BoardGame::class,
            'with' => ['genre'],
            'fields' => [
                'id', 'title', 'designer', 'publisher', 'year', 'genre', 'status', 'rating',
                'is_favorite', 'players_min', 'players_max', 'age_min', 'playtime_min',
                'playtime_max', 'complexity', 'bgg_id', 'bgg_rating',
                'description', 'image_path', 'visibility', 'created_at',
            ],
        ],
        'game' => [
            'model' => Game::class,
            'with' => ['genres'],
            'fields' => [
                'id', 'title_ka', 'title_en', 'release_date', 'genres', 'status', 'rating',
                'is_favorite', 'developer', 'publisher', 'franchise', 'platforms',
                'my_platform', 'modes', 'hltb_main', 'hltb_main_extra', 'hltb_complete',
                'metacritic', 'opencritic', 'users_score', 'age_rating', 'languages',
                'size_gb', 'rawg_id', 'igdb_id',
                'description_ka', 'description_en', 'cover_path', 'visibility', 'created_at',
            ],
        ],
        /* ⚠️ **ჩანიშვნები ექსპორტში არიან, საჯარო პროფილზე კი — არასდროს.**
           ეს ორი სხვადასხვა კითხვაა: „ვინ ნახოს" და „წავიღო თუ არა ჩემი
           საკუთარი ტექსტი". §16.5 პირველს კრძალავს, მეორეს — არა. */
        'note' => [
            'model' => NoteEntry::class,
            'with' => ['status', 'category'],
            'fields' => [
                'id', 'title', 'category', 'status', 'status_name', 'tags', 'description',
                'due_at', 'is_favorite', 'visibility', 'created_at',
            ],
        ],
        'bookmark' => [
            'model' => Bookmark::class,
            'with' => ['status', 'category'],
            'fields' => [
                'id', 'title', 'url', 'domain', 'category', 'status', 'status_name', 'tags',
                'description', 'is_favorite', 'visit_count', 'visited_at',
                'thumbnail_path', 'image_url', 'visibility', 'created_at',
            ],
        ],
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
    ];

    /** @return list<string> */
    public static function keys(): array
    {
        return array_keys(self::MODULES);
    }

    public static function has(string $module): bool
    {
        return isset(self::MODULES[$module]);
    }

    /** ვალიდაციის წესი — `in:movie,series,…` */
    public static function rule(): string
    {
        return 'in:'.implode(',', self::keys());
    }

    /** @return class-string<Model> */
    public static function model(string $module): string
    {
        return self::MODULES[$module]['model'];
    }

    /** @return list<string> */
    public static function fields(string $module): array
    {
        return self::MODULES[$module]['fields'];
    }

    /** @return list<string> */
    public static function with(string $module): array
    {
        return self::MODULES[$module]['with'] ?? [];
    }
}
