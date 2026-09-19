<?php

namespace App\Support;

use App\Http\Resources\StatusResource;
use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\Book;
use App\Models\Bookmark;
use App\Models\Course;
use App\Models\GalleryAlbum;
use App\Models\Game;
use App\Models\Movie;
use App\Models\Playlist;
use App\Models\Series;
use App\Models\Song;
use App\Models\Video;
use Illuminate\Database\Eloquent\Model;

/**
 * **Tasks §16 — რა შეიძლება გახდეს საჯარო.**
 *
 * ერთადერთი რუკა, რომელიც აკავშირებს „დომენის key"-ს მოდელთან და მოდულთან.
 * ორი ადგილი კითხულობს: `VisibilityController` (ერთი ჩანაწერის გადამრთველი) და
 * `PublicProfileService` (პროფილის სია და სტატისტიკა) — ე.ი. „რა ჩანს პროფილზე"
 * და „რას შეიძლება მიენიჭოს `public`" ვერასდროს დაშორდება ერთმანეთს.
 *
 * ⚠️ **`note` აქ განზრახ არ არის** (16.5-ის მკაცრი წესი). ის მოდული პირად
 * დოკუმენტებს ინახავს, ე.ი. საჯარო პროფილზე **საერთოდ არ უნდა გამოჩნდეს** —
 * არა მხოლოდ `private` იყოს default. სვეტი `note_entries.visibility` მაინც
 * არსებობს, მაგრამ ამ რუკის გარეშე ვერაფერს გამოაჩენს.
 *
 * ⚠️ **`playlist` მოდული არაა** — ის `song`-ის შიგნით ცხოვრობს (§15), ამიტომ
 * `module` ველი აქ `song`-ს უთითებს. სწორედ ამის გამოა ეს ცალკე რუკა და არა
 * `modules.key`-ზე პირდაპირი დაყრდნობა.
 */
final class PublicDomain
{
    /** ორივე დასაშვები მნიშვნელობა — ვალიდაციის ერთადერთი წყარო */
    public const VALUES = ['private', 'public'];

    /**
     * დომენი → [მოდელი, მოდულის key].
     * თანმიმდევრობა პროფილზე ტაბების რიგსაც განსაზღვრავს.
     *
     * @var array<string, array{model: class-string<Model>, module: string}>
     */
    public const DOMAINS = [
        'movie' => ['model' => Movie::class, 'module' => 'movie'],
        'series' => ['model' => Series::class, 'module' => 'series'],
        'anime' => ['model' => Anime::class, 'module' => 'anime'],
        'game' => ['model' => Game::class, 'module' => 'game'],
        'book' => ['model' => Book::class, 'module' => 'book'],
        'board_game' => ['model' => BoardGame::class, 'module' => 'board_game'],
        'video' => ['model' => Video::class, 'module' => 'video'],
        'song' => ['model' => Song::class, 'module' => 'song'],
        'playlist' => ['model' => Playlist::class, 'module' => 'song'],
        'bookmark' => ['model' => Bookmark::class, 'module' => 'bookmark'],
        // FEAT-25 — კურსსაც `visibility` სვეტი აქვს, ე.ი. სიაშიც უნდა იყოს
        'course' => ['model' => Course::class, 'module' => 'course'],
        /* ⚠️ **`gallery_album` დომენია, თუმცა „ჩანაწერი" არ არის** (Tasks §7.5).
           ფოტო მშობლის ხილვადობას იმემკვიდრებს, ე.ი. ფილმის კადრს ცალკე
           გადამრთველი არ სჭირდება — **უმშობლო** ფოტოს კი მემკვიდრეობით
           არაფერი მოსდის და ერთადერთი, რითიც ის შეიძლება გაზიარდეს,
           ალბომია. `playlist`-ის ზუსტი ფორმა: მოდული `gallery`-ია,
           იდენტობა (`MATCH`) — არ აქვს. */
        'gallery_album' => ['model' => GalleryAlbum::class, 'module' => 'gallery'],
    ];

    /**
     * **Tasks §16.2 — რა ნიშნავს „ერთი და იგივე ჩანაწერი".**
     *
     * `columns` არის იდენტობის გასაღები: ორი ანგარიშის ჩანაწერი მაშინაა ერთი
     * და იგივე, როცა ეს სვეტები ემთხვევა და **არცერთი არაა `null`**.
     * `done` კი ის სტატუსია, რომელსაც §16.2 „ერთნაირად გავაკეთეთ"-ს ეძახის.
     *
     * ⚠️ **სტატუსები დომენებზე არ ემთხვევა** (იგივე ხაფანგი, რაც
     * `PurgeService::TARGET_STATUSES`-შია): ფილმი `watched`-ია, თამაში
     * `finished`, წიგნი `read`, ბორდგეიმი `owned`. `done = null` ნიშნავს,
     * რომ დომენს სტატუსი **საერთოდ არ აქვს** (ვიდეო, სიმღერა) — მაშინ
     * მხოლოდ „ორივეს გვაქვს" ითვლება და „ორივემ გავაკეთეთ" არა.
     *
     * ⚠️ **`playlist` აქ განზრახ არ არის.** მას საერთო იდენტობა არ გააჩნია:
     * ორი user-ის ერთნაირად დასათაურებული პლეილისტი **ერთი და იგივე არაა**,
     * გარე ლექსიკონი კი (TMDB/RAWG/BGG-ის ანალოგი) მუსიკის სიაზე არ არსებობს.
     * სახელით შედარება ცრუ დამთხვევებს დაბადებდა; პლეილისტის შიგთავსი ისედაც
     * ითვლება — `song` დომენში.
     *
     * ⚠️ **ვიდეო/სიმღერის გასაღები წყვილია** (`platform` + `external_id`) და
     * არა მარტო `external_id`: სხვადასხვა პლატფორმის id-ები ერთმანეთს
     * არაფრით ეხმიანება.
     *
     * @var array<string, array{columns: list<string>, done: ?string}>
     */
    public const MATCH = [
        /* ⚠️ **ექვს დომენს `done` სახელად აღარ აქვს** (§6.4): სტატუსი per-user
           ლექსიკონია და „ნანახი" ჩემთან და შენთან სხვადასხვანაირად შეიძლება
           ერქვას. მათზე კრიტერიუმი `role = done`-ია — იხ. `isDone()`. */
        'movie' => ['columns' => ['tmdb_id'], 'done' => null],
        'series' => ['columns' => ['tmdb_id'], 'done' => null],
        'anime' => ['columns' => ['tmdb_id'], 'done' => null],
        'game' => ['columns' => ['rawg_id'], 'done' => 'finished'],
        'book' => ['columns' => ['openlibrary_id'], 'done' => 'read'],
        'board_game' => ['columns' => ['bgg_id'], 'done' => 'owned'],
        'video' => ['columns' => ['platform', 'external_id'], 'done' => null],
        'song' => ['columns' => ['platform', 'external_id'], 'done' => null],
        // ⚠️ ბუკმარკის იდენტობა **თვითონ ბმულია** — გარე ლექსიკონი (TMDB/RAWG-ის
        // ანალოგი) აქ არ არსებობს, სამაგიეროდ URL თავისთავად გლობალური გასაღებია
        'bookmark' => ['columns' => ['url'], 'done' => null],
        /* FEAT-25 — კურსის იდენტობა მისი მისამართია (ბუკმარკის წესი: გარე
           ლექსიკონი არ არსებობს, URL კი ისედაც გლობალური გასაღებია).
           ⚠️ ბმულის გარეშე შენახული კურსი მატჩინგში **არ მონაწილეობს** —
           ცარიელი იდენტობის დოკუმენტირებული წესი. */
        'course' => ['columns' => ['url'], 'done' => 'done'],
    ];

    /**
     * **§6.1 — რით ვეძებთ ჩანაწერს ხილვადობის სიაში.**
     *
     * `relation` არა-`null`-ია მხოლოდ იმ დომენებზე, სადაც სათაური **ცალკე
     * ცხრილშია** (ფილმი/სერიალი — `<domain>_translations.title`); დანარჩენებზე
     * ეს იმავე რიგის სვეტებია. ერთი რუკა, რომ „საჯარო ჩანაწერების" სიის
     * ძებნა ცხრა `if`-ად არ დაიშალოს.
     *
     * @var array<string, array{relation: ?string, columns: list<string>}>
     */
    public const SEARCH = [
        'movie' => ['relation' => 'translations', 'columns' => ['title']],
        'series' => ['relation' => 'translations', 'columns' => ['title']],
        'anime' => ['relation' => 'translations', 'columns' => ['title']],
        'game' => ['relation' => null, 'columns' => ['title_ka', 'title_en']],
        'book' => ['relation' => null, 'columns' => ['title_ka', 'title_en', 'author']],
        'board_game' => ['relation' => null, 'columns' => ['title', 'designer']],
        'video' => ['relation' => null, 'columns' => ['title']],
        'song' => ['relation' => null, 'columns' => ['title', 'artist']],
        'playlist' => ['relation' => null, 'columns' => ['name']],
        'bookmark' => ['relation' => null, 'columns' => ['title', 'url']],
        'course' => ['relation' => null, 'columns' => ['title']],
        'gallery_album' => ['relation' => null, 'columns' => ['name']],
    ];

    /** @return list<string> */
    public static function keys(): array
    {
        return array_keys(self::DOMAINS);
    }

    /** დომენები, რომლებზეც დამთხვევა ითვლება (`playlist` — არა) */
    public static function matchable(): array
    {
        return array_keys(self::MATCH);
    }

    public static function isMatchable(string $domain): bool
    {
        return isset(self::MATCH[$domain]);
    }

    /** იდენტობის სვეტები; `[]` — დომენი არ ედარება */
    public static function matchColumns(string $domain): array
    {
        return self::MATCH[$domain]['columns'] ?? [];
    }

    /**
     * „გავაკეთე" სტატუსის **გასაღები** — მხოლოდ enum-იან დომენებზე
     * (თამაში `finished`, წიგნი `read`, ბორდგეიმი `owned`).
     *
     * ⚠️ ლექსიკონიან დომენზე `null`-ია და ეს **არ ნიშნავს „სტატუსი არ აქვს"** —
     * იქ კრიტერიუმი როლია. „ითვლება თუ არა" ერთადერთი კითხვაა და მას
     * `countsDone()` პასუხობს.
     */
    public static function doneStatus(string $domain): ?string
    {
        return self::MATCH[$domain]['done'] ?? null;
    }

    /** ითვლება თუ არა ამ დომენზე „ორივემ გავაკეთეთ" (ვიდეო/სიმღერა — არა) */
    public static function countsDone(string $domain): bool
    {
        return self::doneStatus($domain) !== null || StatusDomain::usesDictionary($domain);
    }

    /**
     * **ერთი კითხვა, ერთი პასუხი:** ეს ჩანაწერი „გაკეთებულია"?
     *
     * ⚠️ ორი მექანიზმი ერთდროულად ცოცხლობს (§6.4): ექვს დომენს მართვადი
     * ლექსიკონი აქვს და `role`-ით პასუხობს, დანარჩენ სამს — `enum` და
     * გასაღებით. ამ `if`-ის ორ სერვისში გამეორება ზუსტად ის იქნებოდა,
     * რაც ერთ დღეს დაშორდებოდა.
     */
    public static function isDone(Model $record, string $domain): bool
    {
        if (StatusDomain::usesDictionary($domain)) {
            return $record->status_role === 'done';
        }

        $done = self::doneStatus($domain);

        return $done !== null && $record->status === $done;
    }

    public static function has(string $domain): bool
    {
        return isset(self::DOMAINS[$domain]);
    }

    /** @return class-string<Model> */
    public static function model(string $domain): string
    {
        return self::DOMAINS[$domain]['model'];
    }

    /** რომელი მოდულის ჩართვა სჭირდება ამ დომენს (`playlist` → `song`) */
    public static function module(string $domain): string
    {
        return self::DOMAINS[$domain]['module'];
    }

    /** ერთი მოდულის დომენები — პროფილზე მოდულის ჩართვა რამდენიმეს აჩენს */
    public static function forModule(string $module): array
    {
        return array_keys(array_filter(
            self::DOMAINS,
            fn (array $d) => $d['module'] === $module,
        ));
    }

    /**
     * **საჯარო ბარათის ვიწრო ფორმა.**
     *
     * ⚠️ განზრახ **არ ვიყენებთ** `MovieResource`/`BookResource`-ს და ა.შ.:
     * ისინი ჩანაწერის სრულ სურათს აბრუნებენ (`sync_status`, `ge_url`, ფაილების
     * მრიცხველები, ჩემი პროგრესი…) და ერთი ახალი ველი მათში ჩუმად გაჟონავდა
     * უცხო თვალში. აქ პირიქითაა: ველი მხოლოდ მაშინ ჩნდება, თუ ცხადად ჩაიწერა.
     */
    /**
     * @param  list<string>  $hidden  ველები, რომლებიც **მფლობელმა** დამალა
     *                                (§6 ფაზა 4 → §16). იხ. `FieldSettings::hiddenOnPublic()`.
     */
    public static function card(string $domain, Model $record, array $hidden = []): array
    {
        $base = [
            'id' => $record->id,
            'domain' => $domain,
        ];

        $card = $base + match ($domain) {
            'movie', 'series', 'anime' => [
                'title_ka' => $record->title_ka,
                'title_en' => $record->title_en,
                'year' => $record->year,
                'image' => $record->poster_path,
                // §6.4 — ობიექტი: სახელი **მფლობელის** ლექსიკონშია და უცხო
                // მნახველი მას სხვაგვარად ვერსად წაიკითხავდა
                'status' => StatusResource::brief($record->status),
                'rating' => $record->rating,
            ],
            'game' => [
                'title_ka' => $record->title_ka,
                'title_en' => $record->title_en,
                'year' => $record->year,
                'image' => $record->cover_path ?: $record->cover_url,
                'status' => $record->status,
                'rating' => $record->rating,
            ],
            'book' => [
                'title_ka' => $record->title_ka,
                'title_en' => $record->title_en,
                'subtitle' => $record->author,
                'year' => $record->year,
                'image' => $record->cover_path ?: $record->cover_url,
                'status' => $record->status,
                'rating' => $record->rating,
            ],
            'board_game' => [
                'title_en' => $record->title,
                'subtitle' => $record->designer,
                'year' => $record->year,
                'image' => $record->image_path ?: $record->image_url,
                'status' => $record->status,
                'rating' => $record->rating,
            ],
            'video' => [
                'title_en' => $record->title,
                'image' => $record->thumbnail_path ?: $record->thumbnail_url,
                'subtitle' => $record->platform,
                // §6.4 — ვიდეოს სტატუსი ახლა არსებობს
                'status' => StatusResource::brief($record->status),
                // ბმული საჯაროა — ვიდეო სწორედ იმისთვისაა გაზიარებული, რომ გაიხსნას
                'url' => $record->url,
            ],
            'song' => [
                'title_en' => $record->title,
                'subtitle' => $record->artist,
                'year' => $record->year,
                'image' => $record->thumbnail_path ?: $record->thumbnail_url,
                'rating' => $record->rating,
                'url' => $record->url,
            ],
            'playlist' => [
                'title_en' => $record->name,
                'songs_count' => $record->songs_count ?? 0,
            ],
            /* ⚠️ **ჩაკეტილ ალბომს არც ესკიზი მიჰყვება** (Tasks §7.11): `locked`
               ერთადერთი ფაქტია, რაც გარეთ გამოდის — რიცხვი ფოტოს არ ამხელს,
               ამხელს გზა ფაილამდე. `image` მხოლოდ ღია ალბომს აქვს და მას
               `PublicGallery` ავსებს. */
            'gallery_album' => [
                'title_en' => $record->name,
                'subtitle' => $record->description,
                'photos' => (int) ($record->images_count ?? 0),
                'locked' => $record->isLocked(),
            ],
            'bookmark' => [
                'title_en' => $record->title,
                'subtitle' => $record->domain,
                'image' => $record->thumbnail_path ?: $record->image_url,
                'status' => StatusResource::brief($record->status),
                // ბმული საჯაროა — ბუკმარკი სწორედ იმისთვისაა გაზიარებული, რომ გაიხსნას
                'url' => $record->url,
            ],
        };

        /* ⚠️ **`id`/`domain` არასდროს იმალება** — ბარათი მათ გარეშე ვერ
           დაიხატება და ვერც ბმული აეწყობა. ისინი `$base`-შია და `$hidden`
           მხოლოდ შიგთავსის ველებს ეხება. */
        foreach ($hidden as $key) {
            unset($card[$key]);
        }

        return $card;
    }
}
