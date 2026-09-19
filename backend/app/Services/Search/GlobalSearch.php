<?php

namespace App\Services\Search;

use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\Book;
use App\Models\Bookmark;
use App\Models\CastMember;
use App\Models\Course;
use App\Models\GalleryVideo;
use App\Models\Game;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\Playlist;
use App\Models\Series;
use App\Models\Song;
use App\Models\User;
use App\Models\Video;
use App\Support\CustomFields;
use App\Support\Like;
use App\Support\Snippet;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Facades\DB;

/**
 * **ჯვარედინი ძებნა — ერთი კითხვა მთელ ბიბლიოთეკაზე** (2026-09-14).
 *
 * პირველი ვერსია (აუდიტი §D6) მხოლოდ **სათაურებს** ეძებდა და ჯგუფში სამიოდე
 * სტრიქონს აბრუნებდა — ე.ი. „სად ვახსენე ეს სიტყვა" კითხვას **ვერ** პასუხობდა:
 * აღწერა, შენიშვნა, ციტატა, ტეგი, მსახიობი, ფაილის სახელი და მორგებული ველი
 * ძებნის მიღმა რჩებოდა. ახლა თითოეული დომენი აცხადებს **რომელ ტექსტებში**
 * იძებნება, პასუხი კი ამბობს **სად ზუსტად** დაემთხვა და აჩვენებს ნაჭერს
 * (`App\Support\Snippet`) — დამთხვევის წინ და უკან რამდენიმე სიტყვით.
 *
 * ⚠️ **ეს სექციების საკუთარ ძებნას არ ცვლის.** მოდულის შიგნით ძებნა
 * ფილტრებთან ერთად მუშაობს და სრულ სიას აბრუნებს; ეს კი ყველა მოდულს
 * ერთდროულად ეკითხება და თითოდან პირველ N-ს აბრუნებს (გვერდი მეტს ითხოვს
 * `per_module`-ით, ერთ დომენს კი `only`-თი ღრმად ჩაიხედავს).
 *
 * ⚠️ **FULLTEXT აქაც არ გამოიყენება** — პროექტის არსებული წესი: ტესტები
 * sqlite-ზეა (მას FULLTEXT არ აქვს) და MySQL-ის ინდექსი ქართულს ცუდად
 * ამუშავებს. `LIKE %…%` ინდექსს ვერ იყენებს, სამაგიეროდ ერთნაირად მუშაობს
 * ორივე ენაზე, ორივე ბაზაზე და **სიტყვის შუაშიც პოულობს** — ზუსტად ის
 * ქცევაა, რაც მოთხოვნილია („ინ" → „ინფორმაცია").
 *
 * ⚠️ **ჩართული მოდულების ფილტრი სავალდებულოა.** გამორთული მოდულის
 * ჩანაწერი შედეგებში არ უნდა ჩნდებოდეს — თორემ ძებნა იმ სექციას გამოაჩენდა,
 * რომელიც საიდბარშიც არ უჩანს და რომლის გახსნაც 403-ია.
 *
 * ⚠️ **მფლობელობა `BelongsToUser`-ის global scope-ზე დგას** — აქ ცხადი
 * `where('user_id')` განზრახ არ წერია, რომ ერთი წესი ორ ადგილას არ იყოს.
 * **ერთადერთი გამონაკლისი `cast_members`-ია** — ის გლობალური ლექსიკონია
 * (ერთი მსახიობი ყველა ანგარიშისთვის), ე.ი. scope-ს არ ემორჩილება; ამიტომ
 * მისი წყარო ცხადად ითხოვს, რომ მსახიობი **ჩემს** ჩანაწერში მაინც
 * თამაშობდეს, თორემ ძებნა სხვისი ბიბლიოთეკის მსახიობებსაც ჩამოთვლიდა.
 *
 * ⚠️ **ხაზგასმას სერვერი არ აკეთებს.** ნაჭერი სუფთა ტექსტია — ნედლი HTML
 * არსად არ იგზავნება (პროექტის მთავარი წესი); სიტყვას SPA თვითონ პოულობს.
 */
class GlobalSearch
{
    /** თითო დომენიდან რამდენი შედეგი მოდის ნაგულისხმევად (ჩამოსაშლელი სია) */
    public const PER_MODULE = 5;

    /** ჭერი — ერთ დომენს ამაზე მეტს ვერავინ მოსთხოვს */
    public const PER_MODULE_MAX = 100;

    /** ერთ ჩანაწერზე რამდენი ნაჭერი ჩანს */
    public const MATCHES_PER_RECORD = 4;

    /** უფრო მოკლე ტერმინი პრაქტიკულად მთელ ბიბლიოთეკას აბრუნებდა — ეს პასუხი არაა */
    public const MIN_TERM = 2;

    /**
     * **რომელი ველი უფრო მნიშვნელოვანია ბარათზე.** ერთ ჩანაწერში ხუთი
     * დამთხვევა შეიძლება იყოს, ბარათზე კი ოთხი ეტევა — და თუ სათაურის
     * დამთხვევა მეხუთე აღმოჩნდა, შედეგი აუხსნელი ხდება („რატომ მომცა ეს?").
     */
    private const FIELD_ORDER = [
        'title', 'name', 'description', 'note', 'quote', 'cast', 'character',
        'tags', 'author', 'artist', 'album', 'designer', 'developer', 'publisher',
        'franchise', 'series', 'biography', 'knownFor', 'birthplace', 'channel',
        'category', 'domain', 'url', 'isbn', 'imdb', 'platform', 'video', 'file', 'field',
    ];

    /**
     * ძებნა ყველა ჩართულ დომენში.
     *
     * @param  string|null  $only  ერთი დომენი (გვერდის „მეტის ჩვენება")
     * @return array{query: string, total: int, groups: list<array<string, mixed>>}
     */
    public function search(User $user, string $term, int $perModule = self::PER_MODULE, ?string $only = null): array
    {
        $term = trim($term);
        $perModule = min(max($perModule, 1), self::PER_MODULE_MAX);

        if (mb_strlen($term) < self::MIN_TERM) {
            return ['query' => $term, 'total' => 0, 'groups' => []];
        }

        $groups = [];

        foreach ($this->sources($user) as $domain => $spec) {
            if ($only !== null && $only !== $domain) {
                continue;
            }

            $group = $this->group($domain, $spec, $term, $perModule);

            // ცარიელი ჯგუფი პასუხში არ ჩანს — ის მხოლოდ ხმაურია
            if ($group['total'] > 0) {
                $groups[] = $group;
            }
        }

        return [
            'query' => $term,
            'total' => array_sum(array_column($groups, 'total')),
            'groups' => $groups,
        ];
    }

    /* ================= წყაროების რეესტრი ================= */

    /**
     * **რომელ დომენში რომელი ტექსტები იძებნება.**
     *
     * ⚠️ **`columns` მხოლოდ ნამდვილი სვეტებია** — იმავე სიით იწერება SQL-იც
     * და ნაჭერიც. სადაც აქსესორია საჭირო (`name_ka` თარგმანების ცხრილიდან),
     * კავშირს თავისი `where` აქვს: SQL იქ ვერ ეძებს, სადაც სვეტი არ დგას.
     *
     * ⚠️ **`json` ცალკეა** (ტეგები, პლატფორმები): ბაზაში ის ტექსტია, ე.ი.
     * `LIKE` მუშაობს, მაგრამ ნაჭერი მთელი JSON-ი რომ იყოს, ბარათზე
     * `["ინფო","სხვა"]` გამოჩნდებოდა — ამიტომ მასივი იშლება და მხოლოდ
     * დამთხვეული ელემენტები ჩანს.
     *
     * ⚠️ **`custom` მოდულის key-ია** (`<module>_field_values`): მორგებული
     * ველები ჩვეულებრივი კავშირი არაა (ცხრილი მოდულზეა და არა მოდელზე),
     * ამიტომ მას ცალკე ქვე-მოთხოვნა ემსახურება.
     */
    private function sources(User $user): array
    {
        $media = [
            'title_rank' => ['relation' => 'translations', 'column' => 'title'],
            'columns' => ['imdb' => ['imdb_id']],
            // FEAT-18 — პირადი ტეგები. ⚠️ სამივე მედია-დომენზე ერთდროულად
            // ჩნდება, რადგან აღწერა საერთოა — ცალკე დამატება ერთს გამორჩებოდა.
            'json' => ['tags' => 'tags'],
            'relations' => [
                /* ⚠️ თარგმანები **შეზღუდულად არ იტვირთება**: სათაურის აქსესორი
                   იმავე კავშირს კითხულობს, ე.ი. ფილტრი ბარათს სათაურს წაართმევდა. */
                ['relation' => 'translations', 'fields' => ['title' => ['title'], 'description' => ['description']], 'eager' => false],
                // მსახიობი: SQL-ში ლათინური სახელი + ქართული თარგმანი, ნაჭერში ორივე
                ['relation' => 'cast', 'fields' => ['cast' => ['name', 'name_ka']], 'where' => ['name'], 'translated' => true],
                ['relation' => 'galleryVideos', 'fields' => ['video' => ['title', 'channel']]],
            ],
            'image' => 'poster_path',
        ];

        $sources = [
            'movie' => ['module' => 'movie', 'model' => Movie::class, 'custom' => 'movie'] + $media,
            'series' => ['module' => 'series', 'model' => Series::class, 'custom' => 'series'] + $media,
            'anime' => ['module' => 'anime', 'model' => Anime::class, 'custom' => 'anime'] + $media,

            'video' => [
                'module' => 'video',
                'model' => Video::class,
                'custom' => 'video',
                'title_rank' => ['columns' => ['title']],
                'columns' => ['title' => ['title'], 'description' => ['description'], 'url' => ['url']],
                'json' => ['tags' => 'tags'],
                'relations' => [
                    ['relation' => 'notes', 'fields' => ['note' => ['body']]],
                    ['relation' => 'files', 'fields' => ['file' => ['original_name']]],
                ],
                'image' => 'thumbnail_path',
            ],

            'song' => [
                'module' => 'song',
                'model' => Song::class,
                'custom' => 'song',
                'title_rank' => ['columns' => ['title', 'artist']],
                'columns' => ['title' => ['title'], 'artist' => ['artist'], 'album' => ['album'], 'url' => ['url']],
                'json' => ['tags' => 'tags'],
                'relations' => [
                    ['relation' => 'notes', 'fields' => ['note' => ['body']]],
                    ['relation' => 'files', 'fields' => ['file' => ['original_name']]],
                ],
                'image' => 'thumbnail_path',
            ],

            'playlist' => [
                // ⚠️ პლეილისტი **მოდული არაა** — ის სიმღერების შიგნით ცხოვრობს (§15)
                'module' => 'song',
                'model' => Playlist::class,
                'title_rank' => ['columns' => ['name']],
                'columns' => ['title' => ['name']],
            ],

            'book' => [
                'module' => 'book',
                'model' => Book::class,
                'custom' => 'book',
                'title_rank' => ['columns' => ['title_ka', 'title_en']],
                'columns' => [
                    'title' => ['title_ka', 'title_en'],
                    'description' => ['description_ka', 'description_en'],
                    'author' => ['author'],
                    'publisher' => ['publisher'],
                    'series' => ['series_name'],
                    'isbn' => ['isbn'],
                ],
                'json' => ['tags' => 'tags'],
                'relations' => [
                    // ციტატა იმავე ცხრილშია (`is_quote`) — ნაჭერს თავისი სახელი ჰქვია
                    ['relation' => 'notes', 'fields' => ['note' => ['body']], 'quote' => true],
                    ['relation' => 'files', 'fields' => ['file' => ['original_name']]],
                ],
                'image' => 'cover_path',
            ],

            'board_game' => [
                'module' => 'board_game',
                'model' => BoardGame::class,
                'custom' => 'board_game',
                'title_rank' => ['columns' => ['title']],
                'columns' => [
                    'title' => ['title'],
                    'description' => ['description'],
                    'designer' => ['designer'],
                    'publisher' => ['publisher'],
                ],
                'relations' => [
                    ['relation' => 'notes', 'fields' => ['note' => ['body']]],
                    ['relation' => 'files', 'fields' => ['file' => ['original_name']]],
                ],
                'image' => 'image_path',
            ],

            'game' => [
                'module' => 'game',
                'model' => Game::class,
                'custom' => 'game',
                'title_rank' => ['columns' => ['title_ka', 'title_en']],
                'columns' => [
                    'title' => ['title_ka', 'title_en'],
                    'description' => ['description_ka', 'description_en'],
                    'developer' => ['developer'],
                    'publisher' => ['publisher'],
                    'franchise' => ['franchise'],
                ],
                'json' => ['platform' => 'platforms'],
                'relations' => [
                    ['relation' => 'notes', 'fields' => ['note' => ['body']]],
                    ['relation' => 'videos', 'fields' => ['video' => ['title']]],
                    ['relation' => 'files', 'fields' => ['file' => ['original_name']]],
                ],
                'image' => 'cover_path',
            ],

            'note' => [
                'module' => 'note',
                'model' => NoteEntry::class,
                'custom' => 'note',
                'title_rank' => ['columns' => ['title']],
                'columns' => ['title' => ['title'], 'description' => ['description']],
                'json' => ['tags' => 'tags'],
                'relations' => [
                    ['relation' => 'files', 'fields' => ['file' => ['original_name']]],
                ],
            ],

            'course' => [
                'module' => 'course',
                'model' => Course::class,
                'custom' => 'course',
                'title_rank' => ['columns' => ['title']],
                'columns' => [
                    'title' => ['title'],
                    'description' => ['description'],
                    'instructor' => ['instructor'],
                    'url' => ['url'],
                ],
                'json' => ['tags' => 'tags'],
                'relations' => [
                    ['relation' => 'files', 'fields' => ['file' => ['original_name']]],
                ],
                'image' => 'thumbnail_path',
            ],

            'bookmark' => [
                'module' => 'bookmark',
                'model' => Bookmark::class,
                'custom' => 'bookmark',
                'title_rank' => ['columns' => ['title']],
                'columns' => [
                    'title' => ['title'],
                    'description' => ['description'],
                    'url' => ['url'],
                    'domain' => ['domain'],
                ],
                'json' => ['tags' => 'tags'],
                'image' => 'thumbnail_path',
            ],

            'gallery' => [
                'module' => 'gallery',
                'model' => GalleryVideo::class,
                'title_rank' => ['columns' => ['title']],
                'columns' => ['title' => ['title'], 'channel' => ['channel'], 'url' => ['url']],
                'image_url' => 'thumbnail_url',
            ],

            'cast' => [
                // ⚠️ მსახიობი მოდული არაა — ის მედია-დომენების საერთო ლექსიკონია
                'module' => null,
                'model' => CastMember::class,
                'title_rank' => ['columns' => ['name']],
                'columns' => [
                    'name' => ['name'],
                    'biography' => ['biography'],
                    'knownFor' => ['known_for'],
                    'birthplace' => ['place_of_birth'],
                ],
                'relations' => [
                    ['relation' => 'translations', 'fields' => ['name' => ['name']], 'eager' => false],
                ],
                'image' => 'photo_path',
                'scope' => fn (Builder $q) => $this->ownCastOnly($q, $user),
            ],
        ];

        // ⚠️ გამორთული მოდული ბაზას საერთოდ არ ეკითხება — და არა „იკითხება და იფილტრება"
        return array_filter($sources, fn (array $spec) => $this->allowed($user, $spec));
    }

    /** ხელმისაწვდომია თუ არა დომენი ამ ანგარიშზე */
    private function allowed(User $user, array $spec): bool
    {
        // მსახიობს თავისი მოდული არ აქვს: ის მედია-მოდულებთან ერთად ჩნდება
        if ($spec['module'] === null) {
            return (bool) $this->mediaRelations($user);
        }

        return $user->hasModule($spec['module']);
    }

    /** ჩართული მედია-მოდულების შესაბამისი კავშირები `cast_members`-ზე */
    private function mediaRelations(User $user): array
    {
        $map = ['movie' => 'movies', 'series' => 'series', 'anime' => 'animes'];

        return array_values(array_filter(
            $map,
            fn (string $module) => $user->hasModule($module),
            ARRAY_FILTER_USE_KEY,
        ));
    }

    /**
     * ⚠️ **მხოლოდ ჩემი ბიბლიოთეკის მსახიობები.** `cast_members` გლობალურია,
     * ე.ი. `owner` scope მასზე არ მუშაობს — ფილტრის გარეშე ძებნა სხვისი
     * ფილმების მსახიობებსაც აჩვენებდა, რომელთა გვერდიც აქ ცარიელია.
     */
    private function ownCastOnly(Builder $query, User $user): void
    {
        $relations = $this->mediaRelations($user);

        $query->where(function (Builder $q) use ($relations) {
            foreach ($relations as $relation) {
                $q->orWhereHas($relation);
            }
        });
    }

    /* ================= ერთი ჯგუფი ================= */

    private function group(string $domain, array $spec, string $term, int $perModule): array
    {
        /** @var class-string<Model> $model */
        $model = $spec['model'];
        $query = $model::query();

        if (isset($spec['scope'])) {
            ($spec['scope'])($query);
        }

        $this->applyWhere($query, $spec, $term);

        /* ⚠️ **ჯამი ცალკე ითვლება და არა შედეგების დათვლით**: ჭერი
           `$perModule`-ია, ე.ი. `count($items)` ყოველთვის ჭერს იტყოდა და
           „კიდევ N არის" პასუხი დაიკარგებოდა. */
        $total = (clone $query)->count();

        if ($total === 0) {
            return ['key' => $domain, 'module' => $spec['module'], 'total' => 0, 'items' => []];
        }

        $this->applyEager($query, $spec, $term);
        $this->applyOrder($query, $spec, $term);

        $records = $query->limit($perModule)->get();
        $custom = $this->customValues($spec, $records->modelKeys(), $term);

        $items = $records->map(fn (Model $record) => [
            'id' => $record->getKey(),
            'domain' => $domain,
            'module' => $spec['module'],
            'title' => $this->titleOf($domain, $record),
            'subtitle' => $this->subtitleOf($domain, $record),
            'image' => isset($spec['image']) ? $record->getAttribute($spec['image']) : null,
            'image_url' => isset($spec['image_url']) ? $record->getAttribute($spec['image_url']) : null,
            'matches' => $this->matchesOf($record, $spec, $term, $custom[$record->getKey()] ?? []),
        ])->all();

        return ['key' => $domain, 'module' => $spec['module'], 'total' => $total, 'items' => $items];
    }

    /* ---------- SQL ---------- */

    private function applyWhere(Builder $query, array $spec, string $term): void
    {
        $like = $this->like($term);

        $query->where(function (Builder $w) use ($spec, $like, $term) {
            foreach ($spec['columns'] ?? [] as $columns) {
                foreach ($columns as $column) {
                    $w->orWhere($column, 'like', $like);
                }
            }

            foreach ($spec['json'] ?? [] as $column) {
                $w->orWhere($column, 'like', $like);

                if ($escaped = $this->jsonLike($w, $term)) {
                    $w->orWhere($column, 'like', $escaped);
                }
            }

            foreach ($spec['relations'] ?? [] as $rel) {
                $w->orWhereHas($rel['relation'], fn (Builder $r) => $this->relationWhere($r, $rel, $like));
            }

            if (isset($spec['custom'])) {
                $this->customWhere($w, $spec['custom'], $like);
            }
        });
    }

    /**
     * ⚠️ **ტიპი `Builder|Relation`-ია განზრახ.** იგივე წესი ორგვარ
     * ადგილას იწერება — `whereHas()`-ის შიგნით (Builder) და
     * შეზღუდულ წინასწარ-ჩატვირთვაში, სადაც Laravel თვით **კავშირს</>**
     * გვაწვდის (`Relation`). ერთი ხელით დაწერილი პირობა ორ ადგილას
     * დაშორდებოდა — ეს კი ზუსტად ის შემთხვევაა, როცა ძებნა „პოულობს,
     * მაგრამ ნაჭერს აღარ აჩვენებს"-ად იქცევა.
     */
    private function relationWhere(Builder|Relation $query, array $rel, string $like): void
    {
        $query->where(function (Builder $q) use ($rel, $like) {
            foreach ($this->relationColumns($rel) as $column) {
                $q->orWhere($column, 'like', $like);
            }

            // მსახიობის ქართული სახელი თავის ცხრილშია (`cast_member_translations`)
            if (! empty($rel['translated'])) {
                $q->orWhereHas('translations', fn (Builder $t) => $t->where('name', 'like', $like));
            }
        });
    }

    /** კავშირის **ნამდვილი** სვეტები (აქსესორები SQL-ში ვერ მონაწილეობენ) */
    private function relationColumns(array $rel): array
    {
        if (isset($rel['where'])) {
            return $rel['where'];
        }

        return array_values(array_unique(array_merge(...array_values($rel['fields']))));
    }

    /**
     * **მორგებული ველები** (§6 ფაზა 3/4b) — `<module>_field_values`.
     *
     * ⚠️ ეს კავშირი არაა: ცხრილი მოდულისაა და არა მოდელის, ე.ი. `whereHas`
     * ვერ დაიწერება. ქვე-მოთხოვნა ერთია და იმავეს ეკითხება, რასაც ნაჭერი.
     */
    private function customWhere(Builder $query, string $module, string $like): void
    {
        $table = CustomFields::TABLE_BY_MODULE[$module] ?? null;
        if (! $table) {
            return;
        }

        $query->orWhereIn($query->getModel()->getTable().'.id', function ($sub) use ($table, $like) {
            $sub->select('record_id')->from($table)
                ->where(fn ($w) => $w->where('value_text', 'like', $like)->orWhere('value_name', 'like', $like));
        });
    }

    /**
     * კავშირების შეზღუდული წინასწარ-ჩატვირთვა — ნაჭერს მხოლოდ დამთხვეული
     * რიგები სჭირდება, ჩანაწერის ყველა შენიშვნის ჩამოტანა კი ტყუილი
     * დატვირთვაა.
     */
    private function applyEager(Builder $query, array $spec, string $term): void
    {
        $like = $this->like($term);
        $with = [];

        foreach ($spec['relations'] ?? [] as $rel) {
            if (($rel['eager'] ?? true) === false) {
                continue;
            }
            $with[$rel['relation']] = fn ($r) => $this->relationWhere($r, $rel, $like);
        }

        if ($with) {
            $query->with($with);
        }
    }

    /**
     * ⚠️ **სათაურის დამთხვევა პირველ რიგში.** `id desc`-ით დალაგებული სია
     * ჩანაწერს, რომლის **სათაურიც** ზუსტად ეს სიტყვაა, მეექვსე ადგილზე
     * გადააგდებდა — მაშინ, როცა ჩამოსაშლელში ხუთი ეტევა.
     */
    private function applyOrder(Builder $query, array $spec, string $term): void
    {
        $rank = $spec['title_rank'] ?? null;
        $like = $this->like($term);

        if (isset($rank['relation'])) {
            $query->withCount([
                $rank['relation'].' as title_hit' => fn (Builder $t) => $t->where($rank['column'], 'like', $like),
            ])->orderByDesc('title_hit');
        } elseif (isset($rank['columns'])) {
            $sql = implode(' or ', array_map(fn (string $c) => "$c like ?", $rank['columns']));
            $query->orderByRaw("case when ($sql) then 0 else 1 end", array_fill(0, count($rank['columns']), $like));
        }

        $query->orderByDesc($query->getModel()->getTable().'.id');
    }

    /* ---------- ნაჭრები ---------- */

    /**
     * @return list<array{field: string, text: string}>
     */
    private function matchesOf(Model $record, array $spec, string $term, array $custom): array
    {
        $out = [];

        foreach ($spec['columns'] ?? [] as $field => $columns) {
            foreach ($columns as $column) {
                if ($text = Snippet::around($record->getAttribute($column), $term)) {
                    $out[] = ['field' => $field, 'text' => $text];
                    break; // ერთი ველი — ერთი ნაჭერი (ka/en ორივეს ჩვენება გამეორებაა)
                }
            }
        }

        foreach ($spec['json'] ?? [] as $field => $column) {
            if ($text = $this->jsonMatch($record->getAttribute($column), $term)) {
                $out[] = ['field' => $field, 'text' => $text];
            }
        }

        foreach ($spec['relations'] ?? [] as $rel) {
            if (! $record->relationLoaded($rel['relation'])) {
                continue;
            }

            foreach ($record->getRelation($rel['relation']) as $row) {
                foreach ($rel['fields'] as $field => $columns) {
                    foreach ($columns as $column) {
                        if ($text = Snippet::around($row->getAttribute($column), $term)) {
                            // წიგნის ციტატა იმავე ცხრილშია — მას თავისი სახელი ჰქვია
                            $name = ! empty($rel['quote']) && $row->is_quote ? 'quote' : $field;
                            $out[] = ['field' => $name, 'text' => $text];
                            break 3;
                        }
                    }
                }
            }
        }

        foreach ($custom as $text) {
            if ($snippet = Snippet::around($text, $term)) {
                $out[] = ['field' => 'field', 'text' => $snippet];
            }
        }

        return $this->rank($out);
    }

    /**
     * ტეგები/პლატფორმები: მასივიდან **მხოლოდ დამთხვეული** ელემენტები.
     * მთელი JSON-ი ნაჭერში `["ინფო","სხვა"]`-დ გამოჩნდებოდა.
     */
    private function jsonMatch(mixed $value, string $term): ?string
    {
        if (is_string($value)) {
            $value = json_decode($value, true);
        }
        if (! is_array($value)) {
            return null;
        }

        $hits = [];
        array_walk_recursive($value, function ($item) use ($term, &$hits) {
            if (is_string($item) && mb_stripos($item, $term) !== false) {
                $hits[] = $item;
            }
        });

        return $hits ? implode(' · ', array_slice(array_unique($hits), 0, 6)) : null;
    }

    /** ერთი მოთხოვნა გვერდზე მოხვედრილი ჩანაწერების მორგებულ ველებზე */
    private function customValues(array $spec, array $ids, string $term): array
    {
        $table = isset($spec['custom']) ? (CustomFields::TABLE_BY_MODULE[$spec['custom']] ?? null) : null;
        if (! $table || ! $ids) {
            return [];
        }

        $like = $this->like($term);
        $rows = DB::table($table)
            ->whereIn('record_id', $ids)
            ->where(fn ($w) => $w->where('value_text', 'like', $like)->orWhere('value_name', 'like', $like))
            ->limit(count($ids) * self::MATCHES_PER_RECORD)
            ->get(['record_id', 'value_text', 'value_name']);

        $out = [];
        foreach ($rows as $row) {
            $out[$row->record_id][] = $row->value_text ?: $row->value_name;
        }

        return $out;
    }

    /** ველების მნიშვნელობით დალაგება + ჭერი */
    private function rank(array $matches): array
    {
        usort($matches, function (array $a, array $b) {
            $ai = array_search($a['field'], self::FIELD_ORDER, true);
            $bi = array_search($b['field'], self::FIELD_ORDER, true);

            return ($ai === false ? 99 : $ai) <=> ($bi === false ? 99 : $bi);
        });

        return array_slice($matches, 0, self::MATCHES_PER_RECORD);
    }

    /* ---------- სათაური / ქვესათაური ---------- */

    private function titleOf(string $domain, Model $record): string
    {
        $title = match ($domain) {
            'movie', 'series', 'anime', 'book', 'game' => $record->title_ka ?: $record->title_en,
            'cast' => $record->name_ka ?: $record->name,
            'playlist' => $record->name,
            default => $record->title,
        };

        return (string) ($title ?: '—');
    }

    private function subtitleOf(string $domain, Model $record): ?string
    {
        $value = match ($domain) {
            'movie', 'series', 'anime', 'game' => $record->year ? (string) $record->year : null,
            'song' => $record->artist,
            'book' => $record->author,
            'board_game' => $record->designer,
            'bookmark' => $record->domain,
            'cast' => $record->known_for,
            'gallery' => $record->channel,
            default => null,
        };

        return $value ?: null;
    }

    /* ---------- helpers ---------- */

    /** ⚠️ შაბლონი `App\Support\Like`-შია (§10.9) — ჩატის ძებნას იგივე სჭირდება */
    private function like(string $term): string
    {
        return Like::contains($term);
    }

    /**
     * **JSON სვეტში ქართული `ი`-ის სახით ინახება.**
     *
     * ⚠️ ეს გაზომილია და არა თეორია: Eloquent-ის `array` cast ჩვეულებრივ
     * `json_encode()`-ს იძახებს, ე.ი. `["ინფორმაცია"]` ბაზაში
     * `["ინფ…"]`-ად წევს — ჩვეულებრივი `LIKE '%ინფ%'`
     * ქართულ **ტეგს ვერასდროს იპოვიდა**. ამიტომ იმავე ტერმინის
     * „გაქცეული" ფორმაც ისმის.
     *
     * ⚠️ **უკუწილადების რაოდენობა ძრავზეა დამოკიდებული.** MySQL-ის `LIKE`
     * ნაგულისხმევად `\`-ს escape-სიმბოლოდ კითხულობს (ე.ი. ლიტერალი
     * უკუწილადი `\`-ია), sqlite-ს კი `ESCAPE`-ის გარეშე escape საერთოდ
     * არ აქვს — ერთი და იგივე შაბლონი ერთგან იმუშავებდა, მეორეგან ჩუმად
     * არა.
     *
     * ASCII ტერმინზე `null` ბრუნდება — იქ ჩვეულებრივი `LIKE` ისედაც კმარა.
     */
    private function jsonLike(Builder $query, string $term): ?string
    {
        $encoded = trim(json_encode($term), '"');

        if ($encoded === $term) {
            return null;
        }

        $sqlite = $query->getConnection()->getDriverName() === 'sqlite';

        return '%'.($sqlite ? $encoded : str_replace('\\', '\\\\', $encoded)).'%';
    }

    /**
     * ⚠️ **`LIKE`-ის სპეცსიმბოლოები ეკრანირდება.** `%` და `_` შაბლონის
     * ნაწილია: მათ გარეშე „50%" მთელ ცხრილს დააბრუნებდა, `_` კი ნებისმიერ
     * სიმბოლოს დაემთხვეოდა — ე.ი. ძებნა ჩუმად სხვა კითხვას პასუხობდა.
     */
    private function escape(string $term): string
    {
        return Like::escape($term);
    }
}
