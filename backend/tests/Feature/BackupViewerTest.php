<?php

namespace Tests\Feature;

use App\Models\DatabaseBackup;
use App\Models\User;
use App\Services\Backup\BackupInspector;
use App\Support\RestoreScope;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **Tasks §11 — ასლის ვიუერი და ნაწილობრივი აღდგენა.**
 *
 * ⚠️ **ცოცხალი იმპორტი აქ არ ეშვება** (ტესტები sqlite-ზეა და დროებითი
 * ბაზა MySQL-ის ფუნქციაა), ე.ი. ვამოწმებთ **ჩვენს** გადაწყვეტილებებს:
 * უფლებას, აკრძალულ ცხრილებს, აკრეფილ სიტყვასა და იმას, რომ ცხრილების
 * სია **აღდგენის გარეშეც** პასუხობს.
 */
class BackupViewerTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $plain;

    private DatabaseBackup $backup;

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

        $this->backup = DatabaseBackup::create([
            'user_id' => $this->admin->id,
            'name' => 'mediary.sql',
            'path' => 'backups/mediary.sql',
            'size' => 100,
            'tables' => 2,
            // §11.1 — დამპის ერთი გავლიდან; აღდგენას არ მოითხოვს
            'table_map' => [
                'movies' => ['bytes' => 4096, 'inserts' => 3],
                'users' => ['bytes' => 2048, 'inserts' => 1],
            ],
            'status' => DatabaseBackup::STATUS_READY,
            'driver' => 'mysql',
            'source' => DatabaseBackup::SOURCE_DUMP,
        ]);
    }

    /** ⚠️ ვიუერი მთელ ბაზას ხედავს — ე.ი. ერთი სექციის უფლება ვერ იქნება */
    public function test_a_plain_user_cannot_reach_the_viewer(): void
    {
        $this->actingAs($this->plain)
            ->getJson("/api/admin/backups/{$this->backup->id}/tables")
            ->assertForbidden();

        $this->actingAs($this->plain)
            ->postJson("/api/admin/backups/{$this->backup->id}/inspect")
            ->assertForbidden();
    }

    /**
     * **§11.1 — „რა ცხრილებს შეიცავს" აღდგენას არ მოითხოვს.**
     *
     * ⚠️ `database_backups.tables` ამას ვერ იტყოდა: ის **რიცხვია და არა სია**.
     */
    public function test_the_table_list_answers_without_importing_anything(): void
    {
        $response = $this->actingAs($this->admin)
            ->getJson("/api/admin/backups/{$this->backup->id}/tables")
            ->assertOk()
            ->assertJsonPath('open', false)
            ->assertJsonCount(2, 'data');

        $names = array_column($response->json('data'), 'name');
        $this->assertContains('movies', $names);
        $this->assertContains('users', $names);
    }

    /**
     * **§11.4 — `users` სრულად აკრძალულია** (შენი პასუხი).
     *
     * ⚠️ მასზე **61 შემომავალი უცხო გასაღები** მიდის, ე.ი. „მხოლოდ
     * users-ის აღდგენა" ყველა ანგარიშის მთელ ბიბლიოთეკას წაშლიდა.
     */
    public function test_blocked_tables_are_refused_before_anything_happens(): void
    {
        $this->assertTrue(RestoreScope::isBlocked('users'));
        $this->assertSame('blocked', RestoreScope::scopeFor('users'));

        $this->actingAs($this->admin)
            ->postJson("/api/admin/backups/{$this->backup->id}/restore-table", [
                'table' => 'users',
                'confirm' => 'users',
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'table_restore_blocked');
    }

    /**
     * **აკრეფილი სიტყვა ცხრილის საკუთარი სახელია და არა `RESTORE`.**
     *
     * ⚠️ ღილაკიდან გადმოსაწერი სიტყვა სუსტია: ის ყოველთვის ერთი და იგივეა.
     */
    public function test_the_typed_word_is_the_table_name(): void
    {
        $this->actingAs($this->admin)
            ->postJson("/api/admin/backups/{$this->backup->id}/restore-table", [
                'table' => 'movies',
                'confirm' => 'RESTORE',
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'confirm_table_name');
    }

    /**
     * **ინსტრუმენტის არქონა მდგომარეობაა და არა ავარია** — sqlite-ზე
     * (და იქ, სადაც `mysql` არ დგას) ვიუერი 503-ს აბრუნებს.
     */
    public function test_the_viewer_is_a_state_and_not_a_crash_without_mysql(): void
    {
        $this->actingAs($this->admin)
            ->postJson("/api/admin/backups/{$this->backup->id}/inspect")
            ->assertStatus(503)
            ->assertJsonPath('message', 'mysqldump_unavailable');

        // ჯერ არ გახსნილი ასლის რიგები — 503/409, მაგრამ არასდროს 500
        $this->actingAs($this->admin)
            ->getJson("/api/admin/backups/{$this->backup->id}/rows?table=movies")
            ->assertStatus(503);
    }

    /** ⚠️ `blocked` სია ხელით წერია — კოდის მიმოხილვაზე ის უნდა ჩანდეს */
    public function test_the_blocked_list_covers_the_infrastructure_tables(): void
    {
        foreach (['users', 'database_backups', 'migrations', 'sessions', 'cache', 'jobs'] as $table) {
            $this->assertTrue(RestoreScope::isBlocked($table), $table);
        }

        $this->assertFalse(RestoreScope::isBlocked('movies'));
    }

    /* ============================================================
       დროებითი ბაზის სიცოცხლე (Tasks GAP-16)
       ============================================================ */

    /**
     * **ასლის წაშლა ვიუერის ბაზასაც ხურავს.**
     *
     * ⚠️ `StoredFile` მხოლოდ **ფაილს** შლიდა, ე.ი. `<db>_inspect_<id>` MySQL-ში
     * სამუდამოდ რჩებოდა — და დახურვის ღილაკიც ქრებოდა მასთან ერთად, რადგან
     * ჩანაწერი აღარ არსებობდა. ეს მონაცემის სრული მეორე ასლია, კვოტის
     * გარეთ და პაროლის ჰეშებით.
     *
     * ⚠️ **ტესტი ინსპექტორს იცვლის და არა ბაზას**: ნამდვილი დროებითი ბაზა
     * MySQL-ის ფუნქციაა, ტესტები კი sqlite-ზეა (იხ. კლასის docblock) —
     * ე.ი. ამ დონეზე შესამოწმებელი ისაა, რომ **ჰუკი საერთოდ არსებობს**.
     */
    public function test_deleting_a_backup_closes_its_viewer(): void
    {
        $closed = new \ArrayObject;

        $this->app->bind(BackupInspector::class, fn () => new class($closed) extends BackupInspector
        {
            public function __construct(private \ArrayObject $seen) {}

            public function close(DatabaseBackup $backup): void
            {
                $this->seen->append((int) $backup->id);
            }
        });

        $id = (int) $this->backup->id;
        $this->backup->delete();

        $this->assertSame([$id], $closed->getArrayCopy());
    }

    /**
     * იგივე, endpoint-ის გავლით — ღილაკი „წაშლა" ნამდვილად ამ გზაზეა.
     */
    public function test_the_delete_endpoint_closes_the_viewer_too(): void
    {
        $closed = new \ArrayObject;

        $this->app->bind(BackupInspector::class, fn () => new class($closed) extends BackupInspector
        {
            public function __construct(private \ArrayObject $seen) {}

            public function close(DatabaseBackup $backup): void
            {
                $this->seen->append((int) $backup->id);
            }
        });

        $id = (int) $this->backup->id;

        $this->actingAs($this->admin)
            ->deleteJson("/api/admin/backups/{$id}")
            ->assertOk();

        $this->assertSame([$id], $closed->getArrayCopy());
    }

    /**
     * **ნამდვილი MySQL**: ნარჩენი `_inspect_` ბაზა იხურება.
     *
     * ⚠️ დამპის ნამდვილი იმპორტი აქ საჭირო არაა — შესამოწმებელია `close()`/
     * `pruneStale()`-ის SQL-ი, ე.ი. სქემას ხელით ვქმნით. sqlite-ზე ტესტი
     * გამოტოვებულია, რადგან `information_schema.schemata` იქ არ არსებობს.
     */
    public function test_an_orphaned_viewer_database_is_pruned_on_mysql(): void
    {
        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->markTestSkipped('დროებითი ბაზა MySQL-ის ფუნქციაა.');
        }

        $inspector = app(BackupInspector::class);
        // ⚠️ id, რომელსაც ჩანაწერი **არ** შეესაბამება — ზუსტად ის ნარჩენი,
        // რომელიც ძველ კოდში სამუდამოდ რჩებოდა
        $name = $inspector->databaseName(new DatabaseBackup(['id' => 999999]));

        DB::statement("create database if not exists `{$name}`");
        $this->assertNotSame([], $inspector->openDatabases());

        $inspector->pruneStale();

        $this->assertSame(
            [],
            array_filter($inspector->openDatabases(), fn (array $r) => $r['database'] === $name),
        );
    }
}
