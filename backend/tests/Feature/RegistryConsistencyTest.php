<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\DashboardController;
use App\Models\BookmarkCategory;
use App\Models\Concerns\HasGallery;
use App\Models\Concerns\HasStatus;
use App\Models\Module;
use App\Models\NoteCategory;
use App\Models\VideoType;
use App\Services\Gallery\ModuleImages;
use App\Services\Purge\PurgeService;
use App\Services\Storage\StorageMeter;
use App\Support\AuditRegistry;
use App\Support\CustomFields;
use App\Support\GalleryParent;
use App\Support\PublicDomain;
use App\Support\StatusDomain;
use App\Support\StorageFolder;
use Database\Seeders\ModulesSeeder;
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
        // ცხრილს **მოდელს** ვეკითხებით — რუკაში მხოლოდ კლასი წერია
        $tables = array_map(
            fn (array $domain) => (new $domain['model'])->getTable(),
            array_values(PublicDomain::DOMAINS),
        );

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
}
