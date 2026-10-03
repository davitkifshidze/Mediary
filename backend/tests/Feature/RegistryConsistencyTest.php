<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\DashboardController;
use App\Models\Bookmark;
use App\Models\BookmarkCategory;
use App\Models\Concerns\HasGallery;
use App\Models\Concerns\HasStatus;
use App\Models\Game;
use App\Models\Module;
use App\Models\Movie;
use App\Models\NoteCategory;
use App\Models\User;
use App\Models\VideoType;
use App\Services\Export\RecordExporter;
use App\Services\Gallery\ModuleImages;
use App\Services\Purge\PurgeService;
use App\Services\Share\ShareImporter;
use App\Services\Storage\StorageMeter;
use App\Support\AuditRegistry;
use App\Support\CredentialProviders;
use App\Support\CustomFields;
use App\Support\ExportDomain;
use App\Support\FieldCatalog;
use App\Support\GalleryParent;
use App\Support\ImportSource;
use App\Support\MediaDomain;
use App\Support\PublicDomain;
use App\Support\ShareDomain;
use App\Support\StatusDomain;
use App\Support\StorageFolder;
use App\Support\TrashDomain;
use App\Support\UploadLimits;
use App\Support\Visitable;
use Database\Seeders\ModulesSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * **ჯვარედინი რუკების სისრულე.**
 *
 * ⚠️ ეს ტესტი ერთი კონკრეტული ხაფანგისთვისაა: ახალი მოდული **რამდენიმე
 * რუკაში** უნდა ჩაიწეროს და ერთის დავიწყება **ჩუმია** — არც `tsc` ხედავს,
 * არც ლინტერი. რეალურად ორჯერ მოხდა:
 *  · `games.cover_path`/`game_files.path` `referencedPaths()`-ში არ ეწერა და
 *    ადმინის „ობოლების გასუფთავება" **ცოცხალ ფაილებს შლიდა** (2026-09-04);
 *  · `game` ფრონტის `DICTIONARIES`-ში აკლდა და `/purge` ცარიელ ტიპების სიას
 *    ხატავდა (იმავე დღეს).
 *
 * ე.ი. აქ **დაშვებები** მოწმდება და არა ქცევა: სქემა ითვლება წყაროდ, რუკები —
 * მის ანარეკლად. ფრონტის მხარეს იგივე როლს ტიპები ასრულებს
 * (`PurgeTargetWithType` → `DICTIONARIES`), რასაც PHP ვერ დაინახავს.
 */
class RegistryConsistencyTest extends TestCase
{
    use RefreshDatabase;

    /**
     * სვეტები, რომლებიც **დისკის გზა არ არის** და ამიტომ `referencedPaths()`-ში
     * არც უნდა ეწეროს.
     *
     * ⚠️ `gallery_images.remote_path` **TMDB-ის** გზაა (`/abc.jpg`) და არა
     * ჩვენი დისკის — მისი აქ ჩაწერა სკანერს ყალბ „მოხსენიებას" ასწავლიდა.
     */
    private const NOT_DISK_PATHS = [
        'gallery_images.remote_path',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
    }

    /**
     * ⚠️ **ყოველი ატვირთვის სვეტი `referencedPaths()`-ში უნდა ეწეროს.**
     * რაც იქ არ წერია, ობოლია — და ადმინის გასუფთავება **წაშლის**.
     */
    public function test_every_path_column_is_known_to_the_orphan_scanner(): void
    {
        $known = $this->scannerColumns();

        /* ⚠️ **ჯერ თვითონ წამკითხველი შევამოწმოთ.** სია წყაროდან იკითხება
           (იხ. `scannerColumns()`), ე.ი. `referencedPaths()`-ის გადაწერამ
           შეიძლება parse გატეხოს — მაშინ სია ცარიელი გამოვიდოდა და ტესტი
           **ცრუდ გაივლიდა**. ეს სამი წამყვანი სწორედ ამას იჭერს. */
        foreach (['users.avatar_path', 'gallery_images.path', 'messages.attachment_path'] as $anchor) {
            $this->assertContains($anchor, $known,
                "`referencedPaths()`-ის წაკითხვა გატყდა (`{$anchor}` ვერ მოიძებნა) — ტესტი ცრუდ გაივლიდა"
            );
        }

        $missing = [];

        foreach ($this->schemaPathColumns() as $column) {
            if (! in_array($column, $known, true) && ! in_array($column, self::NOT_DISK_PATHS, true)) {
                $missing[] = $column;
            }
        }

        $this->assertSame([], $missing, implode(PHP_EOL, [
            'ეს სვეტები დისკის გზას ინახავს, მაგრამ StorageMeter::referencedPaths()-ში არ წერია.',
            'შედეგი: ფაილი „ობოლად" ჩაითვლება და ადმინის გასუფთავება წაშლის.',
            'გამოსავალი: ჩაწერე იქ, ან — თუ ეს დისკის გზა არ არის — ამ ტესტის NOT_DISK_PATHS-ში.',
            'გამორჩენილი: '.implode(', ', $missing),
        ]));
    }

    /** ყოველი მოდული (გარდა `gallery`-სა, რომელსაც ჩანაწერი არ აქვს) მასობრივ წაშლაშია */
    public function test_every_module_is_a_purge_target(): void
    {
        $modules = Module::pluck('key')->all();
        $targets = array_keys(PurgeService::TARGET_MODES);

        $missing = array_values(array_diff($modules, $targets));

        $this->assertSame([], $missing,
            'მოდული `PurgeService::TARGET_MODES`-ში არ წერია: '.implode(', ', $missing)
        );
    }

    /**
     * ⚠️ **ყოველ მოდულს ფერი უნდა ჰქონდეს (ეტაპი 6).**
     *
     * ფერი მხოლოდ ჰედერის ფონი აღარაა — საიდბარის ხაზი, ხატულა და აქტიური
     * ქვე-პუნქტის ფონიც მისგან იგება. ფერის გარეშე ახალი მოდული **ჩუმად**
     * ოქროსფერზე დაბრუნდებოდა და უკვე არსებულს გაუთანაბრდებოდა, ე.ი.
     * „ყველა მოდულს თავისი ფერი" ერთ ჩანაწერზე დაირღვეოდა.
     *
     * ⚠️ სიდერი ფერს **მხოლოდ ცარიელს** აწერს (`color === null`), ე.ი. ეს
     * შემოწმება `/modules/{key}`-ზე ხელით არჩეულ ფერს ვერაფერს დააკლებს.
     */
    public function test_every_module_has_a_colour(): void
    {
        $missing = Module::whereNull('color')->orderBy('key')->pluck('key')->all();

        $this->assertSame([], $missing,
            'მოდულს ფერი არ აქვს (`ModulesSeeder::COLORS`): '.implode(', ', $missing)
        );

        // ⚠️ ორ მოდულს ერთი ფერი არ უნდა ჰქონდეს — „განსხვავებული ფერი"
        // სწორედ ეს პუნქტია და ასლი ვიზუალურად უხილავია.
        $colours = Module::pluck('color')->all();

        $this->assertSame(count($colours), count(array_unique($colours)),
            'ორ მოდულს ერთი და იგივე ფერი აქვს'
        );
    }

    /**
     * **Tasks §40.10 — ყოველი საბაზისო მოდული ან ბმულით ზიარდება, ან მიზეზით არა.**
     *
     * ⚠️ ხვალინდელი მოდული ტესტს თავისით აწითლებს: მისი გამოტოვება
     * გადაწყვეტილება უნდა იყოს (`ShareDomain::NOT_SHARED`-ში, მიზეზით) და არა
     * დავიწყება. და პირიქით — მკვდარი ან ორჯერ ჩაწერილი გასაღებიც წითელია.
     * ⚠️ გაზიარებულ დომენს **იდენტობა** სჭირდება (`PublicDomain::MATCH`):
     * „უკვე გაქვს ✓" და (40.8) დამატება სწორედ მისით პოულობს „იმავე ფილმს".
     */
    public function test_every_module_is_shareable_or_has_a_reason(): void
    {
        $modules = Module::base()->pluck('key')->all();
        $shared = array_map(ShareDomain::module(...), ShareDomain::keys());
        $reasoned = array_keys(ShareDomain::NOT_SHARED);

        $this->assertSame([], array_values(array_diff($modules, $shared, $reasoned)),
            'მოდული არც `ShareDomain`-შია და არც `NOT_SHARED`-ში'
        );
        $this->assertSame([], array_values(array_diff($reasoned, $modules)),
            '`NOT_SHARED`-ში მკვდარი გასაღებია'
        );
        $this->assertSame([], array_values(array_intersect($shared, $reasoned)),
            'მოდული ერთდროულად ზიარდება და გამონაკლისიცაა'
        );

        foreach (ShareDomain::keys() as $domain) {
            $this->assertTrue(PublicDomain::has($domain), "{$domain}: ბარათი (`PublicDomain::card()`) არ აქვს");

            // ⚠️ სიას (§40.13 — პლეილისტი) გლობალური იდენტობა არ აქვს: ის ასლის წყაროთი იცნობა (`copied_from_id`)
            if (ShareDomain::isList($domain)) {
                continue;
            }

            $this->assertNotEmpty(PublicDomain::MATCH[$domain]['columns'] ?? [], "{$domain}: იდენტობა არ აქვს");
        }

        foreach (ShareDomain::NOT_SHARED as $key => $reason) {
            $this->assertNotSame('', trim($reason), "{$key}: მიზეზი ცარიელია");
        }
    }

    /**
     * **გაზიარების რეესტრის ყოველი რიგი ცოცხალ სქემასა და კატალოგზე დგას** (§40.10).
     *
     * ⚠️ აქ ყველაფერი ჩუმად ტყდება: არარსებული სვეტი რეცეპტში — ფაქტი ჩუმად არ
     * გადმოდის (ან SQL 500 დამატებისას); არასწორი რელაცია — ჟანრი ჩუმად ცარიელია;
     * კატალოგის ველის შეცდომა — მფლობელის „საჯაროდ არ გამოჩნდეს" ჩუმად არაფერს
     * აკეთებს; enum-ის ნაგულისხმევი სიაში თუ არ არის — `invalid_status` საკუთარ ჩანაწერზე;
     * „რჩეული" სვეტის გარეშე — SQL-ის შეცდომა ბმულის გახსნისას (§40.13).
     */
    public function test_every_share_domain_is_wired_to_real_columns(): void
    {
        $media = MediaDomain::TYPES;
        $recipes = ShareImporter::recipeDomains();

        $this->assertEqualsCanonicalizing(
            array_values(array_filter(
                array_diff(ShareDomain::keys(), $media),
                fn (string $domain) => ! ShareDomain::isList($domain),
            )),
            $recipes,
            'ეტაპი 2-ის ყოველ ჩანაწერიან დომენს დამატების რეცეპტი უნდა ჰქონდეს (და სხვას — არა)'
        );

        foreach (ShareDomain::keys() as $domain) {
            $model = ShareDomain::model($domain);
            $instance = new $model;
            $table = $instance->getTable();
            $module = ShareDomain::module($domain);

            // „რჩეული" — ფარგალი მხოლოდ იქ, სადაც სვეტი არსებობს
            $this->assertSame(Schema::hasColumn($table, 'is_favorite'), ShareDomain::supportsFavorite($domain), "{$domain}: `favorite` სქემას არ ემთხვევა");

            // §40.13 — სია (პლეილისტი): კლასიფიკატორი და ფოტო არ აქვს, „უკვე გაქვს" ასლის წყაროთი იცნობა
            if (ShareDomain::isList($domain)) {
                $this->assertFalse(ShareDomain::hasClassifier($domain), "{$domain}: სიას კლასიფიკატორი არ აქვს");
                $this->assertNull(ShareDomain::photoField($domain), "{$domain}: სიას მთავარი ფოტო არ აქვს");
                $this->assertTrue(Schema::hasColumn($table, 'copied_from_id'), "{$domain}: ასლის წყაროს სვეტი არ არსებობს");

                continue;
            }

            // კლასიფიკატორი — რელაცია არსებობს და სწორ ლექსიკონს ეკითხება
            $classifier = (array) ShareDomain::classifier($domain);
            $relation = $instance->{$classifier['relation']}();
            $this->assertSame($classifier['model'], get_class($relation->getRelated()), "{$domain}: კლასიფიკატორის რელაცია სხვა მოდელს ეკითხება");
            // ⚠️ `MorphToMany` (მედიის `genreables`) `BelongsToMany`-ის ქვეკლასია
            $this->assertSame($classifier['multi'], $relation instanceof BelongsToMany, "{$domain}: `multi` სტრუქტურას არ ემთხვევა");
            $this->assertTrue(FieldCatalog::knows($module, $classifier['field']), "{$domain}: კლასიფიკატორის ველი კატალოგში არ არის");
            $this->assertTrue(FieldCatalog::knows($module, (string) ShareDomain::photoField($domain)), "{$domain}: მთავარი ფოტოს ველი კატალოგში არ არის");

            if (! in_array($domain, $media, true)) {
                $shape = ShareDomain::classifierShape($domain);
                $columns = $shape['type'] === 'column' ? [$shape['column']] : [];

                foreach ([...ShareImporter::recipeColumns($domain), ...$columns] as $column) {
                    $this->assertTrue(Schema::hasColumn($table, $column), "{$domain}: რეცეპტის სვეტი `{$table}.{$column}` არ არსებობს");
                }
            }

            if (ShareDomain::statusKind($domain) === 'enum') {
                $this->assertContains(ShareDomain::defaultStatus($domain), $model::STATUSES, "{$domain}: enum-ის ნაგულისხმევი სიაში არ არის");
            }

            if (ShareDomain::statusKind($domain) === 'dictionary') {
                $this->assertTrue(StatusDomain::usesDictionary($domain), "{$domain}: ლექსიკონი `StatusDomain`-ში არ არის");
            }
        }
    }

    /** Tasks §10 — SPA-ს `VISIT_TYPES` `Visitable::TYPES`-ის სარკეა (URL-ის სეგმენტი და morph-ალიასი ერთი სიტყვაა) */
    public function test_the_spa_visit_types_mirror_the_backend(): void
    {
        $this->assertSame(Visitable::keys(), $this->tsConstList('api/visits.ts', 'VISIT_TYPES'));
    }

    /** SPA-ს `SHARE_DOMAINS` — `ShareDomain::DOMAINS`-ის სარკე, რიგის ჩათვლით */
    public function test_the_spa_share_domains_mirror_the_backend(): void
    {
        $this->assertSame(ShareDomain::keys(), $this->tsConstList('api/shareLinks.ts', 'SHARE_DOMAINS'));
    }

    /**
     * SPA-ს `SHARE_DOMAIN_META` — სტატუსი, კლასიფიკატორი, `multi`, `global`, შეფასება,
     * „რჩეული" და მოდული backend-ს ემთხვევა.
     *
     * ⚠️ დაშორება ჩუმია: ფანჯარა „სტატუსით"-ს სტატუსის უქონელ დომენზე
     * შესთავაზებდა (422), „ყველა ერთდროულად"-ს ერთსვეტიანზე (სერვერი `any`-ად
     * აქცევდა და რიცხვი სხვას იტყოდა), „რჩეულს" პლეილისტზე (422), ან სექციას
     * სხვა მოდულის უფლებით დახატავდა.
     */
    public function test_the_spa_share_meta_mirrors_the_backend(): void
    {
        $source = (string) file_get_contents(base_path('../frontend/src/lib/shareLinks.ts'));
        preg_match_all(
            "/^\s{2}(\w+): \{ status: (null|'(\w+)'), classifier: (null|'(\w+)'), multi: (true|false), global: (true|false), personalRating: (true|false), favorite: (true|false), module: '(\w+)'/m",
            $source,
            $rows,
            PREG_SET_ORDER,
        );

        $this->assertSame(ShareDomain::keys(), array_column($rows, 1), '`SHARE_DOMAIN_META` ვერ წაიკითხა ან დომენი აკლია');

        foreach ($rows as $row) {
            $domain = $row[1];
            $this->assertSame(ShareDomain::statusKind($domain), $row[2] === 'null' ? null : $row[3], "{$domain}: status");
            $this->assertSame(ShareDomain::hasClassifier($domain), $row[4] !== 'null', "{$domain}: classifier");
            $this->assertSame(ShareDomain::classifierIsMulti($domain), $row[6] === 'true', "{$domain}: multi");
            $this->assertSame(ShareDomain::classifierIsGlobal($domain), $row[7] === 'true', "{$domain}: global");
            $this->assertSame(ShareDomain::hasPersonalRating($domain), $row[8] === 'true', "{$domain}: personalRating");
            $this->assertSame(ShareDomain::supportsFavorite($domain), $row[9] === 'true', "{$domain}: favorite");
            $this->assertSame(ShareDomain::module($domain), $row[10], "{$domain}: module");
        }
    }

    /**
     * ⚠️ `status` სკოუპიან სამიზნეს **სტატუსების სია უნდა ჰქონდეს**, თორემ
     * `status=…` ჩუმად ცარიელ სკოუპად იქცევა (და არა 422-ად).
     */
    public function test_every_status_target_has_a_status_dictionary(): void
    {
        $missing = [];

        foreach (PurgeService::TARGET_MODES as $target => $modes) {
            // გალერეა ჩანაწერს არ შლის — სტატუსს მედია-დომენიდან იღებს
            if ($target === 'gallery' || ! in_array('status', $modes, true)) {
                continue;
            }

            if (! isset(PurgeService::TARGET_STATUSES[$target])) {
                $missing[] = $target;
            }
        }

        $this->assertSame([], $missing,
            '`status` სკოუპი აქვს, სტატუსების სია კი არა: '.implode(', ', $missing)
        );
    }

    /**
     * ⚠️ **`tag` სკოუპიან სამიზნეს `tags` სვეტი უნდა ჰქონდეს** (BUG-16).
     *
     * `recordIds()`-ის `match`-ში `'tag' => null` წერია, ე.ი. ტეგის სკოუპი
     * ჯერ **მთელი ბიბლიოთეკაა** და ჭრა მერე, PHP-ში ხდება. ამიტომ აქ შეცდომა
     * ცალმხრივია და საშიში: `TARGET_MODES`-ში `tag`-ის დამატება იმ დომენზე,
     * რომელსაც `tags` არ აქვს, ჩუმად უპირობო წაშლას ნიშნავს. თვითონ სიების
     * დაშორება უკვე შეუძლებელია (`PurgeService::supportsTag()` ერთადერთი
     * წყაროა), დარჩენილი დაშვება კი სქემაა — და სწორედ ის მოწმდება.
     */
    public function test_every_tag_purge_target_actually_has_a_tags_column(): void
    {
        $targets = array_keys(array_filter(
            PurgeService::TARGET_MODES,
            fn (array $modes) => in_array('tag', $modes, true),
        ));

        $this->assertNotEmpty($targets);

        foreach ($targets as $target) {
            $this->assertTrue(
                PurgeService::supportsTag($target),
                "`{$target}`-ს `TARGET_MODES` `tag`-ს უშვებს, `supportsTag()` კი არა",
            );

            $model = CustomFields::model($target);
            $this->assertNotNull($model, "`{$target}`-ის მოდელი `CustomFields::model()`-ში არ წერია");

            $table = (new $model)->getTable();
            $this->assertTrue(
                Schema::hasColumn($table, 'tags'),
                "`{$target}`-ს `/purge`-ში `tag` სკოუპი აქვს, `{$table}.tags` სვეტი კი არა",
            );
        }
    }

    /**
     * ⚠️ **ორი ნაგულისხმევი სია არ უნდა დაშორდეს** (§6.4).
     *
     * `StatusDomain::DOMAINS` ქმნის ლექსიკონს, `PurgeService::TARGET_STATUSES`
     * კი იმავე ნაგულისხმევებს აღწერს (ფრონტს მოთხოვნამდე რაღაც უნდა დახატოს).
     * ერთში სტატუსის დამატება და მეორეში დავიწყება **ჩუმია**: `/purge`
     * უბრალოდ ერთი ვარიანტით ნაკლებს აჩვენებდა.
     */
    public function test_purge_default_statuses_match_the_dictionary(): void
    {
        foreach (StatusDomain::keys() as $domain) {
            $this->assertSame(
                StatusDomain::defaultKeys($domain),
                PurgeService::TARGET_STATUSES[$domain] ?? [],
                "`{$domain}`-ის ნაგულისხმევი სტატუსები `PurgeService::TARGET_STATUSES`-ს არ ემთხვევა",
            );
        }
    }

    /**
     * ⚠️ **ყოველ ლექსიკონიან დომენს მართვადი სტატუსი უნდა ჰქონდეს ბოლომდე**:
     * `HasStatus` trait-ი, `status_id` სვეტი და `PurgeService`-ის `status`
     * სკოუპი. ერთის გამორჩენა ჩუმია — ჩანაწერი უბრალოდ სტატუსის გარეშე
     * რჩებოდა ან ფილტრი ცარიელს აბრუნებდა.
     */
    public function test_every_status_dictionary_domain_is_wired_end_to_end(): void
    {
        foreach (StatusDomain::DOMAINS as $domain => $config) {
            $model = new $config['model'];

            $this->assertContains(
                HasStatus::class,
                class_uses_recursive($model),
                "`{$domain}` მოდელს `HasStatus` არ აქვს",
            );

            $this->assertTrue(
                Schema::hasColumn($model->getTable(), 'status_id'),
                "`{$model->getTable()}.status_id` სვეტი არ არსებობს",
            );

            $this->assertContains(
                'status',
                PurgeService::TARGET_MODES[$domain] ?? [],
                "`{$domain}`-ს `/purge`-ში `status` სკოუპი არ აქვს",
            );
        }
    }

    /**
     * ⚠️ **ყოველ `visibility`-იან ცხრილს `PublicDomain::DOMAINS`-ში ადგილი
     * უნდა ჰქონდეს** — თორემ სვეტი არსებობს, გადამრთველიც ჩანს, საჯარო
     * პროფილზე კი ჩანაწერი მაინც არასდროს გამოჩნდება.
     *
     * ერთადერთი გამონაკლისი `note_entries`-ია და ის **განზრახაა** (§16.5:
     * ჩანაწერების მოდული პირად დოკუმენტებს ინახავს და არასდროს საჯაროვდება).
     */
    public function test_every_visibility_table_is_a_public_domain_or_deliberately_excluded(): void
    {
        /* ცხრილს **მოდელს** ვეკითხებით — რუკაში მხოლოდ კლასი წერია.
           ⚠️ §37.4 — `tables()` პირადი მოდულების ცხრილსაც შეიცავს (`custom_records`):
           მისი დომენები ინტერფეისიდან იქმნება და რუკაში ვერ ჩაიწერება. */
        $tables = PublicDomain::tables();

        $excluded = ['note_entries'];
        $missing = [];

        foreach ($this->tablesWithColumn('visibility') as $table) {
            if (! in_array($table, $tables, true) && ! in_array($table, $excluded, true)) {
                $missing[] = $table;
            }
        }

        $this->assertSame([], $missing, implode(PHP_EOL, [
            'ცხრილს `visibility` აქვს, `PublicDomain::DOMAINS`-ში კი არ წერია.',
            'შედეგი: გადამრთველი მუშაობს, საჯარო პროფილზე ჩანაწერი მაინც არ ჩანს.',
            'გამორჩენილი: '.implode(', ', $missing),
        ]));
    }

    /**
     * ⚠️ **ყოველ საჯარო დომენს `card()`-ში შტო უნდა ჰქონდეს** (Tasks §2).
     *
     * `match`-ს `default` არ აქვს და ეს განზრახაა — უცნობი დომენისთვის
     * „ცარიელი ბარათი" ჩუმად გაჟონავდა. სამაგიეროდ გამორჩენა **500**-ია
     * ოთხ ადგილას (ხილვადობის სია, საჯარო პროფილი, დამთხვევები, ჩატის
     * გაზიარება) — და ის მხოლოდ მაშინ ჩანს, როცა პირველი საჯარო ჩანაწერი
     * გაჩნდება. კურსი და ადგილი ზუსტად ასე იდგა, სანამ ეს ტესტი დაიწერებოდა.
     */
    public function test_every_public_domain_has_a_card(): void
    {
        $missing = [];

        foreach (PublicDomain::DOMAINS as $domain => $meta) {
            try {
                PublicDomain::card($domain, new $meta['model']);
            } catch (\UnhandledMatchError) {
                $missing[] = $domain;
            }
        }

        $this->assertSame([], $missing, 'PublicDomain::card()-ს შტო აკლია: '.implode(', ', $missing));
    }

    /**
     * ⚠️ **SPA-ის `PUBLIC_DOMAINS` `PublicDomain::DOMAINS`-ის სარკეა** (Tasks §2).
     *
     * ტიპისთვის სია ფრონტში უნდა ეწეროს (`PublicDomainKey` ათეულ ადგილას
     * იკითხება), მაგრამ ხელით დაწერილმა სარკემ კურსი და ადგილი ჩამოიტოვა —
     * „რომელი ჩანაწერი ჩანს"-ში მათი ჩანართი უბრალოდ არ იხატებოდა. ეს
     * ტესტი სარკეს წყაროდან კითხულობს და თანმიმდევრობასაც ადარებს
     * (ის ტაბების რიგია).
     */
    public function test_the_spa_public_domain_list_mirrors_the_backend(): void
    {
        $this->assertSame(PublicDomain::keys(), $this->tsConstList('api/publicProfile.ts', 'PUBLIC_DOMAINS'));
    }

    /**
     * ⚠️ **SPA-ის `MATCH_DOMAINS` `PublicDomain::matchable()`-ის სარკეა** (ნაპოვნია §37.4-ზე).
     *
     * კურსი და ადგილი backend-ის დამთხვევაში FEAT-25/26-იდან იდგა, SPA-ის
     * სიაში კი არა — ტიპი ამბობდა, რომ ასეთი დომენი არ არსებობს, სერვერი
     * კი მათ რიგებს აბრუნებდა. §37.4-მა `custom` ფსევდო-დომენი დაამატა.
     */
    public function test_the_spa_match_domain_list_mirrors_the_backend(): void
    {
        $this->assertSame(PublicDomain::matchable(), $this->tsConstList('api/publicProfile.ts', 'MATCH_DOMAINS'));
    }

    /**
     * ⚠️ **დამატებითი ველების მოდულების სარკე SPA-ში** (ნაპოვნია Tasks §37-ზე).
     *
     * `CUSTOM_FIELD_MODULES`-ს ანიმე, კურსი და ადგილი აკლდა, ე.ი. მათ
     * `/modules/{key}`-ზე დამატებითი ველების რედაქტორი **საერთოდ არ იხატებოდა**
     * — backend ველებს იღებდა, ინტერფეისი კი მათ შექმნის გზას არ აჩვენებდა.
     * ხარვეზი ჩუმი იყო: არც ტიპი, არც lint, არც სხვა ტესტი მას ვერ ხედავდა.
     */
    public function test_the_spa_custom_field_modules_mirror_the_backend(): void
    {
        $this->assertSame(CustomFields::modules(), $this->tsConstList('api/account.ts', 'CUSTOM_FIELD_MODULES'));
    }

    /**
     * ⚠️ **გალერეის მშობლების ორი სარკე SPA-ში** (Tasks §4.10) — §2-ის ტყუპი:
     * `GALLERY_PARENTS`-ს ადგილი აკლდა, ამიტომ „ბიბლიოთეკის" ჩანართი არ
     * ჩანდა და ფოტოს ადგილზე ვერ გადაიტანდი; `SERP_IMPORT_TARGETS`-ს —
     * იგივე, ვებიდან ძებნის დიალოგისთვის.
     */
    public function test_the_spa_gallery_parent_lists_mirror_the_backend(): void
    {
        $this->assertSame(GalleryParent::recordKeys(), $this->tsConstList('api/gallery.ts', 'GALLERY_PARENTS'));
        $this->assertSame(GalleryParent::keys(), $this->tsConstList('api/web.ts', 'SERP_IMPORT_TARGETS'));
    }

    /**
     * **ბუკმარკის დამატებითი ბმულის ტიპები SPA-შიც წერია** (Tasks §36.3).
     *
     * ⚠️ ახალი ტიპი, რომელიც მხოლოდ backend-შია, ფორმაში არ გამოჩნდებოდა, ხოლო
     * ფასიანი ტიპების სხვაობა ფორმას ფასის ველს დაახატინებდა, რომელსაც სერვერი
     * ჩუმად ჭრის (`Bookmark::normalizeLinks()`).
     */
    public function test_the_spa_bookmark_link_kinds_mirror_the_backend(): void
    {
        $this->assertSame(Bookmark::LINK_KINDS, $this->tsConstList('api/bookmarks.ts', 'BOOKMARK_LINK_KINDS'));
        $this->assertSame(Bookmark::PRICED_LINK_KINDS, $this->tsConstList('api/bookmarks.ts', 'BOOKMARK_PRICED_LINK_KINDS'));
    }

    /**
     * ⚠️ **თამაშის ბმულის ორი ღერძი და ჰოსტების რუკა SPA-შიც წერია** (Tasks §22.3).
     *
     * ფორმა ტიპს სიიდან ხატავს და Steam-ის ბმულს ჰოსტით ცნობს — backend-ის
     * ახალი ტიპი SPA-ში რომ არ იყოს, ის ფორმაში უბრალოდ არ გამოჩნდებოდა, ხოლო
     * ჰოსტების რუკის სხვაობა ერთ მხარეს „მაღაზიას" დაწერდა და მეორეს — „სხვას".
     */
    public function test_the_spa_game_link_lists_mirror_the_backend(): void
    {
        $this->assertSame(Game::LINK_KINDS, $this->tsConstList('api/games.ts', 'GAME_LINK_KINDS'));
        $this->assertSame(Game::LINK_STORES, $this->tsConstList('api/games.ts', 'GAME_LINK_STORES'));

        $source = (string) file_get_contents(base_path('../frontend/src/lib/gameLinks.ts'));
        $this->assertSame(1, preg_match('/const STORE_HOSTS: Record<string, GameLinkStore> = \{(.*?)\}/s', $source, $m), 'STORE_HOSTS ვერ მოიძებნა');
        preg_match_all("/'([a-z0-9.\\-]+)':\\s*'([a-z]+)'/", $m[1], $pairs, PREG_SET_ORDER);
        $spa = array_column($pairs, 2, 1);

        $this->assertNotEmpty($spa, 'STORE_HOSTS ცარიელად წაიკითხა');
        $this->assertSame(
            (new \ReflectionClassConstant(Game::class, 'STORE_HOSTS'))->getValue(),
            $spa,
        );
    }

    /**
     * ⚠️ **იმპორტის წყაროების სარკე SPA-ში** (Tasks §31).
     *
     * თითო წყაროს ბარათს თავისი ფერი, ხატულა და „როგორ მივიღო ფაილი" აქვს —
     * ეს SPA-ის ცოდნაა (`SOURCE_STYLE` `satisfies`-ით და `transfer.how.*`).
     * backend-ის ახალი წყარო სარკეში რომ არ ჩაიწეროს, ბარათი ნეიტრალურად
     * დაიხატებოდა და ინსტრუქცია უბრალოდ არ გამოჩნდებოდა — ჩუმად.
     */
    public function test_the_spa_import_source_list_mirrors_the_backend(): void
    {
        $this->assertSame(ImportSource::keys(), $this->tsConstList('api/import.ts', 'IMPORT_SOURCES'));
    }

    /**
     * Tasks §34 — **ატვირთვის სახეობები SPA-ში სერვერის რიგითაა.** სახეობის
     * სახელი, „სად გამოიყენება" და ოჯახი i18n-ში `uploads.kind.*` /
     * `uploads.where.*` / `uploads.family.*`-ია; ახალი სახეობა (ან ოჯახი)
     * სარკის გარეშე ნედლ გასაღებს დახატავდა, ამიტომ ორივე ლოკალიც მოწმდება.
     */
    public function test_the_spa_upload_kinds_mirror_the_backend(): void
    {
        $this->assertSame(array_keys(UploadLimits::KINDS), $this->tsConstList('api/account.ts', 'UPLOAD_KINDS'));

        foreach (['ka', 'en'] as $locale) {
            $uploads = json_decode((string) file_get_contents(base_path("../frontend/src/i18n/{$locale}.json")), true)['uploads'] ?? [];

            foreach (array_keys(UploadLimits::KINDS) as $kind) {
                $this->assertArrayHasKey($kind, $uploads['kind'] ?? [], "{$locale}: uploads.kind.{$kind}");
                $this->assertArrayHasKey($kind, $uploads['where'] ?? [], "{$locale}: uploads.where.{$kind}");
            }

            foreach (array_keys(UploadLimits::CATALOG) as $family) {
                $this->assertArrayHasKey($family, $uploads['family'] ?? [], "{$locale}: uploads.family.{$family}");
            }
        }
    }

    /**
     * SPA-ის `export const X = [...] as const` სიის წაკითხვა წყაროდან.
     *
     * @return list<string>
     */
    private function tsConstList(string $file, string $const): array
    {
        $source = (string) file_get_contents(base_path('../frontend/src/'.$file));

        $this->assertSame(1, preg_match('/export const '.$const.' = \[(.*?)\] as const/s', $source, $m), "{$const} ვერ მოიძებნა");
        // კომენტარები ამოვიღოთ — მათში ბრჭყალებიანი სიტყვები ცრუ გასაღებად წაიკითხებოდა
        $body = preg_replace(['#/\*.*?\*/#s', '#//[^\n]*#'], '', $m[1]);
        preg_match_all("/'([a-z_]+)'/", $body, $keys);

        // ⚠️ ყალბი სიმწვანის წინააღმდეგ: ცარიელი ამონაკითხი „ორივე ცარიელია"-ს ჰგავს
        $this->assertNotEmpty($keys[1], "{$const} ცარიელად წაიკითხა");

        return $keys[1];
    }

    /**
     * ⚠️ **დეშბორდის მთვლელი ყოველ ჩანაწერიან მოდულს უნდა ჰქონდეს.**
     *
     * `DashboardController::COUNTERS`-ის გამორჩენა **ჩუმია**: ბარათი ჩვეულებრივ
     * იხატება, უბრალოდ რიცხვის ნაცვლად `null` მოდის. ზუსტად ასე გამოგვეპარა
     * `note` (§13-იდან 2026-09-07-მდე) და `bookmark`-იც იმავე გზას გაჰყვებოდა.
     *
     * წყაროდ `TARGET_MODES` ვიღებთ, რადგან სწორედ ის ნიშნავს „ამ მოდულს
     * თავისი ცხრილი აქვს".
     *
     * ⚠️ **`gallery` აქედან გამორიცხული იყო და სწორედ ეს იყო ხარვეზი**
     * (ნანახი 2026-09-14: ბარათი `—`-ს აჩვენებდა ფოტოებით სავსე გალერეაზე).
     * დაშვება — „გალერეას საკუთარი ჩანაწერი არ აქვს" — მცდარია: `gallery_images`
     * **მისი** ცხრილია, უბრალოდ პოლიმორფული. ე.ი. სია ახლა სრულია და
     * გამონაკლისი აღარ არსებობს.
     */
    public function test_every_record_module_has_a_dashboard_counter(): void
    {
        $counters = array_keys((new \ReflectionClass(DashboardController::class))
            ->getConstant('COUNTERS'));

        // ⚠️ ჯერ თვითონ წამკითხველი — კონსტანტის გადარქმევაზე სია ცარიელი
        // გამოვიდოდა და ტესტი **ცრუდ ჩავარდებოდა/გაივლიდა** (იგივე წესი, რაც ზემოთ)
        $this->assertContains('movie', $counters, '`COUNTERS`-ის წაკითხვა გატყდა');

        $expected = array_keys(PurgeService::TARGET_MODES);

        $missing = array_values(array_diff($expected, $counters));

        $this->assertSame([], $missing, implode(PHP_EOL, [
            'მოდულს ჩანაწერები აქვს, `DashboardController::COUNTERS`-ში კი არ წერია.',
            'შედეგი: დეშბორდის ბარათი რიცხვის გარეშე იხატება (`count: null`) — შეცდომა ჩუმია.',
            'გამორჩენილი: '.implode(', ', $missing),
        ]));
    }

    /**
     * ⚠️ **ყოველი ჩანაწერიანი მოდული ან ექსპორტში უნდა იყოს, ან `NOT_EXPORTED`-ში**
     * (FEAT-06).
     *
     * გამორჩენა ისეთივე **ჩუმია**, როგორც დეშბორდის მთვლელისა: ახალი მოდული
     * ჩვეულებრივ მუშაობს, უბრალოდ „ჩემი მონაცემების" სიაში არასდროს ჩნდება —
     * ე.ი. მომხმარებელი მაშინ გაიგებს, როცა თავისი ბიბლიოთეკის წაღებას
     * მოინდომებს. მესამე მდგომარეობა („არც აქ, არც იქ") სწორედ ის არის,
     * რასაც ეს ტესტი კრძალავს; შეგნებული გამორიცხვა მიზეზთან ერთად იწერება.
     */
    public function test_every_record_module_is_exportable_or_explicitly_excluded(): void
    {
        $covered = [...ExportDomain::keys(), ...array_keys(ExportDomain::NOT_EXPORTED)];

        // ⚠️ ჯერ თვითონ წამკითხველი — რუკის გადარქმევაზე ტესტი ცრუდ გაივლიდა
        $this->assertContains('movie', $covered, '`ExportDomain::MODULES` ცარიელია ან გადაერქვა');

        $missing = array_values(array_diff(array_keys(PurgeService::TARGET_MODES), $covered));

        $this->assertSame([], $missing, implode(PHP_EOL, [
            'მოდულს ჩანაწერები აქვს, `ExportDomain`-ში კი არც `MODULES`-შია და არც `NOT_EXPORTED`-ში.',
            'შედეგი: „ჩემი მონაცემები" ამ მოდულს უხმოდ ტოვებს — შეცდომა ჩუმია.',
            'გამორჩენილი: '.implode(', ', $missing),
        ]));
    }

    /**
     * ⚠️ **ყოველ ჩანაწერიან მოდულს კალათა უნდა ჰქონდეს** (FEAT-11).
     *
     * გამორჩენა აქაც **ჩუმია და უფრო ძვირი**: მოდული ჩვეულებრივ იმუშავებს,
     * უბრალოდ მისი წაშლა ისევ მყისიერი და შეუქცევადი იქნება — და ამას
     * მომხმარებელი მხოლოდ მაშინ გაიგებს, როცა უკან დაბრუნებას მოინდომებს
     * და კალათაში ვერაფერს იპოვის.
     *
     * ⚠️ **`gallery` ერთადერთი გამონაკლისია და მიზეზით**: მისი შიგთავსი
     * **ფაილებია** და არა ჩანაწერები (`ExportDomain`-ის იგივე გამიჯვნა),
     * ე.ი. მას `user_id`-იანი „მთავარი ცხრილი" საერთოდ არ აქვს.
     */
    public function test_every_record_module_has_a_trash(): void
    {
        $covered = TrashDomain::domains();

        // ⚠️ ჯერ თვითონ წამკითხველი — რუკის გადარქმევაზე ტესტი ცრუდ გაივლიდა
        $this->assertContains('movie', $covered, '`TrashDomain::MODELS` ცარიელია ან გადაერქვა');

        $expected = array_values(array_diff(array_keys(PurgeService::TARGET_MODES), ['gallery']));
        $missing = array_values(array_diff($expected, $covered));

        $this->assertSame([], $missing, implode(PHP_EOL, [
            'მოდულს ჩანაწერები აქვს, `TrashDomain::MODELS`-ში კი არ არის.',
            'შედეგი: წაშლა ამ მოდულზე ისევ შეუქცევადია — შეცდომა ჩუმია.',
            'გამორჩენილი: '.implode(', ', $missing),
        ]));
    }

    /**
     * **მომხმარებლის ცხრილები, რომლებიც ურნაში (ჯერ) არ მიდის — მიზეზით**
     * (Tasks §29.3).
     *
     * ⚠️ „ეტაპი N" ჩანაწერები **დროებითია** — §29.10-ის ეტაპები მათ სათითაოდ
     * ამოიღებენ აქედან. დანარჩენი ტექნიკური ოპერაციაა (29.9) ან სხვა
     * მექანიზმით იფარება.
     */
    private const NOT_TRASHED = [
        // ფაილი `trashed_files`-ში მიდის (`field_file`); ტექსტური მნიშვნელობის „წაშლა" ჩანაწერის რედაქტირებაა
        'movie_field_values' => 'ფაილი `trashed_files`-შია; ტექსტი ჩანაწერის რედაქტირებაა',
        'series_field_values' => 'ფაილი `trashed_files`-შია; ტექსტი ჩანაწერის რედაქტირებაა',
        'anime_field_values' => 'ფაილი `trashed_files`-შია; ტექსტი ჩანაწერის რედაქტირებაა',
        'video_field_values' => 'ფაილი `trashed_files`-შია; ტექსტი ჩანაწერის რედაქტირებაა',
        'song_field_values' => 'ფაილი `trashed_files`-შია; ტექსტი ჩანაწერის რედაქტირებაა',
        'book_field_values' => 'ფაილი `trashed_files`-შია; ტექსტი ჩანაწერის რედაქტირებაა',
        'board_game_field_values' => 'ფაილი `trashed_files`-შია; ტექსტი ჩანაწერის რედაქტირებაა',
        'game_field_values' => 'ფაილი `trashed_files`-შია; ტექსტი ჩანაწერის რედაქტირებაა',
        'note_field_values' => 'ფაილი `trashed_files`-შია; ტექსტი ჩანაწერის რედაქტირებაა',
        'bookmark_field_values' => 'ფაილი `trashed_files`-შია; ტექსტი ჩანაწერის რედაქტირებაა',
        'course_field_values' => 'ფაილი `trashed_files`-შია; ტექსტი ჩანაწერის რედაქტირებაა',
        'place_field_values' => 'ფაილი `trashed_files`-შია; ტექსტი ჩანაწერის რედაქტირებაა',
        // Tasks §37 — ყველა პირადი მოდულის ველების საერთო ცხრილი; იგივე წესი
        'custom_record_field_values' => 'ფაილი `trashed_files`-შია; ტექსტი ჩანაწერის რედაქტირებაა',

        // §29.10 ეტაპი 5 — წერილი არასდროს იშლება (§4.6); ურნა მის წაშლას `trashed_messages`-ით აჩვენებს
        'messages' => 'წერილი ბაზაში რჩება (§4.6) — მისი წაშლა ურნაში `trashed_messages`-ითაა, მიმაგრება `trashed_files`-ით',

        // §29.8 — გასუფთავება ურნაში ერთ ელემენტად მიდის (`AuditLogTrash`)
        'audit_logs' => 'გასუფთავება ურნაში ერთ ელემენტადაა (`trash_entries` · `audit_log`, რიგებს `trash_entry_id` აბამს)',

        // 29.9 — ტექნიკური ოპერაცია და არა შიგთავსის წაშლა
        'user_credentials' => 'API-გასაღები ხშირად იმიტომ იშლება, რომ გაჟონა — 30 დღით შენახვა ამას გააბათილებდა',
        // Tasks §40 — ბმული გასაღებია და არა შიგთავსი; გაუქმება (`revoked_at`) მისი შექცევადი მდგომარეობაა
        'share_links' => 'ბმული გასაღებია და არა შიგთავსი — წაშლილის აღდგენა წვდომას ხელახლა გახსნიდა, რისი შეწყვეტაც წაშლის აზრია; შექცევადი ნაბიჯი გაუქმებაა',
        // Tasks §31.3 — „აღარ განაახლო" მსახიობზე: პარამეტრია და არა შიგთავსი, მოხსნა თვითონ შექცევადია
        'cast_member_sync_prefs' => 'გადამრთველია და არა შიგთავსი — მოხსნა თვითონ შექცევადი ნაბიჯია',
        // Tasks §10 — ჟურნალი ჩანაწერს ეკუთვნის და მასთან ერთად ქრება (`HasVisits::deleting`); `user_id` აქ მნახველია და არა მფლობელი
        'record_visits' => 'შესვლების ჟურნალი — ჩანაწერთან ერთად ქრება (`HasVisits`), ცალკე წასაშლელი არაფერია',
        // Tasks §40.8 — „ვინ დაიმატა ბმულიდან“ (ბმულის სტატისტიკა); ბმულთან ერთად იშლება
        'share_link_imports' => 'ბმულის სტატისტიკა (ვინ, რამდენი, როდის) — შიგთავსი არაა და ბმულთან ერთად ქრება',
        'approval_requests' => 'გაუქმებული მოთხოვნა ტექნიკური ოპერაციაა',
        'sessions' => 'სესია — არა შიგთავსი',
        'module_user' => 'მოდულზე წვდომა — პარამეტრი და არა შიგთავსი',
        'conversation_user' => 'საუბრის მონაწილეობა — სტრუქტურა',
        'conversation_nicknames' => 'საუბრის პარამეტრი',
        'message_hides' => '„ჩემთვის დამალვა" თვითონ რიგია — ურნა მას `trashed_messages`-ით აჩვენებს (ეტაპი 5)',
        'message_reactions' => 'რეაქცია გადართვაა (ხელახლა დაჭერა ხსნის)',
        'user_blocks' => 'პარამეტრი — ბლოკის მოხსნა ცალკე მოქმედებაა',
        'cast_member_tags' => 'ძებნის ტეგები — ველის რედაქტირება',
        'episode_watches' => 'ეპიზოდის მონიშვნა გადართვაა, არა წაშლა',
        'note_notifications' => 'მიწოდების ჟურნალი — მანქანა წერს',
        'serp_searches' => 'ძებნის მრიცხველი',
        'translation_usages' => 'თარგმანის მრიცხველი',
        'batch_items' => 'რიგის ტექნიკური ჩანაწერი',
        // §4.5 — თემები წაიშალა; ცხრილი მხოლოდ MySQL-ზე ჩამოიშალა, sqlite-ზე მკვდარი რჩება
        'gallery_themes' => 'მკვდარი ცხრილი (sqlite) — ფუნქცია §4.5-ით წაიშალა',
    ];

    /**
     * ⚠️ **მომხმარებლის ყოველი ცხრილი ან ურნაშია, ან გამონაკლისია — მიზეზით**
     * (Tasks §29.3).
     *
     * სიას **სქემა** იძლევა (`user_id`-იანი ცხრილები) და არა ხელით დაწერილი
     * ჩამონათვალი — ხვალინდელი მოდულის ცხრილი ტესტს თავისით აწითლებს, თორემ
     * მისი წაშლა ჩუმად „სამუდამოდ" დარჩებოდა. და პირიქით: გამონაკლისების
     * სიაში მკვდარი ჩანაწერი (წაშლილი ან უკვე ურნაში გადასული ცხრილი) იგივე
     * წითელია — სია ტყუილს ვერ დააგროვებს.
     */
    public function test_every_user_table_has_a_trash_or_a_reason(): void
    {
        $withUser = collect(Schema::getTables())
            ->pluck('name')
            ->unique()
            ->filter(fn (string $table) => Schema::hasColumn($table, 'user_id'))
            ->values()
            ->all();

        // ⚠️ ჯერ თვითონ წამკითხველი — ცარიელ სიაზე ტესტი უაზროდ გაივლიდა
        $this->assertContains('movies', $withUser);
        $this->assertContains('gallery_images', $withUser);

        $covered = [...TrashDomain::tables(), ...TrashDomain::itemTables(), 'trashed_files', 'trash_entries', 'trashed_messages'];

        $missing = array_values(array_diff($withUser, $covered, array_keys(self::NOT_TRASHED)));
        $this->assertSame([], $missing, implode(PHP_EOL, [
            'ცხრილს `user_id` აქვს, მაგრამ არც `TrashDomain`-შია და არც `NOT_TRASHED`-ში.',
            'შედეგი: მისი წაშლა ჩუმად „სამუდამოდ" დარჩება (Tasks §29.3).',
            'გამორჩენილი: '.implode(', ', $missing),
        ]));

        $stale = array_values(array_diff(array_keys(self::NOT_TRASHED), $withUser));
        $this->assertSame([], $stale, 'გამონაკლისი, რომელიც აღარ არსებობს: '.implode(', ', $stale));

        $both = array_values(array_intersect($covered, array_keys(self::NOT_TRASHED)));
        $this->assertSame([], $both, 'ურნაშიც არის და გამონაკლისიც: '.implode(', ', $both));
    }

    /**
     * ⚠️ **ექსპორტის ყველა ველი მართლა უნდა იკითხებოდეს.**
     *
     * სია სახელების უბრალო ჩამონათვალია, ე.ი. ბეჭდვითი შეცდომა (`titel_ka`)
     * ან წაშლილი სვეტი **გამონაკლისს არ ისვრის** — Eloquent `null`-ს
     * აბრუნებს, ფაილში კი ჩუმად ცარიელი სვეტი ჩნდება. ყველა მოდულზე ერთი
     * ცარიელი ჩანაწერის გატარება ზუსტად ამას იჭერს.
     */
    public function test_every_export_field_resolves_on_a_real_record(): void
    {
        $user = User::create([
            'name' => 'expo', 'username' => 'expo',
            'email' => 'expo@example.com', 'password' => 'password',
        ]);

        $exporter = app(RecordExporter::class);

        /* მხოლოდ `NOT NULL` სვეტები — ტესტს ჩანაწერის აზრი არ სჭირდება,
           სჭირდება ის, რომ ჩანაწერი **შეიქმნას** და ველები წაიკითხოს. */
        $minimal = [
            'video' => ['title' => 'v', 'url' => 'https://example.com/v'],
            'song' => ['title' => 's', 'url' => 'https://example.com/s'],
            'book' => ['title_en' => 'b'],
            'board_game' => ['title' => 'bg'],
            'game' => ['title_en' => 'g'],
            'note' => ['title' => 'n'],
            'bookmark' => ['title' => 'bm', 'url' => 'https://example.com/b', 'domain' => 'example.com'],
            'course' => ['title' => 'c'],
            'place' => ['name' => 'p'],
        ];

        foreach (ExportDomain::keys() as $module) {
            $model = ExportDomain::model($module);
            $model::withoutGlobalScope('owner')
                ->create(['user_id' => $user->id] + ($minimal[$module] ?? []));

            $rows = iterator_to_array($exporter->rows($user, $module));

            $this->assertCount(1, $rows, "{$module}: ჩანაწერი არ წაიკითხა");

            /* ⚠️ **სახელის შემოწმება ცალკე ნაბიჯია და აუცილებელი.**
               რიგის გასაღები თვითონ ველის სახელია, ე.ი. ბეჭდვითი შეცდომა
               (`titel_ka`) ზემოთა `assertCount`-ს გაუვიდოდა და ფაილში
               ჩუმად ცარიელი სვეტი დარჩებოდა. ამიტომ თითოეული სახელი ან
               სვეტი უნდა იყოს, ან აქსესორი, ან ცხადად ვირტუალური. */
            $columns = Schema::getColumnListing((new $model)->getTable());

            foreach (ExportDomain::fields($module) as $field) {
                $real = in_array($field, $columns, true)
                    || in_array($field, RecordExporter::VIRTUAL, true)
                    || method_exists($model, 'get'.str_replace('_', '', ucwords($field, '_')).'Attribute');

                $this->assertTrue($real, "{$module}.{$field}: არც სვეტია, არც აქსესორი, არც ვირტუალური");
            }
        }
    }

    /**
     * ⚠️ **ყოველი მოდული აუდიტ-ლოგში უნდა იწერებოდეს (Tasks §4)** —
     * მოთხოვნა სიტყვასიტყვით „ყველგან, აბსოლუტურად ყველა მოდულში".
     *
     * გამორჩენა **ჩუმია**: მოდული ჩვეულებრივ მუშაობს, უბრალოდ მისი
     * ცვლილებები ლოგში არასდროს ჩნდება — ე.ი. სწორედ მაშინ აღმოაჩენ,
     * როცა ლოგს ეძებ. `AuditRegistry::MODELS`-ის ერთი რიგი ხსნის.
     */
    public function test_every_module_is_covered_by_the_audit_registry(): void
    {
        $covered = array_values(array_unique(AuditRegistry::MODELS));

        // ⚠️ ჯერ თვითონ წამკითხველი — რუკის დაცარიელებაზე ტესტი ცრუდ გაივლიდა
        $this->assertContains('movie', $covered, '`AuditRegistry::MODELS` ცარიელია ან გადაერქვა');

        $missing = array_values(array_diff(Module::pluck('key')->all(), $covered));

        $this->assertSame([], $missing, implode(PHP_EOL, [
            'მოდულს `AuditRegistry::MODELS`-ში არცერთი მოდელი არ შეესაბამება.',
            'შედეგი: ამ მოდულის დამატება/რედაქტირება/წაშლა ლოგში არ ჩანს — შეცდომა ჩუმია.',
            'გამორჩენილი: '.implode(', ', $missing),
        ]));
    }

    /** მორგებული ველების ცხრილი ყოველ დარეგისტრირებულ მოდულს უნდა ჰქონდეს */
    public function test_custom_field_tables_exist_for_every_supported_module(): void
    {
        foreach (CustomFields::modules() as $module) {
            $table = CustomFields::table($module);

            $this->assertTrue(Schema::hasTable($table), "ცხრილი `{$table}` არ არსებობს");
            // ფაზა 4b — ფაილის სვეტების გარეშე `ფაილი` ტიპი ჩუმად ჩავარდებოდა
            foreach (['value_path', 'value_name', 'value_mime', 'value_size'] as $column) {
                $this->assertTrue(
                    Schema::hasColumn($table, $column),
                    "`{$table}.{$column}` აკლია (§6 ფაზა 4b)"
                );
            }

            $this->assertNotNull(CustomFields::model($module), "მოდელი არ არის: {$module}");
            $this->assertSame($module, CustomFields::moduleOf(CustomFields::model($module)));
        }
    }

    /**
     * ⚠️ **მორგებული ველის საქაღალდე მოდულის თავის ფესვში უნდა იყოს.**
     * სხვაგვარად §17.2-ის ლიმიტი სხვა მოდულს დაეთვლებოდა, ხოლო `note`
     * პრივატული დისკიდან public-ზე გადავიდოდა.
     */
    public function test_custom_field_folders_map_back_to_their_module(): void
    {
        foreach (CustomFields::modules() as $module) {
            $folder = StorageFolder::customFields($module);

            $this->assertSame($module, StorageFolder::moduleFor($folder),
                "საქაღალდე `{$folder}` სხვა მოდულს ეთვლება"
            );
            $this->assertContains(explode('/', $folder)[0], StorageFolder::ROOTS,
                "საქაღალდე `{$folder}` ცნობილ ფესვში არ არის — ობოლების სკანერი მას ვერ დაინახავს"
            );
        }

        // ჩანაწერების მოდული პირად დოკუმენტებს ინახავს (§17.5)
        $this->assertSame('private', StorageFolder::diskFor(StorageFolder::customFields('note')));
        $this->assertSame('public', StorageFolder::diskFor(StorageFolder::customFields('movie')));
    }

    /* ---------- დამხმარეები ---------- */

    /** `referencedPaths()`-ის რუკა `ცხრილი.სვეტი` სახით */
    private function scannerColumns(): array
    {
        $meter = app(StorageMeter::class);
        $method = new \ReflectionMethod($meter, 'referencedPaths');

        /* ⚠️ რუკა თვითონ მეთოდის შიგნითაა, ე.ი. მას წყაროდან ვკითხულობთ.
           ალტერნატივა — რუკის კონსტანტად გატანა — უფრო სუფთა იქნებოდა, მაგრამ
           მეთოდი მას ორი წყაროდან აწყობს (ხელით სია + `CustomFields::TABLES`). */
        $source = file($method->getFileName());
        $body = implode('', array_slice(
            $source,
            $method->getStartLine() - 1,
            $method->getEndLine() - $method->getStartLine() + 1,
        ));

        /* ⚠️ სია §7.1-ის შემდეგ **`ცხრილი.სვეტი`** სტრიქონებია (ერთ ცხრილს ორი
           გზის სვეტი შეიძლება ჰქონდეს), ე.ი. ძველი `'a' => 'b'` regex აღარ
           გამოდგება. ქვემოთ სამი წამყვანი სწორედ იმას იჭერს, თუ ეს კვლავ
           შეიცვალა და წაკითხვა ჩუმად დაცარიელდა. */
        preg_match_all("/'([a-z_]+)\.([a-z_]+)'/", $body, $m, PREG_SET_ORDER);

        $columns = array_map(fn (array $pair) => "{$pair[1]}.{$pair[2]}", $m);

        // `<module>_field_values.value_path` ციკლით ემატება და regex-ს არ ხვდება
        foreach (array_keys(CustomFields::TABLES) as $table) {
            $columns[] = "{$table}.value_path";
        }

        return $columns;
    }

    /** სქემის ყველა სვეტი, რომლის სახელშიც `path` გვხვდება */
    private function schemaPathColumns(): array
    {
        $found = [];

        foreach ($this->tableNames() as $table) {
            foreach (Schema::getColumnListing($table) as $column) {
                if (str_contains($column, 'path')) {
                    $found[] = "{$table}.{$column}";
                }
            }
        }

        return $found;
    }

    /** @return list<string> */
    private function tablesWithColumn(string $column): array
    {
        return array_values(array_filter(
            $this->tableNames(),
            fn (string $table) => Schema::hasColumn($table, $column),
        ));
    }

    /** @return list<string> */
    private function tableNames(): array
    {
        return array_values(array_filter(
            array_map(
                fn ($t) => is_array($t) ? ($t['name'] ?? null) : (is_object($t) ? $t->name : $t),
                Schema::getTables(),
            ),
            fn (?string $name) => $name !== null && ! str_starts_with($name, 'sqlite_'),
        ));
    }

    /**
     * **ყველა მოდული, რომელსაც სურათი აქვს, გალერეის „მოდულების" ჭრილშია (§8.3).**
     *
     * ⚠️ ეს იგივე ჩუმი ხვრელია, რაც `referencedPaths()`-ს ჰქონდა: ახალი
     * მოდულის `ModuleImages`-ში ჩაუწერლობა არაფერს ტეხს — მისი ფოტოები
     * უბრალოდ **არსად ჩანს**, და ამას მხოლოდ შემთხვევით შეამჩნევ.
     *
     * მოლოდინი **სქემიდან** მოდის: თუ მოდულის ცხრილს სურათის სვეტი აქვს
     * (`*cover_path` · `*image_path` · `*thumbnail_path` · `poster_path`) ან
     * მას `<module>_files` ცხრილი აქვს, ის ამ რუკაში უნდა იყოს.
     */
    public function test_every_module_with_images_is_in_the_gallery_module_cut(): void
    {
        /* ⚠️ `gallery` განზრახ არ არის: **ის თვითონაა გალერეა** — მისი
           ფოტოები `gallery_images`-ია და საკუთარი ჭრილები აქვს. */
        $excluded = ['gallery'];

        $covered = ModuleImages::modules();
        $missing = [];

        foreach (Module::pluck('key') as $key) {
            if (in_array($key, $excluded, true) || in_array($key, $covered, true)) {
                continue;
            }

            $table = $this->tableFor($key);

            if (! $table || ! Schema::hasTable($table)) {
                continue;
            }

            $hasCover = false;

            foreach (Schema::getColumnListing($table) as $column) {
                if (preg_match('/(cover_path|image_path|thumbnail_path|poster_path)$/', $column)) {
                    $hasCover = true;

                    break;
                }
            }

            if ($hasCover || Schema::hasTable($key.'_files') || Schema::hasTable(rtrim($table, 's').'_files')) {
                $missing[] = $key;
            }
        }

        $this->assertSame(
            [],
            $missing,
            'ამ მოდულებს სურათი აქვთ, მაგრამ ModuleImages-ში არ არიან: '.implode(', ', $missing),
        );
    }

    /** მოდულის key → მისი მთავარი ცხრილი (სახელები ყოველთვის არ ემთხვევა) */
    private function tableFor(string $key): ?string
    {
        return match ($key) {
            'movie' => 'movies',
            'series' => 'series',
            'anime' => 'animes',
            'video' => 'videos',
            'song' => 'songs',
            'book' => 'books',
            'board_game' => 'board_games',
            'game' => 'games',
            // ⚠️ ცხრილს `notes` **არ** ჰქვია (2026-09-03-ის წესი)
            'note' => 'note_entries',
            'bookmark' => 'bookmarks',
            default => null,
        };
    }

    /**
     * **ყველა `HasGallery` მოდელი `GalleryParent`-შია (§8.3).**
     *
     * ⚠️ სიის გამორჩენა ჩუმია: ვებიდან ჩამოწერილი ფოტო ბაზაში ჩაჯდებოდა,
     * მაგრამ გალერეის ჯგუფებში აღარ გამოჩნდებოდა და მშობლის სახელიც
     * `null` იქნებოდა — ზუსტად ის, რაც სიმღერას/წიგნს/თამაშს ემართებოდა.
     */
    public function test_every_gallery_parent_model_uses_the_trait(): void
    {
        foreach (GalleryParent::keys() as $key) {
            $model = GalleryParent::model($key);

            $this->assertNotNull($model, "GalleryParent::{$key} მოდელის გარეშეა");
            $this->assertContains(
                HasGallery::class,
                class_uses_recursive($model),
                "{$model} `HasGallery`-ს არ იყენებს, ე.ი. ფოტო/ვიდეო ვერ მიება",
            );
            $this->assertTrue(
                method_exists($model, 'galleryVideos'),
                "{$model}-ს `galleryVideos()` აკლია (§8.1)",
            );
        }
    }
    /* ---------- გარე ქსელი (აუდიტი 2026-09-14) ---------- */

    /**
     * **მომხმარებლის URL-ის ჩამოტვირთვა მხოლოდ `SafeHttp`-ით.**
     *
     * ⚠️ ორი ადგილია, სადაც სერვერი **მომხმარებლის ნაკარნახევ** მისამართს
     * ხსნის (ბუკმარკის მეტამონაცემი და ვებიდან ნაპოვნი ფოტო) და ორივეს
     * SSRF-ის ხვრელი ჰქონდა. მესამე ასეთი ადგილი ადვილი დასამატებელია და
     * **ჩუმად** გაუვლიდა გვერდს ყველა დაცვას — ეს ტესტი სწორედ ამას იჭერს.
     *
     * ⚠️ სია **ცხადია და მოკლეა განზრახ**: თუ ახალი ფაილი გაჩნდა, ტესტი
     * ჩავარდება და ავტორმა ან `SafeHttp`-ზე უნდა გადაიყვანოს, ან აქ
     * დაამატოს მიზეზის ახსნით.
     */
    public function test_user_supplied_urls_only_leave_through_safe_http(): void
    {
        $fetchers = [
            'app/Services/Bookmarks/LinkMetadata.php',
            'app/Services/Serp/WebImageImporter.php',
        ];

        foreach ($fetchers as $file) {
            $source = file_get_contents(base_path($file));

            $this->assertStringContainsString('SafeHttp', $source, "{$file} — SafeHttp-ს არ იყენებს");
            $this->assertStringNotContainsString(
                'Http::',
                $source,
                "{$file} — პირდაპირ Http ფასადს იძახებს, ე.ი. SSRF-ის შემოწმებას გვერდს უვლის",
            );
        }
    }

    /**
     * **CA bundle ორ ადგილას წყდება და არა თოთხმეტში.**
     *
     * ⚠️ Windows-ის cURL-ს სერტიფიკატების სია არ აქვს (პროექტის ცნობილი
     * წესი), ე.ი. ერთი დავიწყებული `verify` ახალ კლიენტს **ჩუმად**
     * ჩააგდებდა — ზუსტად ის, რის გამოც `SourceLog::request()` გაჩნდა.
     */
    public function test_the_ca_bundle_is_configured_in_one_place(): void
    {
        $allowed = ['app/Support/SourceLog.php', 'app/Support/SafeHttp.php'];

        $offenders = [];

        foreach ($this->phpFiles(app_path()) as $file) {
            $relative = str_replace(base_path().DIRECTORY_SEPARATOR, '', $file);
            $relative = str_replace(DIRECTORY_SEPARATOR, '/', $relative);

            if (in_array($relative, $allowed, true)) {
                continue;
            }

            if (str_contains((string) file_get_contents($file), 'cacert.pem')) {
                $offenders[] = $relative;
            }
        }

        $this->assertSame([], $offenders, 'CA bundle ხელით წერია — გამოიყენე SourceLog::request()');
    }

    /**
     * **Tasks §30.8 — წყაროს გასაღები `.env`-იდან აღარ იკითხება, არსად.**
     *
     * ⚠️ წესი სამ ადგილას შეიძლება ჩუმად დაბრუნდეს და სამივე მოწმდება:
     * `config/services.php` (ხელახლა ჩაწერილი `env('TMDB_API_KEY')`),
     * აპის კოდი (`config('services.tmdb.key')` `CredentialStore`-ის გვერდის
     * ავლით) და `.env.example` (ცარიელი ხაზი ადამიანს შევსებისკენ უბიძგებს —
     * აპი კი ჩაწერილს ვეღარ წაიკითხავს და „ხომ ჩავწერე" ტყუილი იქნება).
     */
    public function test_source_keys_are_never_read_from_env(): void
    {
        $services = (string) file_get_contents(config_path('services.php'));
        $example = (string) file_get_contents(base_path('.env.example'));

        foreach (array_keys(CredentialProviders::LEGACY_ENV) as $name) {
            $this->assertStringNotContainsString("env('{$name}'", $services, "{$name} ისევ `config/services.php`-შია");
            $this->assertDoesNotMatchRegularExpression('/^\s*'.$name.'\s*=/m', $example, "{$name} ისევ `.env.example`-შია");
        }

        $providers = array_diff(CredentialProviders::keys(), [CredentialProviders::TELEGRAM]);

        foreach ($providers as $provider) {
            $this->assertNull(config("services.{$provider}"), "`services.{$provider}` ისევ კონფიგშია");
        }

        $pattern = '/config\(\s*[\'"]services\.('.implode('|', $providers).')\b/';
        $offenders = [];

        foreach ($this->phpFiles(app_path()) as $file) {
            if (preg_match($pattern, (string) file_get_contents($file))) {
                $offenders[] = str_replace(DIRECTORY_SEPARATOR, '/', str_replace(base_path().DIRECTORY_SEPARATOR, '', $file));
            }
        }

        $this->assertSame([], $offenders, 'გასაღები `config()`-იდან იკითხება — გამოიყენე CredentialStore');
    }

    /** SPA-ის წყაროების სია (`lib/credentials.ts`) backend-ის რეესტრს ემთხვევა — რიგითაც */
    public function test_the_spa_credential_providers_mirror_the_backend(): void
    {
        $spa = $this->tsConstList('lib/credentials.ts', 'CREDENTIAL_PROVIDERS');

        $this->assertEqualsCanonicalizing(CredentialProviders::keys(), $spa);
    }

    /**
     * **ყოველი ნაგულისხმევი ხატულა ჩანქის ჩამოტვირთვის გარეშე უნდა დაიხატოს (Tasks §1.2).**
     *
     * ⚠️ ეს ცოცხალი ხარვეზი იყო და **სრულიად ჩუმი**: `ModuleIcon`-ის რუკაში
     * 21 სახელი ეწერა, უცნობი კი `LayoutGrid`-ად იხატებოდა. შედეგად `note`
     * მოდულს, ვიდეოს „ჩამოწერილებს", „რჩეულს" და მედია-დომენების ოთხი
     * სტატუსიდან სამს (`undecided` · `watching` · `watched`) **ერთი და
     * იგივე ნაცრისფერი ბადე** ჰქონდათ. ვერც `tsc` ხედავდა, ვერც lint,
     * ვერც ტესტი — სახელი ხომ უბრალოდ `string`-ია.
     *
     * ახლა უცნობი სახელი ზარმაცად იხსნება, ე.ი. „არასწორი სურათი" აღარაა —
     * მაგრამ **კოდში ჩაწერილი** ნაგულისხმევი მაინც სტატიკურ რუკაში უნდა
     * იყოს: საიდბარის რიგს ცალკე ჩანქის მოტანა არ უნდა სჭირდებოდეს.
     */
    public function test_every_default_icon_is_drawn_without_a_lazy_fetch(): void
    {
        $path = base_path('../frontend/src/components/ModuleIcon.tsx');

        if (! is_file($path)) {
            $this->markTestSkipped('ფრონტი ამ გარემოში არ არის');
        }

        $known = $this->staticIconNames((string) file_get_contents($path));

        // ⚠️ ანკერები — გატეხილმა პარსერმა ცარიელი სია არ უნდა „ჩააბაროს"
        $this->assertGreaterThan(60, count($known), 'ModuleIcon-ის ჯგუფები ვერ წავიკითხე');
        $this->assertContains('Film', $known);
        $this->assertContains('LayoutGrid', $known);

        $used = Module::whereNotNull('icon')->pluck('icon')->all();

        foreach (StatusDomain::keys() as $domain) {
            $used = array_merge($used, array_column(StatusDomain::defaults($domain), 'icon'));
        }

        /* ლექსიკონების საწყისი ნაკრებები — ჟანრებს ხატულა არ აქვთ, ამიტომ
           `array_column` მათზე უბრალოდ ცარიელს აბრუნებს */
        foreach ([VideoType::class, NoteCategory::class, BookmarkCategory::class] as $model) {
            $used = array_merge($used, array_column($model::DEFAULTS, 'icon'));
        }

        /* ფსევდო-განყოფილებები („ყველა" · „რჩეული" · „ჩამოწერილები") მხოლოდ
           ფრონტზე იწერება, მაგრამ იმავე რუკას გადის */
        $sections = base_path('../frontend/src/lib/statusSections.ts');
        preg_match_all("/icon: '([A-Za-z0-9]+)'/", (string) file_get_contents($sections), $m);
        $this->assertNotEmpty($m[1], 'PSEUDO_SECTIONS-ის ხატულები ვერ წავიკითხე');
        $used = array_merge($used, $m[1]);

        $missing = array_values(array_unique(array_diff(array_filter($used), $known)));
        sort($missing);

        $this->assertSame([], $missing,
            'ხატულა `ModuleIcon`-ის სტატიკურ რუკაში არ წერია: '.implode(', ', $missing)
        );
    }

    /**
     * `ModuleIcon.tsx`-ის `GROUPS`-იდან ხატულების სახელები.
     *
     * ⚠️ წყაროდან იკითხება და არა ხელით ნაწერი სიიდან — ხელით სია ზუსტად
     * იმ დღეს დაშორდებოდა, როცა ვინმე ხატულას დაამატებდა.
     *
     * @return list<string>
     */
    private function staticIconNames(string $source): array
    {
        preg_match_all('/icons:\s*\{([^}]*)\}/', $source, $groups);

        $names = [];

        foreach ($groups[1] as $body) {
            foreach (explode(',', $body) as $name) {
                $name = trim($name);

                if ($name !== '') {
                    $names[] = $name;
                }
            }
        }

        return array_values(array_unique($names));
    }

    /**
     * **ყოველი მოდელი ან ლოგირდება, ან ცხადად არ ლოგირდება** (Tasks DEBT-11).
     *
     * ⚠️ აქამდე `UserCredential` და `DatabaseBackup` რუკაში უბრალოდ **არ
     * იყვნენ** და არსად ეწერა რატომ — მაშინ, როცა ორივე ცხადად ლოგირდება
     * თავისი კონტროლერიდან. ე.ი. მკითხველისთვის „გამორჩა" და „გადაწყვეტილებაა"
     * ერთნაირად გამოიყურებოდა, და ამ კონტროლერებში დამატებული მომდევნო
     * ჩამწერი გზა **უხმოდ** დარჩებოდა დაულოგავი.
     *
     * ⚠️ ტესტი კლასებს **დისკიდან** კითხულობს და არა სიიდან: ხვალინდელი
     * მოდელი ავტომატურად მოხვდება შემოწმებაში და მისი გამოტოვება ცხად
     * არჩევანად იქცევა.
     */
    public function test_every_model_is_either_logged_or_excluded_on_purpose(): void
    {
        $models = [];

        foreach (glob(app_path('Models/*.php')) as $file) {
            $class = 'App\\Models\\'.basename($file, '.php');

            if (class_exists($class) && is_subclass_of($class, Model::class)) {
                $models[] = $class;
            }
        }

        // ⚠️ ჯერ თვითონ სკანერი — ცარიელ სიაზე ტესტი ცრუდ გაივლიდა
        $this->assertContains(Movie::class, $models, 'მოდელების სკანერი გაფუჭდა');

        $known = array_merge(array_keys(AuditRegistry::MODELS), array_keys(AuditRegistry::NOT_LOGGED));
        $missing = array_values(array_diff($models, $known));

        $this->assertSame([], $missing, implode(PHP_EOL, [
            'მოდელი არც `AuditRegistry::MODELS`-შია და არც `NOT_LOGGED`-ში.',
            'შედეგი: მისი ცვლილებები ლოგში არ ჩანს და არსად ეწერება, რომ ეს განზრახია.',
            'გამორჩენილი: '.implode(', ', $missing),
        ]));

        // ერთი მოდელი ორივე სიაში ვერ იქნება — ორი ურთიერთგამომრიცხავი განზრახვაა
        $both = array_intersect(array_keys(AuditRegistry::MODELS), array_keys(AuditRegistry::NOT_LOGGED));
        $this->assertSame([], array_values($both), 'მოდელი ერთდროულად ლოგირდება და არ ლოგირდება');

        // ყოველ გამონაკლისს მიზეზი უნდა ჰქონდეს — სიაში ჩაწერა ახსნის გარეშე იგივე დავიწყებაა
        foreach (AuditRegistry::NOT_LOGGED as $class => $reason) {
            $this->assertNotSame('', trim($reason), "{$class}: გამონაკლისს მიზეზი არ უწერია");
        }
    }

    /**
     * **ყოველი მოდულის ჩანაწერი morph-რუკაშია** (Tasks §6.1).
     *
     * ⚠️ `enforceMorphMap()` რუკის გარეთ მდგომ მოდელზე `getMorphClass()`-ს
     * **გამონაკლისით** აწყვეტს — და `ColumnTrash::capture()` სწორედ მას იძახებს
     * ატვირთული ფოტოს შეცვლა/წაშლისას. `course` ასე აკლდა: კურსის ესკიზის
     * შეცვლა 500-ს აბრუნებდა და არც ერთი ტესტი არ ხედავდა. ახალი მოდული
     * (`TrashDomain::MODELS`-ში შესული) ამ ტესტს რუკის გარეშე ვერ გაივლის.
     */
    public function test_every_record_model_has_a_morph_alias(): void
    {
        $mapped = array_values(Relation::morphMap());
        $this->assertContains(Movie::class, $mapped, 'morph-რუკა ცარიელია');

        $missing = [];

        foreach (TrashDomain::MODELS as $class) {
            if (! in_array($class, $mapped, true)) {
                $missing[] = $class;
            }
        }

        $this->assertSame([], $missing, implode(PHP_EOL, [
            'მოდელი `TrashDomain::MODELS`-შია, morph-რუკაში კი არა (`AppServiceProvider::boot()`).',
            'შედეგი: `getMorphClass()` — მაგ. ფოტოს შეცვლისას `ColumnTrash`-ში — გამონაკლისს ისვრის.',
            'გამორჩენილი: '.implode(', ', $missing),
        ]));
    }

    /** @return list<string> */
    private function phpFiles(string $dir): array
    {
        $out = [];

        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir)) as $file) {
            if ($file->isFile() && $file->getExtension() === 'php') {
                $out[] = $file->getPathname();
            }
        }

        return $out;
    }

    /**
     * **ყოველ ლოგირებულ მოდელს სუბიექტის ლეიბლი აქვს ორივე ენაზე**
     * (Tasks GAP-13).
     *
     * ⚠️ `AuditPage`-ის გასაღები **დინამიურია** (`audit.subjects.<type>`),
     * ე.ი. i18n-ის აუდიტი მას ვერ ხედავს, `tsc`-საც და lint-საც ის უბრალოდ
     * სტრიქონია — გამორჩენილი ლეიბლი ჩუმად ნედლ `snake_case`-ად იხატებოდა
     * ქართულ ინტერფეისში (რვა ასეთი დაგროვდა: `anime`, `gallery_video`,
     * `status`…). ეს კავშირი მხოლოდ აქ, რეპოს ორ ნახევარს შორის, მოწმდება.
     *
     * ⚠️ **პირიქითაც**: ლეიბლი, რომელსაც მოდელი აღარ შეესაბამება, მკვდარია
     * (`gallery_theme` §4.5-ში წაშლილი ფუნქციიდან იყო).
     */
    public function test_every_logged_model_has_a_subject_label(): void
    {
        $types = [];

        foreach (array_keys(AuditRegistry::MODELS) as $class) {
            $types[] = AuditRegistry::typeFor(new $class);
        }

        $types = array_values(array_unique($types));
        $this->assertGreaterThan(40, count($types), 'AuditRegistry::MODELS ვერ წავიკითხე');

        foreach (['ka', 'en'] as $locale) {
            $path = base_path("../frontend/src/i18n/{$locale}.json");

            if (! is_file($path)) {
                $this->markTestSkipped('ფრონტი ამ გარემოში არ არის');
            }

            $labels = json_decode((string) file_get_contents($path), true)['audit']['subjects'] ?? [];
            $this->assertNotEmpty($labels, "{$locale}: audit.subjects ვერ წავიკითხე");

            $this->assertSame(
                [],
                array_values(array_diff($types, array_keys($labels))),
                "{$locale}: ლოგირებულ მოდელს ლეიბლი აკლია — ლოგში `snake_case` გამოჩნდება",
            );

            $this->assertSame(
                [],
                array_values(array_diff(array_keys($labels), $types)),
                "{$locale}: ლეიბლი ისეთ ტიპზეა, რომელიც აღარ ილოგება",
            );
        }
    }
}
