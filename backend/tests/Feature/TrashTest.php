<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Bookmark;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Status;
use App\Models\User;
use App\Models\Video;
use App\Models\VideoFile;
use App\Support\TrashDomain;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * **კალათა (FEAT-11).**
 *
 * ⚠️ **მთავარი, რასაც ეს ტესტები იცავენ, ორი ურთიერთსაპირისპირო ფაქტია:**
 * ჩვეულებრივი წაშლა **არაფერს** ანადგურებს (ფაილი, კვოტა, მიბმები ადგილზეა,
 * ე.ი. აღდგენა ნამდვილად უფასოა) — და `/purge`, ანგარიშის წაშლა და ვადის
 * ამოწურვა **მაინც** შლის, კალათაში მყოფის ჩათვლით. მეორე რომ გაფუჭდეს,
 * ობოლი ფაილები დისკზე დარჩება და კვოტა სამუდამოდ დაკავებული იქნება.
 */
class TrashTest extends TestCase
{
    use RefreshDatabase;

    private User $me;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->me = User::create([
            'name' => 'bin', 'username' => 'bin',
            'email' => 'bin@example.com', 'password' => 'password',
        ]);
        $this->me->modules()->sync(Module::pluck('id')->all());
        $this->me->refresh();
    }

    private function movie(string $title = 'Gone'): Movie
    {
        $movie = Movie::create(['user_id' => $this->me->id, 'year' => 2001]);
        $movie->translations()->create(['locale' => 'en', 'title' => $title]);

        return $movie->refresh();
    }

    /* ---------- ძირითადი ქცევა ---------- */

    /** წაშლილი ჩანაწერი სიაში აღარაა, ბაზაში კი — არის */
    public function test_deleting_a_record_hides_it_without_removing_the_row(): void
    {
        $movie = $this->movie();

        $this->actingAs($this->me)->deleteJson("/api/movies/{$movie->id}")->assertNoContent();

        $this->assertDatabaseHas('movies', ['id' => $movie->id]);
        $this->assertNull(Movie::find($movie->id), 'trash scope ვერ მალავს');

        $list = $this->actingAs($this->me)->getJson('/api/movies')->assertOk()->json('data');
        $this->assertSame([], $list);
    }

    /**
     * ⚠️ **ეს ტესტი კალათის მთელ აზრს ინახავს.** თუ წაშლა ფაილს დისკიდან
     * ხსნის და კვოტას ათავისუფლებს, მაშინ „აღდგენა" ნახევრად გატეხილ
     * ჩანაწერს დააბრუნებდა — სწორედ ამიტომ არ არის კალათა `delete()`.
     */
    public function test_trashing_keeps_files_links_and_the_quota_untouched(): void
    {
        $video = Video::create(['user_id' => $this->me->id, 'title' => 'v', 'url' => 'https://example.com/v']);
        $file = VideoFile::create([
            'user_id' => $this->me->id, 'video_id' => $video->id,
            'kind' => 'doc', 'path' => 'videos/files/docs/x.pdf', 'name' => 'x.pdf', 'size' => 100,
        ]);

        $this->me->forceFill(['storage_used_bytes' => 100])->save();

        $this->actingAs($this->me)->deleteJson("/api/videos/{$video->id}")->assertNoContent();

        $this->assertDatabaseHas('video_files', ['id' => $file->id]);
        $this->assertSame(100, (int) $this->me->refresh()->storage_used_bytes);
    }

    /** კალათა აჩვენებს წაშლილს და აღდგენა მუშაობს */
    public function test_the_trash_lists_the_record_and_restores_it(): void
    {
        $movie = $this->movie('Restored');

        $this->actingAs($this->me)->deleteJson("/api/movies/{$movie->id}")->assertNoContent();

        $groups = $this->actingAs($this->me)->getJson('/api/trash')->assertOk()->json('data');
        $this->assertCount(1, $groups);
        $this->assertSame('movie', $groups[0]['domain']);
        $this->assertSame('Restored', $groups[0]['items'][0]['title']);

        $this->actingAs($this->me)
            ->postJson("/api/trash/movie/{$movie->id}/restore")
            ->assertOk()
            ->assertJson(['restored' => true]);

        $this->assertNotNull(Movie::find($movie->id));
        $this->assertSame([], $this->actingAs($this->me)->getJson('/api/trash')->json('data'));
    }

    /** კალათიდან წაშლა ნამდვილია — ფაილიც და კვოტაც თავისუფლდება */
    public function test_deleting_from_the_trash_is_permanent(): void
    {
        $video = Video::create(['user_id' => $this->me->id, 'title' => 'v', 'url' => 'https://example.com/v']);
        VideoFile::create([
            'user_id' => $this->me->id, 'video_id' => $video->id,
            'kind' => 'doc', 'path' => 'videos/files/docs/y.pdf', 'name' => 'y.pdf', 'size' => 100,
        ]);
        $this->me->forceFill(['storage_used_bytes' => 100])->save();

        $this->actingAs($this->me)->deleteJson("/api/videos/{$video->id}")->assertNoContent();
        $this->actingAs($this->me)->deleteJson("/api/trash/video/{$video->id}")->assertNoContent();

        $this->assertDatabaseMissing('videos', ['id' => $video->id]);
        $this->assertDatabaseMissing('video_files', ['video_id' => $video->id]);
        $this->assertSame(0, (int) $this->me->refresh()->storage_used_bytes);
    }

    /** დაცლას აკრეფილი `DELETE` სჭირდება */
    public function test_emptying_the_trash_needs_the_typed_word(): void
    {
        $movie = $this->movie();
        $this->actingAs($this->me)->deleteJson("/api/movies/{$movie->id}")->assertNoContent();

        $this->actingAs($this->me)->deleteJson('/api/trash', [])->assertStatus(422);
        $this->assertDatabaseHas('movies', ['id' => $movie->id]);

        $this->actingAs($this->me)
            ->deleteJson('/api/trash', ['confirm' => 'DELETE'])
            ->assertOk()
            ->assertJson(['deleted' => 1]);

        $this->assertDatabaseMissing('movies', ['id' => $movie->id]);
    }

    /* ---------- ის, რაც კალათას **უნდა** გვერდი აუაროს ---------- */

    /**
     * ⚠️ **`/purge` კალათაში მყოფსაც შლის.** გამოტოვება ორ რამეს გააფუჭებდა:
     * „წაშალე ყველაფერი" ჩუმად დატოვებდა ნაწილს, ხოლო ანგარიშის წაშლისას
     * ობოლი ფაილები დისკზე დარჩებოდა (BUG-21-ის ზუსტი განმეორება).
     */
    public function test_purge_still_deletes_a_trashed_record(): void
    {
        $admin = User::create([
            'name' => 'root', 'username' => 'root',
            'email' => 'root@example.com', 'password' => 'password',
        ]);
        $admin->assignRole('super_admin')->save();

        $movie = $this->movie();
        $this->actingAs($this->me)->deleteJson("/api/movies/{$movie->id}")->assertNoContent();

        $this->actingAs($admin)->postJson('/api/admin/purge', [
            'user_id' => $this->me->id,
            'target' => 'movie',
            'mode' => 'all',
            'confirm' => 'DELETE',
        ])->assertOk();

        $this->assertDatabaseMissing('movies', ['id' => $movie->id]);
    }

    /** ვადაგასული ჩანაწერი ნამდვილად იშლება, ახალი — რჩება */
    public function test_prune_deletes_only_what_has_expired(): void
    {
        $old = $this->movie('Old');
        $fresh = $this->movie('Fresh');

        $this->actingAs($this->me)->deleteJson("/api/movies/{$old->id}")->assertNoContent();
        $this->actingAs($this->me)->deleteJson("/api/movies/{$fresh->id}")->assertNoContent();

        Movie::withoutGlobalScopes(['owner', 'trash'])
            ->where('id', $old->id)
            ->update(['trashed_at' => now()->subDays(TrashDomain::KEEP_DAYS + 1)]);

        $this->artisan('trash:prune')->assertSuccessful();

        $this->assertDatabaseMissing('movies', ['id' => $old->id]);
        $this->assertDatabaseHas('movies', ['id' => $fresh->id]);
    }

    /* ---------- საზღვრები ---------- */

    /** სხვისი კალათა 404-ია და არა 403 */
    public function test_another_users_trashed_record_is_a_404(): void
    {
        $other = User::create([
            'name' => 'nosy', 'username' => 'nosy',
            'email' => 'nosy@example.com', 'password' => 'password',
        ]);
        $other->modules()->sync(Module::pluck('id')->all());

        $movie = $this->movie();
        $this->actingAs($this->me)->deleteJson("/api/movies/{$movie->id}")->assertNoContent();

        $this->actingAs($other->refresh())
            ->postJson("/api/trash/movie/{$movie->id}/restore")
            ->assertStatus(404);

        $this->assertNotNull(Movie::withoutGlobalScopes(['owner', 'trash'])->find($movie->id)->trashed_at);
    }

    /**
     * ⚠️ **წაშლა ჟურნალში უნდა ჩანდეს.** კალათაში გადატანა `deleted`
     * მოვლენას **არ** ისვრის, ე.ი. ჩანაწერის გარეშე ლოგი 30 დღე ვერ
     * უპასუხებდა კითხვას „ვინ წაშალა" — სწორედ იმას, რისთვისაც არსებობს.
     */
    public function test_trashing_and_restoring_are_both_in_the_audit_log(): void
    {
        $movie = $this->movie();

        $this->actingAs($this->me)->deleteJson("/api/movies/{$movie->id}")->assertNoContent();
        $this->actingAs($this->me)->postJson("/api/trash/movie/{$movie->id}/restore")->assertOk();

        $actions = AuditLog::where('subject_type', 'movie')
            ->where('subject_id', $movie->id)
            ->pluck('action')
            ->all();

        $this->assertContains(AuditLog::ACTION_DELETE, $actions);
        $this->assertContains(AuditLog::ACTION_RESTORE, $actions);
    }

    /**
     * ⚠️ **ყველა დომენს აქვს კალათა** — ერთი გამორჩენილი მოდული ჩუმია:
     * მისი წაშლა ისევ მყისიერი იქნებოდა და მომხმარებელი ამას მხოლოდ
     * მაშინ გაიგებდა, როცა უკან დაბრუნება მოუნდებოდა.
     */
    public function test_every_record_domain_has_the_column_and_the_scope(): void
    {
        foreach (TrashDomain::MODELS as $domain => $model) {
            $instance = new $model;

            $this->assertTrue(
                Schema::hasColumn($instance->getTable(), 'trashed_at'),
                "{$domain}: trashed_at სვეტი აკლია",
            );
            $this->assertArrayHasKey(
                'trash',
                $instance->getGlobalScopes(),
                "{$domain}: trash scope არ არის",
            );
        }
    }

    /** სტატუსის მქონე დომენზეც იგივე წესია — და ვადა სერვერიდან მოდის */
    public function test_the_response_states_how_long_a_record_is_kept(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-19 12:00:00', 'UTC'));

        Status::ensureDefaults($this->me->id, 'bookmark');
        $bookmark = Bookmark::create([
            'user_id' => $this->me->id, 'title' => 'b', 'url' => 'https://example.com',
        ]);

        $this->actingAs($this->me)->deleteJson("/api/bookmarks/{$bookmark->id}")->assertNoContent();

        $payload = $this->actingAs($this->me)->getJson('/api/trash')->assertOk()->json();

        $this->assertSame(TrashDomain::KEEP_DAYS, $payload['keep_days']);
        $this->assertSame(TrashDomain::KEEP_DAYS, $payload['data'][0]['items'][0]['expires_in_days']);

        Carbon::setTestNow();
    }
}
