<?php

namespace Tests\Feature;

use App\Models\DatabaseBackup;
use App\Models\User;
use App\Services\Backup\BackupRunner;
use App\Services\Backup\DatabaseDumper;
use App\Support\BackgroundProcess;
use App\Support\StorageFolder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

/**
 * Tasks §22 — ბაზის დამპი ადმინიდან.
 *
 * ⚠️ ცოცხალი `mysqldump` აქ არ ეშვება (ტესტები sqlite-ზეა): `DatabaseDumper`
 * იცვლება, ე.ი. ვამოწმებთ **ჩვენს** ლოგიკას — უფლებას, კვოტას, სტატუსებს
 * და იმას, რომ ფაილი პრივატულ დისკზე ჯდება.
 */
class DatabaseBackupTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $plain;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('private');

        $this->plain = User::create([
            'name' => 'kate', 'username' => 'kate',
            'email' => 'kate@example.com', 'password' => 'password',
        ]);

        $this->admin = User::create([
            'name' => 'boss', 'username' => 'boss',
            'email' => 'boss@example.com', 'password' => 'password',
        ]);
        $this->admin->assignRole('super_admin')->save();
    }

    /** ⚠️ დამპი მთელი ბაზაა — ჩვეულებრივი ანგარიში მასთან ვერ მივა */
    public function test_a_plain_user_cannot_reach_backups(): void
    {
        $this->actingAs($this->plain)->getJson('/api/admin/backups')->assertForbidden();
        $this->actingAs($this->plain)->postJson('/api/admin/backups')->assertForbidden();
    }

    /**
     * ⚠️ „ინსტრუმენტი არ მაქვს" **მდგომარეობაა და არა ავარია** —
     * `ytdlp_unavailable`-ის წესი.
     */
    public function test_a_missing_mysqldump_is_a_503_with_a_code(): void
    {
        $this->swap(DatabaseDumper::class, Mockery::mock(DatabaseDumper::class, [
            'available' => false,
            'restoreAvailable' => false,
            'driver' => 'sqlite',
        ]));

        $this->actingAs($this->admin)
            ->postJson('/api/admin/backups')
            ->assertStatus(503)
            ->assertJsonPath('message', 'mysqldump_unavailable');

        $this->assertDatabaseCount('database_backups', 0);
    }

    /**
     * ⚠️ **გაუშვებელი ფონური პროცესი ჩანაწერს არ ტოვებს.** დაწერილი, მაგრამ
     * არასდროს გაშვებული რიგი „მიმდინარეობს"-ად გამოჩნდებოდა და სამუდამოდ
     * ასე დარჩებოდა (§B1-ის ნასწავლი).
     */
    public function test_a_backup_that_cannot_start_leaves_no_row(): void
    {
        $this->swap(DatabaseDumper::class, Mockery::mock(DatabaseDumper::class, [
            'available' => true, 'restoreAvailable' => true, 'driver' => 'mysql',
        ]));
        $this->swap(BackgroundProcess::class, Mockery::mock(BackgroundProcess::class, ['dispatch' => false]));

        $this->actingAs($this->admin)
            ->postJson('/api/admin/backups')
            ->assertStatus(503)
            ->assertJsonPath('message', 'background_unavailable');

        $this->assertDatabaseCount('database_backups', 0);
    }

    public function test_starting_a_backup_creates_a_running_row(): void
    {
        $this->swap(DatabaseDumper::class, Mockery::mock(DatabaseDumper::class, [
            'available' => true, 'restoreAvailable' => true, 'driver' => 'mysql',
        ]));
        $this->swap(BackgroundProcess::class, Mockery::mock(BackgroundProcess::class, ['dispatch' => true]));

        $res = $this->actingAs($this->admin)
            ->postJson('/api/admin/backups', ['note' => 'before the trip'])
            ->assertCreated()
            ->assertJsonPath('data.status', 'running');

        $this->assertStringEndsWith('.sql.gz', $res->json('data.name'));
        $this->assertDatabaseHas('database_backups', ['user_id' => $this->admin->id, 'note' => 'before the trip']);
    }

    /**
     * **დამპი კვოტაში ითვლება** (შენი პირობა: „იმოქმედებს სტორიჯზე").
     * ⚠️ და ფაილი **პრივატულ დისკზე** ჯდება — `/storage/*`-ით მთელი ბაზა
     * ბმულის მცოდნისთვის ღია იქნებოდა.
     */
    public function test_a_finished_dump_is_private_and_counts_against_the_quota(): void
    {
        $backup = $this->runFakeDump('mediary-test.sql');

        $this->assertSame(DatabaseBackup::STATUS_READY, $backup->status);
        $this->assertStringStartsWith(StorageFolder::BACKUPS.'/', $backup->path);
        $this->assertTrue(StorageFolder::isPrivate($backup->path));
        Storage::disk('private')->assertExists($backup->path);

        $this->assertSame((int) $backup->size, (int) $this->admin->fresh()->storage_used_bytes);
        $this->assertGreaterThan(0, $backup->size);
    }

    /** წაშლა ფაილსაც შლის და ბაიტებსაც ათავისუფლებს (`StoredFile`) */
    public function test_deleting_a_backup_frees_the_file_and_the_quota(): void
    {
        $backup = $this->runFakeDump('mediary-test.sql');
        $path = $backup->path;

        $this->actingAs($this->admin)
            ->deleteJson('/api/admin/backups/'.$backup->id)
            ->assertOk();

        Storage::disk('private')->assertMissing($path);
        $this->assertSame(0, (int) $this->admin->fresh()->storage_used_bytes);
    }

    /** ჩამოტვირთვა ერთადერთი გზაა, რითაც ფაილი სერვერიდან გადის */
    public function test_a_ready_backup_can_be_downloaded(): void
    {
        $backup = $this->runFakeDump('mediary-test.sql');

        $this->actingAs($this->admin)
            ->get('/api/admin/backups/'.$backup->id.'/download')
            ->assertOk()
            ->assertDownload('mediary-test.sql');
    }

    /** ⚠️ აღდგენა დესტრუქციულია → აკრეფილი სიტყვის გარეშე 422 */
    public function test_restore_requires_the_typed_confirmation(): void
    {
        $backup = $this->runFakeDump('mediary-test.sql');

        $this->actingAs($this->admin)
            ->postJson('/api/admin/backups/'.$backup->id.'/restore')
            ->assertStatus(422);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/backups/'.$backup->id.'/restore', ['confirm' => 'DELETE'])
            ->assertStatus(422);
    }

    public function test_import_rejects_anything_that_is_not_sql(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/admin/backups/import', ['file' => UploadedFile::fake()->create('photo.png', 4)])
            ->assertStatus(422)
            ->assertJsonPath('message', 'invalid_backup_file');
    }

    /** ატვირთული ფაილი `upload`-ია და არა `dump` — მისი შიგთავსი ჯერ არაფრით შემოწმებულა */
    public function test_import_stores_the_file_as_an_upload(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/admin/backups/import', [
                'file' => UploadedFile::fake()->createWithContent('other-machine.sql', "CREATE TABLE a;\n"),
            ])
            ->assertCreated()
            ->assertJsonPath('data.source', 'upload')
            ->assertJsonPath('data.status', 'ready');

        $backup = DatabaseBackup::first();
        Storage::disk('private')->assertExists($backup->path);
        $this->assertSame((int) $backup->size, (int) $this->admin->fresh()->storage_used_bytes);
    }

    /** მიტოვებული `running` ცალკე ფაქტია — „მიმდინარეობს" სამუდამოდ ვერ ეწერება */
    public function test_a_dead_run_is_reported_as_stale(): void
    {
        $fresh = DatabaseBackup::create([
            'user_id' => $this->admin->id, 'name' => 'a.sql',
            'status' => DatabaseBackup::STATUS_RUNNING, 'started_at' => now(),
        ]);
        $dead = DatabaseBackup::create([
            'user_id' => $this->admin->id, 'name' => 'b.sql',
            'status' => DatabaseBackup::STATUS_RUNNING,
            'started_at' => now()->subMinutes(DatabaseBackup::STALE_MINUTES + 5),
        ]);

        $this->assertFalse($fresh->stale());
        $this->assertTrue($dead->stale());

        // ⚠️ საწყისი დროის გარეშე რიგიც მიტოვებულია და არა „მარადიულად მიმდინარე"
        $dead->forceFill(['started_at' => null])->save();
        $this->assertTrue($dead->fresh()->stale());
    }

    /** ჩავარდნილი დამპი მიზეზს ინახავს და ფაილს არ ტოვებს */
    public function test_a_failed_dump_records_the_reason(): void
    {
        $dumper = Mockery::mock(DatabaseDumper::class);
        $dumper->shouldReceive('driver')->andReturn('mysql');
        $dumper->shouldReceive('dump')->andThrow(new \RuntimeException('Unknown database'));
        $this->swap(DatabaseDumper::class, $dumper);

        $backup = DatabaseBackup::create([
            'user_id' => $this->admin->id, 'name' => 'x.sql',
            'status' => DatabaseBackup::STATUS_RUNNING, 'started_at' => now(),
        ]);

        app(BackupRunner::class)->dump($backup);

        $this->assertSame(DatabaseBackup::STATUS_FAILED, $backup->fresh()->status);
        $this->assertStringContainsString('Unknown database', $backup->fresh()->error);
        $this->assertSame(0, (int) $this->admin->fresh()->storage_used_bytes);
    }

    /**
     * `DatabaseDumper`-ის ნაცვლად ფაილს ჩვენ ვწერთ — შემდეგ ყველაფერი
     * ჩვეულებრივ გზაზეა (კვოტა, დისკი, სტატუსი).
     */
    private function runFakeDump(string $name): DatabaseBackup
    {
        $dumper = Mockery::mock(DatabaseDumper::class);
        $dumper->shouldReceive('driver')->andReturn('mysql');
        $dumper->shouldReceive('dump')->andReturnUsing(function (string $path) {
            file_put_contents($path, str_repeat("CREATE TABLE movies (id int);\n", 20));

            return ['tables' => 1];
        });
        $this->swap(DatabaseDumper::class, $dumper);

        $backup = DatabaseBackup::create([
            'user_id' => $this->admin->id,
            'name' => $name,
            'status' => DatabaseBackup::STATUS_RUNNING,
            'started_at' => now(),
        ]);

        app(BackupRunner::class)->dump($backup);

        return $backup->fresh();
    }
}
