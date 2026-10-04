<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\DatabaseBackup;
use App\Models\Movie;
use App\Models\User;
use App\Models\Video;
use App\Services\Backup\DatabaseDumper;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;
use ZipArchive;

/**
 * **Tasks §59.4 — მთლიანი ბაზის / ცხრილების ექსპორტი (სუპერადმინი)** და
 * **§59.6ბ — იმავე JSON-ის ZIP-ით ცხრილების ჩანაცვლება** (უსაფრთხოების ასლით).
 */
class DatabaseExportTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        $this->admin = User::factory()->create();
        $this->admin->assignRole('super_admin')->save();
        $this->admin->refresh();
    }

    public function test_only_the_super_admin_sees_and_exports_the_database(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $this->getJson('/api/admin/database/tables')->assertForbidden();
        $this->postJson('/api/admin/database/export', ['tables' => ['movies'], 'format' => 'json'])->assertForbidden();
    }

    public function test_tables_come_with_their_owner_rows_and_what_they_need(): void
    {
        $this->actingAs($this->admin);
        Movie::create(['user_id' => $this->admin->id])->setTranslation('en', ['title' => 'Alien']);

        $rows = collect($this->getJson('/api/admin/database/tables')->assertOk()->json('data'))->keyBy('table');

        $this->assertSame('movie', $rows['movies']['owner']);
        $this->assertSame(1, $rows['movies']['rows']);
        $this->assertContains('movie_translations', $rows['movies']['requires']);
        $this->assertContains('genreables', $rows['movies']['requires']);
        $this->assertSame('shared:genres', $rows['genreables']['owner']);
        $this->assertSame('system', $rows['users']['owner']);
        $this->assertTrue($rows['users']['sensitive']);
        $this->assertFalse($rows['movies']['sensitive']);
    }

    /** JSON-ის ZIP: ცხრილი = ფაილი, `closure` საჭიროებებსაც უმატებს, manifest — რიგების რიცხვით */
    public function test_a_json_zip_holds_the_chosen_tables_and_what_they_need(): void
    {
        $this->actingAs($this->admin);
        $movie = Movie::create(['user_id' => $this->admin->id]);
        $movie->setTranslation('en', ['title' => 'Alien']);

        $res = $this->post('/api/admin/database/export', ['tables' => ['movies'], 'format' => 'json', 'closure' => 1]);
        $res->assertOk();
        $path = $res->baseResponse->getFile()->getPathname();

        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path) === true);
        $manifest = json_decode((string) $zip->getFromName('manifest.json'), true);
        $this->assertSame('mediary', $manifest['app']);
        $this->assertSame(1, $manifest['tables']['movies']);
        $this->assertArrayHasKey('movie_translations', $manifest['tables']);
        $this->assertArrayHasKey('genreables', $manifest['tables']);
        $this->assertArrayNotHasKey('users', $manifest['tables']);

        $movies = json_decode((string) $zip->getFromName('tables/movies.json'), true);
        $this->assertSame($movie->id, $movies[0]['id']);
        $translations = json_decode((string) $zip->getFromName('tables/movie_translations.json'), true);
        $this->assertSame('Alien', $translations[0]['title']);
        $zip->close();
        @unlink($path);

        $this->assertSame(1, AuditLog::where('action', AuditLog::ACTION_EXPORT)->where('module', 'database')->count());
    }

    public function test_an_unknown_table_is_refused_and_sql_needs_mysqldump(): void
    {
        $this->actingAs($this->admin);

        $this->postJson('/api/admin/database/export', ['tables' => ['movies', 'nope; drop table users'], 'format' => 'json'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'unknown_table');

        // ტესტებში `mysqldump` არ არის (sqlite) — 503 და არა ცარიელი ფაილი
        $this->postJson('/api/admin/database/export', ['tables' => ['movies'], 'format' => 'sql'])
            ->assertStatus(503)
            ->assertJsonPath('message', 'mysqldump_unavailable');
    }

    /* ---------- §59.6ბ — ჩანაცვლება JSON-ის ZIP-ით ---------- */

    public function test_only_the_super_admin_replaces_tables(): void
    {
        $this->actingAs(User::factory()->create());

        $this->post('/api/admin/database/import', [])->assertForbidden();
        $this->postJson('/api/admin/database/import/'.str_repeat('a', 40), ['tables' => ['movies'], 'confirm' => 'REPLACE'])
            ->assertForbidden();
    }

    /**
     * ⚠️ ჩანაცვლება: აკრეფილი `REPLACE`, ჯერ შემოწმება (აკრძალულ ცხრილზე ასლიც კი
     * არ იქმნება), მერე **უსაფრთხოების ასლი**, მერე ცხრილი არქივის რიგებით.
     */
    public function test_a_json_archive_replaces_the_chosen_tables_after_a_safety_backup(): void
    {
        Storage::fake('local');
        Storage::fake('private');
        $this->fakeDumper();
        $this->actingAs($this->admin);

        $video = Video::create(['user_id' => $this->admin->id, 'title' => 'Talk', 'url' => 'https://example.com/v']);
        $video->notes()->create(['user_id' => $this->admin->id, 'body' => 'original']);

        $res = $this->post('/api/admin/database/export', ['tables' => ['video_notes', 'users'], 'format' => 'json'])->assertOk();
        $zipPath = $res->baseResponse->getFile()->getPathname();

        // ბაზა მერე შეიცვალა
        DB::table('video_notes')->delete();
        $video->notes()->create(['user_id' => $this->admin->id, 'body' => 'later']);

        $inspect = $this->post('/api/admin/database/import', [
            'file' => new UploadedFile($zipPath, 'mediary-database.zip', 'application/zip', null, true),
        ])->assertOk()->json();
        @unlink($zipPath);

        $tables = collect($inspect['tables'])->keyBy('table');
        $this->assertSame(1, $tables['video_notes']['rows']);
        $this->assertTrue($tables['video_notes']['exists']);
        $this->assertFalse($tables['video_notes']['blocked']);
        $this->assertTrue($tables['users']['blocked']);

        $url = '/api/admin/database/import/'.$inspect['token'];
        $backups = DatabaseBackup::count();

        $this->postJson($url, ['tables' => ['video_notes'], 'confirm' => 'yes'])->assertStatus(422);
        $this->postJson($url, ['tables' => ['users'], 'confirm' => 'REPLACE'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'table_restore_blocked');
        $this->assertSame($backups, DatabaseBackup::count());

        $result = $this->postJson($url, ['tables' => ['video_notes'], 'confirm' => 'REPLACE'])->assertOk()->json();

        $this->assertSame(['deleted' => 1, 'inserted' => 1, 'dropped_columns' => []], $result['data']['video_notes']);
        $this->assertSame(['original'], DB::table('video_notes')->pluck('body')->all());
        $this->assertSame($backups + 1, DatabaseBackup::count());
        $this->assertSame($result['safety_backup_id'], DatabaseBackup::max('id'));
        $this->assertTrue(AuditLog::where('action', AuditLog::ACTION_IMPORT)->where('module', 'database')->exists());

        // ატვირთული არქივი ჩანაცვლების შემდეგ იშლება
        $this->postJson($url, ['tables' => ['video_notes'], 'confirm' => 'REPLACE'])->assertStatus(410);
    }

    /** „ჩემი სრული ექსპორტის" ZIP აქ არ შემოდის — ის ჩვეულებრივ იმპორტშია (დამატებით) */
    public function test_a_library_archive_is_refused_here(): void
    {
        Storage::fake('local');
        $this->actingAs($this->admin);

        $path = tempnam(sys_get_temp_dir(), 'mediary-lib-').'.zip';
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        $zip->addFromString('manifest.json', (string) json_encode(['app' => 'mediary', 'kind' => 'library', 'format' => 1]));
        $zip->close();

        $this->post('/api/admin/database/import', ['file' => new UploadedFile($path, 'mediary-all.zip', 'application/zip', null, true)])
            ->assertStatus(422)
            ->assertJsonPath('message', 'database_archive_library');
    }

    /** `DatabaseDumper`-ის ყალბი — უსაფრთხოების ასლი ჩვეულებრივ გზაზე (`DatabaseBackupTest`-ის წესი) */
    private function fakeDumper(): void
    {
        $dumper = Mockery::mock(DatabaseDumper::class);
        $dumper->shouldReceive('available')->andReturn(true);
        $dumper->shouldReceive('restoreAvailable')->andReturn(true);
        $dumper->shouldReceive('driver')->andReturn('mysql');
        $dumper->shouldReceive('dump')->andReturnUsing(function (string $path) {
            file_put_contents($path, str_repeat("CREATE TABLE movies (id int);\n", 20));

            return ['tables' => 1];
        });

        $this->swap(DatabaseDumper::class, $dumper);
    }
}
