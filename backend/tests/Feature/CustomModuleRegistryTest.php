<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Concerns\HasGallery;
use App\Models\Concerns\HasStatus;
use App\Models\CustomCategory;
use App\Models\CustomRecord;
use App\Models\CustomRecordFile;
use App\Models\CustomRecordNote;
use App\Models\Module;
use App\Models\User;
use App\Services\Export\RecordExporter;
use App\Services\Purge\PurgeService;
use App\Services\Storage\StorageMeter;
use App\Support\AuditRegistry;
use App\Support\CustomFields;
use App\Support\CustomModules;
use App\Support\ExportDomain;
use App\Support\FieldCatalog;
use App\Support\GalleryParent;
use App\Support\PublicDomain;
use App\Support\StatusDomain;
use App\Support\StorageFolder;
use App\Support\TrashDomain;
use Closure;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;
use Throwable;

/**
 * **ყველა რეესტრი ერთ პირად მოდულზე (Tasks §37.6).**
 *
 * `RegistryConsistencyTest` რუკებს სქემასა და თესლად შექმნილ **საბაზისო**
 * მოდულებს ადარებს — პირადი მოდული ინტერფეისიდან იქმნება, ე.ი. იქ არასდროს
 * ჩანს, და ამ რუკების ყველა მისი შტო (`CustomModules::isKey()`/`exists()`)
 * იმ ტესტისთვის უხილავია. აქ **ერთი სრულად შევსებული პირადი მოდული**
 * იქმნება ისე, როგორც მომხმარებელი ქმნის (API-თ — ფოტო, ფაილები, ჩანიშვნა,
 * დამატებითი ველები, სტატუსი, კლასიფიკატორი, ტეგი, ბმული), და ყოველი
 * რეესტრი მასზე გადის.
 *
 * ⚠️ **ორი მიმართულება და ორივე აუცილებელია.** (1) რეესტრი მფლობელისთვის
 * მოდულს **იცნობს** — გამორჩენა ჩუმია: ჩანაწერი უბრალოდ არ ჩანს ძებნაში,
 * არ ითვლება სტატისტიკაში, ანგარიშის წაშლისას მოდელის გარეშე ქრება.
 * (2) რეესტრი მას **სხვას არ აძლევს** (Q28 — „სხვისი პირადი მოდული არ
 * არსებობს"): სუპერადმინისთვისაც, ადმინის გვერდებზეც.
 *
 * ⚠️ **ცხრილი ერთია ყველა პირად მოდულზე**, ამიტომ მესამე წესიც მოწმდება:
 * ყველა რეესტრი **მოდულით ჭრის** — მეზობელი მოდულის ჩანაწერი ერთ მთვლელშიც
 * არ უნდა მოხვდეს (`LibraryStats::base()`-ის გაკვეთილი, §37.5).
 *
 * ⚠️ შემოწმებები **ცხრილშია** და ერთ სიად ბრუნდება (`$missing`) — ბაზისური
 * ტესტის ფორმით: ერთი დარღვევა მომდევნოებს არ მალავს.
 */
class CustomModuleRegistryTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $stranger;

    private User $admin;

    private string $key;

    private CustomRecord $record;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        Storage::fake('public');
        Storage::fake('private');

        $this->owner = $this->makeUser('owner');
        $this->stranger = $this->makeUser('stranger');
        $this->admin = $this->makeUser('boss');
        $this->admin->assignRole('super_admin')->save();
        $this->admin->refresh();

        $this->key = $this->createModule($this->owner, 'Recipes');
        $this->record = $this->fullRecord($this->owner, $this->key);
    }

    /* ---------- დამხმარეები ---------- */

    private function makeUser(string $name): User
    {
        $user = User::factory()->create(['username' => $name]);
        $user->modules()->syncWithoutDetaching([
            Module::where('key', 'gallery')->value('id') => ['enabled_at' => now()],
        ]);

        // ⚠️ ქარხანა კვოტას არ წერს — მეხსიერებაში `null`-ია და ატვირთვა 413
        return $user->refresh();
    }

    /** მოდული API-ით — ჟანრით, ნაგულისხმევი სტატუსებით და ორი დამატებითი ველით */
    private function createModule(User $user, string $name): string
    {
        return $this->actingAs($user)->postJson('/api/modules', [
            'name_ka' => $name,
            'name_en' => $name,
            'icon' => 'Utensils',
            'color' => '#22c55e',
            'classification' => 'genre',
            'statuses' => 'default',
            'categories' => ['სადილი', 'დესერტი'],
            'fields' => [
                ['type' => 'text', 'label_ka' => 'მზარეული', 'label_en' => 'Chef'],
                ['type' => 'file', 'label_ka' => 'სკანი', 'label_en' => 'Scan'],
            ],
        ])->assertCreated()->json('data.key');
    }

    private function categoryId(string $key): int
    {
        return (int) CustomCategory::withoutGlobalScopes()->where('module', $key)->orderBy('id')->value('id');
    }

    /** ჩანაწერი ყველაფრით, რაც მოდულს შეუძლია — თითო რეესტრს თავისი საგანი აქვს */
    private function fullRecord(User $user, string $key, string $title = 'Pasta'): CustomRecord
    {
        $this->actingAs($user);

        $id = $this->post("/api/custom/{$key}", [
            'title' => $title,
            'description' => 'Slow-cooked sauce',
            'status' => 'done',
            'category_id' => $this->categoryId($key),
            'tags' => ['quick'],
            'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'photo' => UploadedFile::fake()->image('main.jpg', 60, 60),
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.id');

        foreach (['image' => UploadedFile::fake()->image('shot.jpg', 40, 40), 'doc' => UploadedFile::fake()->create('menu.pdf', 12, 'application/pdf')] as $kind => $file) {
            $this->post("/api/custom/{$key}/{$id}/files", ['kind' => $kind, 'files' => [$file]], ['Accept' => 'application/json'])
                ->assertCreated();
        }

        $this->postJson("/api/custom/{$key}/{$id}/notes", ['body' => 'Salt the water'])->assertCreated();
        $this->putJson("/api/custom-fields/{$key}/{$id}", ['values' => ['chef' => 'Mario']])->assertOk();
        $this->post("/api/custom-fields/{$key}/{$id}/file", [
            'key' => 'scan',
            'file' => UploadedFile::fake()->create('scan.pdf', 8, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();

        return CustomRecord::withoutGlobalScopes()->findOrFail($id);
    }

    /** `referencedPaths()` — ობოლების სკანერის „ცოცხალი" გზები */
    private function referencedPaths(): array
    {
        $method = new \ReflectionMethod(StorageMeter::class, 'referencedPaths');

        return $method->invoke(app(StorageMeter::class));
    }

    /**
     * შემოწმებების ცხრილი → დარღვევების სია. ⚠️ გამონაკლისიც დარღვევაა
     * (მიზეზით) — თორემ ერთი ჩავარდნილი რეესტრი დანარჩენებს დამალავდა.
     *
     * @param  array<string, Closure(): bool>  $checks
     * @return list<string>
     */
    private function failing(array $checks): array
    {
        $failed = [];

        foreach ($checks as $name => $check) {
            try {
                if ($check() !== true) {
                    $failed[] = $name;
                }
            } catch (Throwable $e) {
                $failed[] = "{$name} — ".class_basename($e).': '.$e->getMessage();
            }
        }

        return $failed;
    }

    /* ---------- 1. მფლობელისთვის ყველა რეესტრი მოდულს იცნობს ---------- */

    public function test_every_registry_knows_the_private_module(): void
    {
        $key = $this->key;
        $owner = $this->owner;
        $record = $this->record;
        $this->actingAs($owner);

        $mine = fn () => app(StorageMeter::class)->files($owner->fresh())
            ->filter(fn (array $f) => str_starts_with((string) $f['path'], CustomModules::ROOT."/{$key}/"));

        $failed = $this->failing([
            /* ---- ურნა ---- */
            'trash: the module is a record kind' => fn () => TrashDomain::has($key)
                && in_array($key, TrashDomain::domains(), true)
                && TrashDomain::category($key) === 'record'
                && TrashDomain::model($key) === CustomRecord::class
                && in_array($key, TrashDomain::kinds(), true),
            'trash: the tables are known' => fn () => in_array(CustomModules::TABLE, TrashDomain::tables(), true)
                && in_array('custom_record_files', TrashDomain::itemTables(), true)
                && in_array('custom_record_notes', TrashDomain::itemTables(), true),
            'trash: files and notes read their module from the row' => fn () => TrashDomain::ITEMS['custom_record_file']['module_column'] === 'module'
                && TrashDomain::ITEMS['custom_record_note']['module_column'] === 'module',

            /* ---- ექსპორტი ---- */
            'export: the registry' => fn () => ExportDomain::has($key)
                && ExportDomain::model($key) === CustomRecord::class
                && ExportDomain::fields($key) !== [],
            'export: every field resolves' => function () use ($key) {
                $columns = Schema::getColumnListing(CustomModules::TABLE);

                foreach (ExportDomain::fields($key) as $field) {
                    $real = in_array($field, $columns, true)
                        || in_array($field, RecordExporter::VIRTUAL, true)
                        || method_exists(CustomRecord::class, 'get'.str_replace('_', '', ucwords($field, '_')).'Attribute');

                    if (! $real) {
                        return false;
                    }
                }

                return true;
            },
            'export: one row, this module only' => fn () => array_column(
                iterator_to_array(app(RecordExporter::class)->rows($owner, $key)),
                'title',
            ) === ['Pasta'],
            'export: the index lists it' => fn () => collect($this->getJson('/api/export')->assertOk()->json('data'))
                ->firstWhere('key', $key)['count'] === 1,

            /* ---- ძებნა ---- */
            'search: by title' => fn () => collect($this->getJson('/api/search?q=Pasta')->assertOk()->json('groups'))
                ->pluck('key')->contains($key),
            'search: by a note' => fn () => collect($this->getJson('/api/search?q='.urlencode('Salt the'))->json('groups'))
                ->pluck('key')->contains($key),

            /* ---- საჯარო პროფილი და დამთხვევა ---- */
            'public: the domain' => fn () => PublicDomain::has($key)
                && PublicDomain::model($key) === CustomRecord::class
                && PublicDomain::module($key) === $key
                && in_array(CustomModules::TABLE, PublicDomain::tables(), true),
            'public: a card' => fn () => PublicDomain::card($key, $record)['id'] === $record->id,
            'public: the visibility manager lists it' => fn () => collect($this->getJson("/api/visibility/{$key}")->assertOk()->json('data'))
                ->pluck('id')->contains($record->id),
            'match: the pseudo domain' => fn () => PublicDomain::isMatchable(PublicDomain::CUSTOM)
                && in_array(PublicDomain::CUSTOM, PublicDomain::matchDomainsOf([$key]), true),

            /* ---- სტატისტიკა და მიზანი ---- */
            'stats: a tab of its own' => fn () => collect($this->getJson('/api/stats')->assertOk()->json('data'))
                ->firstWhere('key', $key)['total'] === 1,
            'stats: a yearly goal' => fn () => in_array($key, $this->getJson('/api/stats/summary')->json('goal_modules'), true),

            /* ---- მასობრივი წაშლა ---- */
            'purge: a target of this account' => fn () => in_array($key, PurgeService::targets($owner), true),
            'purge: every scope the module can answer' => fn () => PurgeService::modesFor($key) === ['ids', 'type', 'tag', 'status', 'all'],
            'purge: the tag scope has a column' => fn () => PurgeService::supportsTag($key)
                && Schema::hasColumn(CustomModules::TABLE, 'tags'),
            'purge: the plan counts it' => fn () => app(PurgeService::class)
                ->plan($owner, ['target' => $key, 'mode' => 'all'], PurgeService::TO_TRASH)['records'] === 1,

            /* ---- სტატუსები ---- */
            'status: wired end to end' => fn () => StatusDomain::usesDictionary($key)
                && StatusDomain::model($key) === CustomRecord::class
                && in_array(HasStatus::class, class_uses_recursive(CustomRecord::class), true)
                && Schema::hasColumn(CustomModules::TABLE, 'status_id')
                && in_array('status', PurgeService::modesFor($key), true),
            'status: the defaults match purge' => fn () => StatusDomain::defaultKeys($key) === PurgeService::statusesFor($key, $owner->id),

            /* ---- აუდიტი ---- */
            'audit: every model files under the module' => fn () => AuditRegistry::moduleFor($record) === $key
                && AuditRegistry::moduleFor(CustomCategory::withoutGlobalScopes()->where('module', $key)->firstOrFail()) === $key
                && AuditRegistry::moduleFor(CustomRecordFile::withoutGlobalScopes()->where('module', $key)->firstOrFail()) === $key
                && AuditRegistry::moduleFor(CustomRecordNote::withoutGlobalScopes()->where('module', $key)->firstOrFail()) === $key,
            'audit: the create row carries the module' => fn () => AuditLog::where('action', AuditLog::ACTION_CREATE)
                ->where('subject_type', 'custom_record')
                ->where('subject_id', $record->id)
                ->value('module') === $key,

            /* ---- დამატებითი ველები და ველების კონსტრუქტორი ---- */
            'custom fields: the table' => function () use ($key, $record) {
                $table = CustomFields::table($key);

                return CustomFields::supports($key)
                    && $table === CustomModules::VALUES_TABLE
                    && Schema::hasColumns($table, ['value_path', 'value_name', 'value_mime', 'value_size'])
                    && CustomFields::model($key) === CustomRecord::class
                    && CustomFields::moduleOf($record) === $key;
            },
            'field catalog: title locked, classifier present' => function () use ($key) {
                $fields = collect(FieldCatalog::for($key))->keyBy('key');

                return FieldCatalog::has($key)
                    && ($fields['title']['locked'] ?? false) === true
                    && $fields->has('category');
            },

            /* ---- საცავი ---- */
            'storage: every folder maps back to the module' => fn () => StorageFolder::moduleFor(StorageFolder::customPhotos($key)) === $key
                && StorageFolder::moduleFor(StorageFolder::customFiles($key, 'doc')) === $key
                && StorageFolder::moduleFor(StorageFolder::customFiles($key, 'image')) === $key
                && StorageFolder::moduleFor(StorageFolder::customFields($key)) === $key
                && in_array(CustomModules::ROOT, StorageFolder::ROOTS, true)
                && StorageFolder::diskFor(StorageFolder::customFields($key)) === 'public',
            // მთავარი ფოტო · ორი ფაილი · ველის ფაილი
            'storage: every upload is attributed to the module' => fn () => $mine()->count() === 4
                && $mine()->every(fn (array $f) => $f['module'] === $key),
            'storage: the module hint never changes the answer' => fn () => app(StorageMeter::class)->files($owner->fresh(), $key)
                ->where('module', $key)->pluck('path')->sort()->values()->all()
                === app(StorageMeter::class)->files($owner->fresh())->where('module', $key)->pluck('path')->sort()->values()->all(),
            'storage: the module limit sees its bytes' => fn () => app(StorageMeter::class)->usedByModule($owner->fresh(), $key)
                === (int) $mine()->sum('size'),
            'storage: no upload is an orphan' => function () use ($mine) {
                $referenced = $this->referencedPaths();

                return $mine()->every(fn (array $f) => isset($referenced[$f['path']]));
            },

            /* ---- გალერეა ---- */
            'gallery: a parent of this account' => fn () => GalleryParent::has($key)
                && in_array($key, GalleryParent::keys($owner), true)
                && in_array(HasGallery::class, class_uses_recursive(GalleryParent::model($key)), true)
                && method_exists(GalleryParent::model($key), 'galleryVideos'),
            'gallery: the modules cut' => fn () => $this->getJson("/api/gallery/module-photos?module={$key}")->assertOk()->json('meta.total') >= 1,

            /* ---- მენიუ, მთავარი გვერდი, კლასიფიკატორები ---- */
            'modules: the sidebar lists it' => fn () => collect($this->getJson('/api/modules')->assertOk()->json('data'))
                ->pluck('key')->contains($key),
            'dashboard: a card that counts this module' => fn () => collect($this->getJson('/api/dashboard')->assertOk()->json('data'))
                ->firstWhere('key', $key)['count'] === 1,
            'dictionaries: the statuses and the classifier' => fn () => count($this->getJson("/api/statuses/{$key}")->assertOk()->json('data')) === 3
                && count($this->getJson("/api/custom/{$key}/categories")->assertOk()->json('data')) === 2,
        ]);

        $this->assertSame([], $failed, implode(PHP_EOL, [
            'რეესტრი პირად მოდულს ვერ ცნობს — მფლობელისთვის ის ამ ადგილას ჩუმად არ არსებობს:',
            ...$failed,
        ]));
    }

    /* ---------- 2. სხვას — არცერთი რეესტრი ---------- */

    public function test_no_registry_hands_the_module_to_another_account(): void
    {
        $key = $this->key;

        // ⚠️ ჯერ თვითონ შემოწმება — ის უნდა ხედავდეს, რასაც მფლობელი ხედავს
        $this->actingAs($this->owner)->getJson("/api/custom/{$key}")->assertOk();

        foreach (['stranger' => $this->stranger, 'super admin' => $this->admin] as $who => $user) {
            $this->actingAs($user);

            $leaks = $this->failing([
                'modules list' => fn () => ! collect($this->getJson('/api/modules')->json('data'))->pluck('key')->contains($key),
                'dashboard' => fn () => ! collect($this->getJson('/api/dashboard')->json('data'))->pluck('key')->contains($key),
                'records' => fn () => $this->getJson("/api/custom/{$key}")->status() === 404,
                'statuses' => fn () => $this->getJson("/api/statuses/{$key}")->status() === 404,
                'classifier' => fn () => $this->getJson("/api/custom/{$key}/categories")->status() === 404,
                'custom fields' => fn () => $this->getJson("/api/modules/{$key}/custom-fields")->status() === 404,
                'visibility' => fn () => $this->getJson("/api/visibility/{$key}")->status() === 404,
                'export index' => fn () => ! collect($this->getJson('/api/export')->json('data'))->pluck('key')->contains($key),
                'export file' => fn () => $this->get("/api/export/{$key}?format=json")->status() === 404,
                'search' => fn () => ! collect($this->getJson('/api/search?q=Pasta')->json('groups'))->pluck('key')->contains($key),
                'stats' => fn () => ! collect($this->getJson('/api/stats')->json('data'))->pluck('key')->contains($key),
                'purge targets' => fn () => ! in_array($key, PurgeService::targets($user), true),
                'gallery parents' => fn () => ! in_array($key, GalleryParent::keys($user), true),
                'gallery modules cut' => fn () => $this->getJson("/api/gallery/module-photos?module={$key}")->status() !== 200
                    || (int) $this->getJson("/api/gallery/module-photos?module={$key}")->json('meta.total') === 0,
                // ⚠️ უცნობი გასაღების პასუხი (422) — 201 არსებობას გაამხელდა
                'module request' => fn () => $this->postJson('/api/requests/module', ['module_key' => $key])->status() === 422,
            ]);

            $this->assertSame([], $leaks, "{$who}-ს პირადი მოდული ამ ადგილას უჩანს: ".implode(', ', $leaks));
        }
    }

    /* ---------- 3. ერთი ცხრილი, ორი მოდული ---------- */

    public function test_two_private_modules_never_count_each_other(): void
    {
        $gadgets = $this->createModule($this->owner, 'Gadgets');
        $this->fullRecord($this->owner, $gadgets, 'Phone');
        $this->fullRecord($this->owner, $gadgets, 'Laptop');
        $this->actingAs($this->owner);

        foreach ([$this->key => 1, $gadgets => 2] as $key => $count) {
            $failed = $this->failing([
                'dashboard' => fn () => collect($this->getJson('/api/dashboard')->json('data'))->firstWhere('key', $key)['count'] === $count,
                'export' => fn () => collect($this->getJson('/api/export')->json('data'))->firstWhere('key', $key)['count'] === $count,
                'export rows' => fn () => count(iterator_to_array(app(RecordExporter::class)->rows($this->owner, $key))) === $count,
                'stats' => fn () => collect($this->getJson('/api/stats')->json('data'))->firstWhere('key', $key)['total'] === $count,
                'goal' => fn () => $this->getJson('/api/stats/summary')->json("done_by_module.{$key}") === $count,
                'purge plan' => fn () => app(PurgeService::class)
                    ->plan($this->owner, ['target' => $key, 'mode' => 'all'], PurgeService::TO_TRASH)['records'] === $count,
                'visibility' => fn () => $this->getJson("/api/visibility/{$key}")->json('meta.total') === $count,
                // მთავარი ფოტო · ორი ფაილი · ველის ფაილი — თითო ჩანაწერზე ოთხი
                'storage' => fn () => app(StorageMeter::class)->files($this->owner->fresh())->where('module', $key)->count() === 4 * $count,
                'gallery modules cut' => fn () => $this->getJson("/api/gallery/module-photos?module={$key}")->json('meta.total') === 2 * $count,
                'records' => fn () => $this->getJson("/api/custom/{$key}")->json('meta.total') === $count,
            ]);

            $this->assertSame([], $failed, "`{$key}`-ს მეზობელი მოდულის ჩანაწერები ერევა: ".implode(', ', $failed));
        }

        // ⚠️ ძებნაც — ერთი სიტყვა ორივე მოდულში, ორი ჯგუფი და არა ერთი ჯამი
        $groups = collect($this->getJson('/api/search?q=Salt')->json('groups'))->keyBy('key');
        $this->assertSame(1, $groups[$this->key]['total']);
        $this->assertSame(2, $groups[$gadgets]['total']);
    }

    /* ---------- 4. ანგარიშის წაშლა ---------- */

    /**
     * ⚠️ **ჩანაწერები მოდელით უნდა წაიშალოს და არა SQL-კასკადით.** აქამდე
     * `AccountEraser` მხოლოდ სტატიკურ სამიზნეებს ათვალიერებდა — პირადი
     * მოდულის ჩანაწერი `user_id`-ის კასკადით ქრებოდა: ფაილები მეორე ფენამ
     * გადაარჩინა, აუდიტში კი წაშლა საერთოდ არ ჩანდა. აუდიტის `delete` რიგი
     * სწორედ ის კვალია, რასაც კასკადი ვერ დატოვებდა.
     */
    public function test_deleting_the_account_removes_private_records_through_the_model(): void
    {
        Storage::disk('public')->put('gallery/images/from-web.jpg', 'jpeg');
        $photo = $this->record->galleryImages()->create([
            'user_id' => $this->owner->id,
            'source' => 'wikimedia',
            'category' => 'backdrop',
            'path' => 'gallery/images/from-web.jpg',
            'size' => 4,
        ]);

        $paths = app(StorageMeter::class)->files($this->owner->fresh())->pluck('path')->all();
        $this->assertContains($photo->path, $paths);
        $this->assertGreaterThanOrEqual(5, count(array_filter($paths, fn ($p) => str_starts_with($p, CustomModules::ROOT.'/'))) + 1);

        $this->actingAs($this->admin)->deleteJson("/api/admin/users/{$this->owner->id}")->assertNoContent();

        foreach ($paths as $path) {
            Storage::disk(StorageFolder::diskFor($path))->assertMissing($path);
        }

        $this->assertSame(0, CustomRecord::withoutGlobalScopes()->count());
        $this->assertSame(0, DB::table('custom_record_files')->count());
        $this->assertSame(0, DB::table('custom_record_notes')->count());
        $this->assertSame(0, DB::table(CustomModules::VALUES_TABLE)->count());
        $this->assertNull(Module::withoutGlobalScopes()->where('key', $this->key)->first());

        $this->assertTrue(
            AuditLog::where('action', AuditLog::ACTION_DELETE)
                ->where('subject_type', 'custom_record')
                ->where('subject_id', $this->record->id)
                ->exists(),
            'პირადი მოდულის ჩანაწერი მოდელის გარეშე წაიშალა (აუდიტში კვალი არ დარჩა)',
        );
    }

    /**
     * ⚠️ **ღამის გასუფთავება პირად ჩანაწერს სამუდამოდ და მოდელით შლის** — ეს
     * ურნის ბოლო ნაბიჯია (და 37.7-ის მოდულის წაშლა მასზე დგას): ფაილები,
     * ჩანიშვნები, ველის ფაილი და კვოტა ერთად უნდა გათავისუფლდეს, მეზობელი
     * მოდულის იმავე ასაკის ჩანაწერი კი — **მხოლოდ თავისი მოდულით** იჭრება.
     */
    public function test_the_nightly_prune_deletes_an_expired_private_record_for_good(): void
    {
        $paths = app(StorageMeter::class)->files($this->owner->fresh())->where('module', $this->key)->pluck('path')->all();
        $this->assertCount(4, $paths);

        $this->actingAs($this->owner)->deleteJson("/api/custom/{$this->key}/{$this->record->id}")->assertNoContent();
        $fresh = $this->fullRecord($this->owner, $this->key, 'Soup');
        $this->deleteJson("/api/custom/{$this->key}/{$fresh->id}")->assertNoContent();

        CustomRecord::withoutGlobalScopes()->whereKey($this->record->id)
            ->update(['trashed_at' => now()->subDays(TrashDomain::KEEP_DAYS + 1)]);

        $this->artisan('trash:prune')->assertSuccessful();

        $this->assertNull(CustomRecord::withoutGlobalScopes()->find($this->record->id));
        foreach ($paths as $path) {
            Storage::disk(StorageFolder::diskFor($path))->assertMissing($path);
        }
        $this->assertSame(0, DB::table('custom_record_notes')->where('custom_record_id', $this->record->id)->count());

        // ⚠️ ვადაში მყოფი ხელუხლებელია და კვოტაში ისევ ითვლება
        $this->assertNotNull(CustomRecord::withoutGlobalScopes()->find($fresh->id));
        $this->assertSame(
            (int) app(StorageMeter::class)->files($this->owner->fresh())->sum('size'),
            (int) $this->owner->fresh()->storage_used_bytes,
        );
    }

    /* ---------- 5. ადმინის გვერდები ---------- */

    public function test_the_admin_never_lists_grants_or_strips_a_private_module(): void
    {
        $this->actingAs($this->admin);

        // მომხმარებლის გვერდის მინიჭების სია — მხოლოდ საბაზისო
        $keys = collect($this->getJson("/api/admin/users/{$this->owner->id}")->assertOk()->json('modules'))->pluck('key');
        $this->assertTrue($keys->contains('movie'));
        $this->assertFalse($keys->contains($this->key), 'სხვისი პირადი მოდული ადმინის მინიჭების სიაშია');

        // სხვისი პირადი მოდული არავის ენიჭება — უცნობის პასუხით
        $this->putJson("/api/admin/users/{$this->stranger->id}/modules", ['module_keys' => [$this->key]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('module_keys.0');

        /* ⚠️ **ადმინის შენახვა მფლობელს საკუთარ მოდულს არ ართმევს.** SPA
           მხოლოდ საბაზისო სიას აგზავნის — „ახლანდელიც" საბაზისო რომ არ ყოფილიყო,
           `array_diff` მფლობელის პირად პივოტს „მოხსნილად" ჩათვლიდა. */
        $this->putJson("/api/admin/users/{$this->owner->id}/modules", ['module_keys' => ['movie']])->assertOk();
        $this->actingAs($this->owner->fresh())->getJson("/api/custom/{$this->key}")->assertOk();
        $this->assertTrue($this->owner->fresh()->hasModule($this->key));

        // როლში პირადი მოდულის უფლება არ ინახება — როლი საერთოა
        $role = $this->actingAs($this->admin)->postJson('/api/admin/roles', [
            'name_ka' => 'რედაქტორი',
            'name_en' => 'Editor',
            'permissions' => ['movie' => ['view'], $this->key => ['view', 'update']],
        ])->assertCreated()->json('data');
        $this->assertSame(['movie' => ['view']], $role['permissions']);
    }

    /* ---------- 6. აუდიტი ---------- */

    public function test_the_audit_log_names_private_module_activity(): void
    {
        // საკუთარი მოდულის მისამართი მოდულის გასაღებით იწერება
        $this->actingAs($this->owner)->postJson('/api/audit/visit', ['path' => "/c/{$this->key}"])->assertNoContent();
        $this->assertSame($this->key, AuditLog::where('action', AuditLog::ACTION_VISIT)->where('user_id', $this->owner->id)->value('module'));

        /* ⚠️ სხვის მისამართზე (ან ხელით გამოგზავნილ სხვის გასაღებზე) — არა:
           ის გვერდი მისთვის 404-ია და „X-ის მოდულში შეიხედა" ფაქტი არ არის. */
        $this->actingAs($this->stranger)->postJson('/api/audit/visit', ['path' => "/c/{$this->key}"])->assertNoContent();
        $this->actingAs($this->stranger)->postJson('/api/audit/visit', ['path' => '/somewhere', 'module' => $this->key])->assertNoContent();
        $this->assertSame(
            [null, null],
            AuditLog::where('action', AuditLog::ACTION_VISIT)->where('user_id', $this->stranger->id)->orderBy('id')->pluck('module')->all(),
        );

        // მეტამონაცემში მფლობელით — ორ ადამიანს ერთი სახელის მოდული შეიძლება ჰქონდეს
        $meta = collect($this->actingAs($this->admin)->getJson('/api/admin/audit/meta')->assertOk()->json('modules'))->keyBy('key');
        $this->assertSame('owner', $meta[$this->key]['owner']);
        $this->assertNull($meta['movie']['owner']);

        $facet = collect($this->getJson('/api/admin/audit/summary')->assertOk()->json('modules'))->firstWhere('key', $this->key);
        $this->assertGreaterThan(0, $facet['total'] ?? 0);
    }

    /* ---------- 7. ზედმეტი პივოტი ---------- */

    /**
     * ⚠️ **პივოტის რიგი სხვის პირად მოდულს არ ხსნის.** ყველა გზა, რომელიც
     * ასეთ რიგს ქმნიდა (ადმინის მინიჭება, `--promote`, დემო-სიდერი,
     * რეგისტრაციის ნაგულისხმევები) დაიხურა — ეს მეორე ფენაა, ძველი ან ხელით
     * ჩაწერილი რიგისთვის.
     */
    public function test_a_stray_pivot_never_opens_someone_elses_module(): void
    {
        $moduleId = Module::where('key', $this->key)->value('id');
        $this->stranger->modules()->attach($moduleId, ['enabled_at' => now()]);
        $stranger = $this->stranger->fresh();

        $this->assertFalse($stranger->hasModule($this->key));
        $this->assertFalse($stranger->isGrantedModule($this->key));
        $this->assertNotContains($this->key, $stranger->moduleKeys());

        $this->actingAs($stranger)->getJson("/api/custom/{$this->key}")->assertNotFound();
        $this->assertFalse(collect($this->getJson('/api/modules')->json('data'))->pluck('key')->contains($this->key));
    }

    /** ⚠️ რეგისტრაცია ახალ ანგარიშს სხვის პირად მოდულს არ აბამს — თუნდაც „ნაგულისხმევად" მონიშნული იყოს */
    public function test_registration_never_attaches_a_private_module(): void
    {
        Module::where('key', $this->key)->update(['enabled_by_default' => true]);
        // ⚠️ საბაზისოც — თორემ ცარიელი ნაგულისხმევი სია ტესტს უაზროდ გაატარებდა
        Module::where('key', 'movie')->update(['enabled_by_default' => true]);

        /* ⚠️ `setUp()`-ის `actingAs()`-მა ნაგულისხმევი გარდი `sanctum`-ზე გადართო,
           რეგისტრაცია კი `Auth::login()`-ს ნაგულისხმევ გარდზე იძახებს — ტესტში
           ერთი აპლიკაცია ყველა რექვესთს ემსახურება (FEAT-16-ის შენიშვნა). ახალი
           რექვესთი `web`-ით იწყება, ე.ი. აქ იგივე მდგომარეობა აღდგება. */
        auth()->forgetGuards();
        auth()->shouldUse('web');

        $this->postJson('/api/auth/register', [
            'name' => 'Newbie',
            'username' => 'newbie',
            'email' => 'newbie@example.com',
            'password' => 'secret-password-1',
            'password_confirmation' => 'secret-password-1',
        ])->assertCreated();

        $user = User::where('username', 'newbie')->firstOrFail();
        $this->assertFalse($user->modules()->where('key', $this->key)->exists());
        $this->assertTrue($user->modules()->where('key', 'movie')->exists());
    }
}
