<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\CustomCategory;
use App\Models\CustomRecord;
use App\Models\Module;
use App\Models\Status;
use App\Models\TrashEntry;
use App\Models\User;
use App\Services\Profile\MatchService;
use App\Services\Storage\StorageMeter;
use App\Support\CustomModules;
use App\Support\CustomModuleTrash;
use App\Support\NotificationType;
use App\Support\StorageFolder;
use App\Support\TrashDomain;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **პირადი მოდულის წაშლა — ურნაში, ჩანაწერებთან ერთად (Tasks §37.7, Q31).**
 *
 * ⚠️ სამი მდგომარეობა და თითოს თავისი ხაფანგი: **ურნაში** (მოდული ყველა
 * რეესტრიდან ქრება, ფაილები და კვოტა კი ხელუხლებელია — ურნა არაფერს
 * ათავისუფლებს), **აღდგენა** (ყველაფერი ბრუნდება, ურნაში უკვე მყოფი
 * ჩანაწერიც — თავისი ძველი ვადით) და **საბოლოო წაშლა** (ყოველი ჩანაწერი
 * მოდელით: ფაილები, გალერეა, დამატებითი ველები და კვოტა; ურნაში მყოფი
 * მოდულის ველის ცხრილს `CustomFields::table()` ვერ ხედავს — ამიტომ
 * `storageTable()`).
 */
class CustomModuleDeleteTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $stranger;

    private User $admin;

    private string $key;

    private CustomRecord $pasta;

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
        $this->pasta = $this->fullRecord($this->owner, $this->key, 'Pasta');
    }

    /* ---------- დამხმარეები ---------- */

    private function makeUser(string $name): User
    {
        $user = User::factory()->create(['username' => $name]);
        $user->modules()->syncWithoutDetaching([
            Module::where('key', 'gallery')->value('id') => ['enabled_at' => now()],
        ]);

        return $user->refresh();
    }

    private function createModule(User $user, string $name): string
    {
        return $this->actingAs($user)->postJson('/api/modules', [
            'name_ka' => $name,
            'name_en' => $name,
            'icon' => 'Utensils',
            'color' => '#22c55e',
            'classification' => 'genre',
            'statuses' => 'default',
            'categories' => ['სადილი'],
            'fields' => [['type' => 'file', 'label_ka' => 'სკანი', 'label_en' => 'Scan']],
        ])->assertCreated()->json('data.key');
    }

    /** ჩანაწერი ყველა სახის ფაილით — საბოლოო წაშლამ ყველა უნდა წაიღოს */
    private function fullRecord(User $user, string $key, string $title): CustomRecord
    {
        $this->actingAs($user);

        $id = $this->post("/api/custom/{$key}", [
            'title' => $title,
            'status' => 'done',
            'category_id' => (int) CustomCategory::withoutGlobalScopes()->where('module', $key)->value('id'),
            'photo' => UploadedFile::fake()->image('main.jpg', 60, 60),
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.id');

        $this->post("/api/custom/{$key}/{$id}/files", [
            'kind' => 'doc', 'files' => [UploadedFile::fake()->create('menu.pdf', 12, 'application/pdf')],
        ], ['Accept' => 'application/json'])->assertCreated();
        $this->postJson("/api/custom/{$key}/{$id}/notes", ['body' => 'Salt the water'])->assertCreated();
        $this->post("/api/custom-fields/{$key}/{$id}/file", [
            'key' => 'scan', 'file' => UploadedFile::fake()->create('scan.pdf', 8, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $record = CustomRecord::withoutGlobalScopes()->findOrFail($id);

        // ვებიდან ჩამოტვირთული გალერეის ფოტო — მშობლით მოდულს ეკუთვნის
        Storage::disk('public')->put("gallery/images/{$title}.jpg", 'jpeg');
        $record->galleryImages()->create([
            'user_id' => $user->id, 'source' => 'wikimedia', 'category' => 'backdrop',
            'path' => "gallery/images/{$title}.jpg", 'size' => 4,
        ]);

        return $record;
    }

    /** @return list<string> ამ მოდულის ყველა ფაილი */
    private function moduleFiles(): array
    {
        return $this->moduleRows()->pluck('path')->all();
    }

    /** ⚠️ გალერეის ფოტოც — ის მოდულის ჩანაწერზე ჰკიდია და მოდულთან ერთად მიდის */
    private function moduleRows()
    {
        return app(StorageMeter::class)->files($this->owner->fresh())
            ->filter(fn (array $f) => $f['module'] === $this->key || str_starts_with((string) $f['path'], 'gallery/images/'));
    }

    private function trashGroup(): ?array
    {
        return collect($this->getJson('/api/trash')->assertOk()->json('data'))->firstWhere('kind', CustomModuleTrash::KIND);
    }

    private function deleteModule(): int
    {
        return (int) $this->actingAs($this->owner)->deleteJson("/api/modules/{$this->key}")
            ->assertOk()->assertJsonPath('trashed', true)->json('trash_id');
    }

    /* ---------- ურნაში ---------- */

    public function test_the_owner_deletes_a_module_into_the_trash_with_its_records(): void
    {
        $soup = $this->fullRecord($this->owner, $this->key, 'Soup');
        // ⚠️ ურნაში უკვე მყოფი ჩანაწერი მოდულს მიჰყვება და რიცხვში არ ითვლება
        $this->deleteJson("/api/custom/{$this->key}/{$soup->id}")->assertNoContent();

        $paths = $this->moduleFiles();
        $used = (int) $this->owner->fresh()->storage_used_bytes;
        $bytes = (int) $this->moduleRows()->sum('size');

        $details = $this->getJson("/api/modules/{$this->key}/details")->assertOk();
        $this->assertSame(1, $details->json('records'));
        $this->assertGreaterThan(0, $details->json('bytes'));

        $this->deleteJson("/api/modules/{$this->key}")->assertOk()->assertJsonPath('records', 1);

        // ყველა რეესტრიდან ქრება — მფლობელისთვისაც
        $this->assertFalse(collect($this->getJson('/api/modules')->json('data'))->pluck('key')->contains($this->key));
        $this->getJson("/api/custom/{$this->key}")->assertNotFound();
        $this->getJson("/api/statuses/{$this->key}")->assertNotFound();
        $this->getJson("/api/modules/{$this->key}/details")->assertNotFound();
        $this->assertFalse(collect($this->getJson('/api/dashboard')->json('data'))->pluck('key')->contains($this->key));
        $this->assertFalse(collect($this->getJson('/api/search?q=Pasta')->json('groups'))->pluck('key')->contains($this->key));
        $this->assertNull(collect($this->getJson('/api/stats')->json('data'))->firstWhere('key', $this->key));
        $this->assertFalse(collect($this->getJson('/api/export')->json('data'))->pluck('key')->contains($this->key));

        // ⚠️ ურნა არაფერს ათავისუფლებს — ფაილები დისკზეა, კვოტა უცვლელია
        foreach ($paths as $path) {
            Storage::disk(StorageFolder::diskFor($path))->assertExists($path);
        }
        $this->assertSame($used, (int) $this->owner->fresh()->storage_used_bytes);

        // ერთი ელემენტი, ორივე ჩანაწერის ფაილების ზომით
        $group = $this->trashGroup();
        $this->assertNotNull($group);
        $this->assertCount(1, $group['items']);
        $this->assertSame('Recipes', $group['items'][0]['title']);
        $this->assertSame(1, $group['items'][0]['count']);
        $this->assertTrue($group['items'][0]['restorable']);
        // ⚠️ ზომა დისკიდანაა (`files()`) — გალერეის ფოტოებიც, რომლებიც ტესტში მრიცხველს გვერდს უვლის
        $this->assertSame($bytes, $group['items'][0]['size']);

        // ⚠️ ურნაში უკვე მყოფი ჩანაწერი ცალკე ელემენტად აღარ ჩანს — მოდულთან ერთადაა
        $this->assertNull(collect($this->getJson('/api/trash')->json('data'))->firstWhere('kind', $this->key));

        // ბიბლიოთეკაში — არა; „ურნაში" ჯამში — კი
        $library = $this->getJson('/api/storage/files')->assertOk();
        $this->assertSame([], array_values(array_intersect($paths, array_column($library->json('files'), 'path'))));
        $this->assertSame(count($paths), $library->json('trash.files'));
    }

    /**
     * ⚠️ **საჯარო მოდული ურნაში გადასვლისთანავე საჯარო პროფილიდანაც ქრება** —
     * სტუმრისთვისაც, სხვა ანგარიშისთვისაც, და მისი საჯარო ჩანაწერის
     * გვერდიც 404-ია: ურნაში მყოფი შიგთავსი არსად ჩანს.
     */
    public function test_a_public_module_leaves_the_public_profile_when_trashed(): void
    {
        $this->owner->forceFill(['profile_visibility' => 'public'])->save();
        $this->putJson("/api/modules/{$this->key}/public", ['is_public' => true])->assertOk();
        $this->patchJson("/api/visibility/{$this->key}/{$this->pasta->id}", ['visibility' => 'public'])->assertOk();

        $this->assertContains($this->key, $this->actingAs($this->stranger)->getJson('/api/public/profiles/owner')->json('domains'));

        $this->deleteModule();

        foreach ([null, $this->stranger] as $visitor) {
            $this->app['auth']->forgetGuards();
            $request = $visitor ? $this->actingAs($visitor) : $this;

            $this->assertNotContains($this->key, $request->getJson('/api/public/profiles/owner')->assertOk()->json('domains'));
            $request->getJson("/api/public/profiles/owner/{$this->key}")->assertNotFound();
        }
    }

    /**
     * ⚠️ **„მსგავსი გემოვნების" რეიტინგიც** — ის საჯარო მოდულებს ცალკე, raw
     * query-ით კითხულობს (`PublicProfileService::warmDomains()`), რომელსაც
     * `trash` scope არ ახლავს; ურნაში მყოფი მოდულის ჩანაწერები იქ დამთხვევად
     * ითვლებოდა. ⚠️ სერვისი ყოველ ჯერზე ახლიდან იქმნება — მისი მემო
     * ინსტანციისაა, და ერთი და იგივე მარშრუტი ტესტში ქეშირებულ კონტროლერს
     * (და მემოს) იღებს (PERF-15).
     */
    public function test_a_trashed_module_leaves_the_people_ranking(): void
    {
        $link = 'https://example.org/pasta';
        $mine = $this->actingAs($this->owner)->postJson("/api/custom/{$this->key}", ['title' => 'Pasta', 'status' => 'done', 'url' => $link, 'category_id' => (int) CustomCategory::withoutGlobalScopes()->where('module', $this->key)->value('id')])
            ->assertCreated()->json('data.id');
        $theirs = $this->createModule($this->stranger, 'Cooking');
        $their = $this->actingAs($this->stranger)->postJson("/api/custom/{$theirs}", ['title' => 'Pasta', 'status' => 'done', 'url' => $link, 'category_id' => (int) CustomCategory::withoutGlobalScopes()->where('module', $theirs)->value('id')])
            ->assertCreated()->json('data.id');

        foreach ([[$this->owner, $this->key, $mine], [$this->stranger, $theirs, $their]] as [$user, $key, $id]) {
            $user->forceFill(['profile_visibility' => 'public'])->save();
            $this->actingAs($user)->putJson("/api/modules/{$key}/public", ['is_public' => true])->assertOk();
            $this->patchJson("/api/visibility/{$key}/{$id}", ['visibility' => 'public'])->assertOk();
        }

        $shared = fn () => collect(app()->make(MatchService::class)->ranking($this->stranger->fresh())['items'])
            ->firstWhere('profile.username', 'owner')['shared'] ?? null;

        // ⚠️ ჯერ თვითონ შემოწმება — ტესტი უნდა ხედავდეს დამთხვევას, რომელსაც მერე აქრობს
        $this->assertSame(1, $shared());

        $this->deleteModule();

        $this->assertSame(0, $shared());
    }

    public function test_super_admins_are_told_and_the_deleter_is_not(): void
    {
        $this->deleteModule();

        $this->assertSame(1, $this->admin->notifications()->where('type', NotificationType::MODULE_DELETED)->count());
        $this->assertSame(0, $this->stranger->notifications()->count());
        $this->assertSame(0, $this->owner->notifications()->where('type', NotificationType::MODULE_DELETED)->count());

        $data = $this->admin->notifications()->where('type', NotificationType::MODULE_DELETED)->first()->data;
        $this->assertSame($this->key, $data['module_key']);
        $this->assertSame(1, $data['records']);

        // სუპერადმინის საკუთარი მოდული — თავის თავს არ ატყობინებს
        $mine = $this->createModule($this->admin, 'Admin notes');
        $this->actingAs($this->admin)->deleteJson("/api/modules/{$mine}")->assertOk();
        $this->assertSame(1, $this->admin->notifications()->where('type', NotificationType::MODULE_DELETED)->count());
    }

    public function test_base_and_foreign_modules_cannot_be_deleted(): void
    {
        // საბაზისო გასაღებს წაშლის მარშრუტი საერთოდ არ აქვს (`where()` — მხოლოდ პირადის ფორმა)
        $this->actingAs($this->admin)->deleteJson('/api/modules/movie')->assertMethodNotAllowed();
        $this->actingAs($this->stranger)->deleteJson("/api/modules/{$this->key}")->assertNotFound();
        $this->actingAs($this->admin)->deleteJson("/api/modules/{$this->key}")->assertNotFound();
        $this->actingAs($this->stranger)->getJson("/api/modules/{$this->key}/details")->assertNotFound();

        // ⚠️ `DELETE /modules/order` (§36) მოდულის გასაღებად არ წაიკითხება
        $this->actingAs($this->owner)->deleteJson('/api/modules/order')->assertSuccessful();

        $this->assertNotNull(Module::where('key', $this->key)->first());
    }

    /* ---------- აღდგენა ---------- */

    public function test_restoring_brings_the_module_back_with_everything(): void
    {
        $soup = $this->fullRecord($this->owner, $this->key, 'Soup');
        $this->deleteJson("/api/custom/{$this->key}/{$soup->id}")->assertNoContent();

        $id = $this->deleteModule();

        $this->postJson("/api/trash/custom_module/{$id}/restore")->assertOk();

        $this->assertTrue(collect($this->getJson('/api/modules')->json('data'))->pluck('key')->contains($this->key));
        $this->assertSame(1, $this->getJson("/api/custom/{$this->key}")->assertOk()->json('meta.total'));
        $this->assertCount(3, $this->getJson("/api/statuses/{$this->key}")->assertOk()->json('data'));
        $this->assertCount(1, $this->getJson("/api/custom/{$this->key}/categories")->json('data'));
        $this->assertSame('scan', $this->getJson("/api/modules/{$this->key}/custom-fields")->json('fields.0.key'));

        // ⚠️ ურნაში მყოფი ჩანაწერი ისევ ურნაშია, თავისი მოდულის ჯგუფში
        $group = collect($this->getJson('/api/trash')->json('data'))->firstWhere('kind', $this->key);
        $this->assertSame([$soup->id], array_column($group['items'] ?? [], 'id'));
        $this->assertNull($this->trashGroup());

        $this->assertTrue(AuditLog::where('action', AuditLog::ACTION_RESTORE)->where('subject_type', 'module')->exists());
    }

    /* ---------- საბოლოო წაშლა ---------- */

    public function test_deleting_for_good_releases_every_file_and_the_quota(): void
    {
        $paths = $this->moduleFiles();
        $this->assertGreaterThanOrEqual(4, count($paths));
        $moduleId = Module::where('key', $this->key)->value('id');

        $id = $this->deleteModule();
        $this->deleteJson("/api/trash/custom_module/{$id}")->assertNoContent();

        foreach ($paths as $path) {
            Storage::disk(StorageFolder::diskFor($path))->assertMissing($path);
        }

        $this->assertSame(0, CustomRecord::withoutGlobalScopes()->count());
        $this->assertSame(0, DB::table('custom_record_files')->count());
        $this->assertSame(0, DB::table('custom_record_notes')->count());
        $this->assertSame(0, DB::table(CustomModules::VALUES_TABLE)->count());
        $this->assertSame(0, Status::withoutGlobalScopes()->where('module', $this->key)->count());
        $this->assertSame(0, CustomCategory::withoutGlobalScopes()->where('module', $this->key)->count());
        $this->assertNull(Module::withoutGlobalScopes()->find($moduleId));
        $this->assertSame(0, DB::table('module_user')->where('module_id', $moduleId)->count());
        $this->assertSame(0, TrashEntry::withoutGlobalScopes()->count());

        // ⚠️ კვოტა: მრიცხველი დისკს ემთხვევა (და მოდულის ბაიტები დაბრუნდა)
        $this->assertSame(
            (int) app(StorageMeter::class)->files($this->owner->fresh())->sum('size'),
            (int) $this->owner->fresh()->storage_used_bytes,
        );
        $this->assertSame(0, (int) $this->owner->fresh()->storage_used_bytes);

        // ჩანაწერი მოდელით წაიშალა — ჟურნალს კვალი დარჩა
        $this->assertTrue(AuditLog::where('action', AuditLog::ACTION_DELETE)
            ->where('subject_type', 'custom_record')->where('subject_id', $this->pasta->id)->exists());
    }

    public function test_the_nightly_prune_erases_an_expired_module(): void
    {
        $paths = $this->moduleFiles();
        $id = $this->deleteModule();

        TrashEntry::withoutGlobalScopes()->whereKey($id)->update(['trashed_at' => now()->subDays(TrashDomain::KEEP_DAYS + 1)]);

        $this->artisan('trash:prune')->assertSuccessful();

        $this->assertNull(Module::withoutGlobalScopes()->where('key', $this->key)->first());
        $this->assertSame(0, CustomRecord::withoutGlobalScopes()->count());
        foreach ($paths as $path) {
            Storage::disk(StorageFolder::diskFor($path))->assertMissing($path);
        }
    }

    public function test_emptying_the_trash_erases_the_module(): void
    {
        $this->deleteModule();

        $this->deleteJson('/api/trash', ['confirm' => 'DELETE'])->assertOk();

        $this->assertNull(Module::withoutGlobalScopes()->where('key', $this->key)->first());
        $this->assertSame(0, CustomRecord::withoutGlobalScopes()->count());
    }

    /* ---------- გასაღები, ჭერი, ანგარიში ---------- */

    public function test_the_key_stays_taken_while_the_module_is_in_the_trash(): void
    {
        $id = $this->deleteModule();

        // ⚠️ იგივე სახელი — ახალი გასაღები; ურნაში მყოფის აღდგენა მას არ დაეჯახება
        $again = $this->createModule($this->owner, 'Recipes');
        $this->assertNotSame($this->key, $again);

        $this->actingAs($this->owner)->postJson("/api/trash/custom_module/{$id}/restore")->assertOk();

        $keys = collect($this->getJson('/api/modules')->json('data'))->pluck('key');
        $this->assertTrue($keys->contains($this->key));
        $this->assertTrue($keys->contains($again));
    }

    public function test_deleting_the_account_clears_a_trashed_module_from_disk(): void
    {
        $paths = $this->moduleFiles();
        $this->deleteModule();

        $this->actingAs($this->admin)->deleteJson("/api/admin/users/{$this->owner->id}")->assertNoContent();

        foreach ($paths as $path) {
            Storage::disk(StorageFolder::diskFor($path))->assertMissing($path);
        }
        $this->assertNull(Module::withoutGlobalScopes()->where('key', $this->key)->first());
        $this->assertSame(0, CustomRecord::withoutGlobalScopes()->count());

        /* ⚠️ **დისკი მეორე ფენამაც (`files()`) გაასუფთავებდა** — ის, რასაც ურნაში
           მყოფი მოდულის ცხადი ჩართვა (`AccountEraser::targetsOf()`) ყიდულობს,
           **მოდელით** წაშლაა: SQL-კასკადი ჟურნალში კვალს არ ტოვებს. */
        $this->assertTrue(AuditLog::where('action', AuditLog::ACTION_DELETE)
            ->where('subject_type', 'custom_record')->where('subject_id', $this->pasta->id)->exists());
    }
}
