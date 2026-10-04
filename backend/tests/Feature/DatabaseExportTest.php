<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Movie;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use ZipArchive;

/**
 * **Tasks §59.4 — მთლიანი ბაზის / ცხრილების ექსპორტი (სუპერადმინი).**
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
}
