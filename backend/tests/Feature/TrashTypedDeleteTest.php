<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\CastMember;
use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Role;
use App\Models\Song;
use App\Models\SongGenre;
use App\Models\TrashEntry;
use App\Models\User;
use App\Services\Purge\PurgeService;
use App\Services\Storage\StorageMeter;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use ReflectionMethod;
use Tests\TestCase;

/**
 * **აკრეფილი `DELETE` ურნაში (Tasks §29, ეტაპი 7 — 29.8, Q39 „ა").**
 *
 * ⚠️ მოწმდება ის, რაც ჩუმად ტყდება:
 *  · `/purge` **სამიზნის** ურნაში აგზავნის და არა ადმინისაში; ფაილი და კვოტა ადგილზეა;
 *  · **ანგარიშის წაშლა ნამდვილი რჩება** — ერთი და იგივე `PurgeService`, და
 *    „ურნა" რომ ნაგულისხმევი გამხდარიყო, ჩანაწერები ანგარიშთან ერთად SQL-კასკადით
 *    — მოვლენების გარეშე — წაიშლებოდა და ფაილები დისკზე ობლად დარჩებოდა (BUG-21);
 *  · მიმართულებას **ნაგულისხმევი არ აქვს** — ყოველი გამომძახებელი ცხადად ირჩევს;
 *  · კლასიფიკატორის „ჩანაწერებიც" ურნაშია და ჟანრის ბმული ორივე აღდგენის შემდეგ ისევ ადგილზეა;
 *  · აუდიტის გასუფთავება ურნაში **ერთი ელემენტია**, აღდგენას `admin:audit` სჭირდება.
 */
class TrashTypedDeleteTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        Storage::fake('public');
        Storage::fake('private');

        $this->admin = $this->makeUser('root');
        $this->admin->assignRole('super_admin')->save();
        $this->admin->refresh();

        $this->owner = $this->makeUser('nino');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name, 'username' => $name,
            'email' => "{$name}@example.com", 'password' => 'password',
        ]);
        $user->modules()->sync(Module::pluck('id')->all());

        return $user->refresh();
    }

    private function movieWithPoster(User $owner, string $title): Movie
    {
        Storage::disk('public')->put("movies/posters/{$title}.jpg", str_repeat('x', 400));

        $movie = Movie::withoutGlobalScopes()->create([
            'user_id' => $owner->id, 'year' => 2001,
            'poster_path' => "movies/posters/{$title}.jpg", 'poster_source' => 'upload',
        ]);
        $movie->translations()->create(['locale' => 'en', 'title' => $title]);

        return $movie;
    }

    /** `/purge` → სამიზნის ურნაში; ფაილი და კვოტა მისი ურნის დაცლამდე ადგილზეა */
    public function test_purge_sends_records_to_the_targets_trash(): void
    {
        $movie = $this->movieWithPoster($this->owner, 'Alien');
        app(StorageMeter::class)->recalculate($this->owner);

        $this->actingAs($this->admin)->postJson('/api/admin/purge', [
            'user_id' => $this->owner->id, 'target' => 'movie', 'mode' => 'all', 'confirm' => 'DELETE',
        ])->assertOk()->assertJsonPath('result.records', 1);

        Storage::disk('public')->assertExists('movies/posters/Alien.jpg');
        $this->assertSame(400, (int) $this->owner->refresh()->storage_used_bytes);

        // ⚠️ მფლობელის ურნაშია და არა ადმინისაში
        $ownerTrash = collect($this->actingAs($this->owner)->getJson('/api/trash')->json('data'))->firstWhere('kind', 'movie');
        $this->assertSame($movie->id, $ownerTrash['items'][0]['id']);
        $this->assertNull(collect($this->actingAs($this->admin)->getJson('/api/trash')->json('data'))->firstWhere('kind', 'movie'));

        // მფლობელი თავად აღადგენს
        $this->actingAs($this->owner)->postJson("/api/trash/movie/{$movie->id}/restore")->assertOk();
        $this->assertNotNull(Movie::withoutGlobalScope('owner')->find($movie->id));
    }

    /**
     * ⚠️ **ანგარიშის წაშლა ნამდვილია — ურნაში მყოფი ჩანაწერის ჩათვლით.**
     * ორივე რეჟიმი ერთსა და იმავე `PurgeService`-ზე დგას; აქ ფაილი რომ
     * დარჩენილიყო, ეს ზუსტად BUG-21 იქნებოდა.
     */
    public function test_account_deletion_still_deletes_for_good(): void
    {
        $live = $this->movieWithPoster($this->owner, 'Live');
        $trashed = $this->movieWithPoster($this->owner, 'Trashed');
        $trashed->moveToTrash();

        /* ⚠️ polymorphic ბმულებს FK არ აქვს — მათ მხოლოდ მოდელის `deleting`
           ხსნის. ფაილებს ანგარიშის წაშლის ბოლო ფენაც წმენდს (`files()`),
           ბმულებს კი — არა: „ურნაში" რომ წასულიყო, SQL-კასკადი ჩანაწერს
           წაშლიდა და ეს რიგები ობლად დარჩებოდა. */
        $genre = Genre::create(['slug' => 'horror']);
        $actor = CastMember::create(['tmdb_person_id' => 9, 'name' => 'Sigourney']);
        foreach ([$live, $trashed] as $movie) {
            $movie->genres()->sync([$genre->id]);
            $movie->castLinks()->sync([$actor->id => ['billing_order' => 0]]);
        }

        $this->actingAs($this->admin)->deleteJson("/api/admin/users/{$this->owner->id}")->assertNoContent();

        $this->assertNull(Movie::withoutGlobalScopes()->find($live->id));
        $this->assertNull(Movie::withoutGlobalScopes()->find($trashed->id));
        Storage::disk('public')->assertMissing('movies/posters/Live.jpg');
        Storage::disk('public')->assertMissing('movies/posters/Trashed.jpg');
        $this->assertSame(0, DB::table('genreables')->where('genreable_type', 'movie')->count());
        $this->assertSame(0, DB::table('castables')->where('castable_type', 'movie')->count());
    }

    /** ⚠️ მიმართულებას ნაგულისხმევი არ აქვს — გამომძახებელი ცხადად ირჩევს */
    public function test_the_destination_has_no_default(): void
    {
        foreach (['plan' => 2, 'runOne' => 3, 'run' => 2] as $method => $index) {
            $parameter = (new ReflectionMethod(PurgeService::class, $method))->getParameters()[$index];

            $this->assertSame('how', $parameter->getName(), $method);
            $this->assertFalse($parameter->isOptional(), "{$method}: `\$how` ნაგულისხმევის გარეშე უნდა იყოს");
        }
    }

    /**
     * კლასიფიკატორის „ჩანაწერებიც წაიშალოს" (pivot-ჟანრი) — სიმღერა ურნაშია,
     * ⚠️ ჟანრის ბმული **არ იხსნება**: ორივე აღდგენის შემდეგ სიმღერა ისევ ამ ჟანრშია.
     */
    public function test_deleting_a_genre_with_its_songs_keeps_the_link_for_the_trash(): void
    {
        $this->actingAs($this->owner);
        SongGenre::ensureDefaults($this->owner->id);
        $genre = SongGenre::query()->first();

        $song = Song::create(['title' => 'Song', 'url' => 'https://youtu.be/aaaaaaaaaaa']);
        $song->genres()->sync([$genre->id]);

        $this->deleteJson("/api/song-genres/{$genre->id}", ['delete_records' => true])
            ->assertOk()
            ->assertJsonPath('deleted', 1);

        $this->assertNull(Song::find($song->id));
        $this->assertNull(SongGenre::find($genre->id));

        $this->postJson("/api/trash/song_genre/{$genre->id}/restore")->assertOk();
        $this->postJson("/api/trash/song/{$song->id}/restore")->assertOk();

        $this->assertSame([$genre->id], Song::find($song->id)->genres()->pluck('song_genres.id')->all());
    }

    /**
     * აუდიტის გასუფთავება — **ერთი** ელემენტი; აღდგენა რიგებს ლოგში აბრუნებს,
     * საბოლოო წაშლა კი მათ FK-ის კასკადით შლის. დაცული რიგი ხელუხლებელია.
     */
    public function test_an_audit_cleanup_is_one_trash_item(): void
    {
        foreach (range(1, 5) as $i) {
            AuditLog::create(['action' => AuditLog::ACTION_UPDATE, 'module' => 'movie', 'subject_label' => "r{$i}", 'created_at' => now()]);
        }
        AuditLog::create(['action' => AuditLog::ACTION_CHAT_DELETE, 'module' => 'chat', 'created_at' => now()]);

        $this->actingAs($this->admin);
        $total = AuditLog::count();

        $moved = $this->deleteJson('/api/admin/audit', ['confirm' => 'DELETE'])->assertOk()->json('deleted');
        $this->assertSame($total - 1, $moved);

        // ლოგიდან ქრება, დაცული რჩება
        $this->assertSame(1, AuditLog::count());
        $this->assertSame(1, AuditLog::where('action', AuditLog::ACTION_CHAT_DELETE)->count());

        $group = collect($this->getJson('/api/trash')->json('data'))->firstWhere('kind', 'audit_log');
        $this->assertSame([1, 'audit', $moved, true], [$group['total'], $group['module'], $group['items'][0]['count'], $group['items'][0]['restorable']]);

        $this->postJson("/api/trash/audit_log/{$group['items'][0]['id']}/restore")->assertOk();
        // აღდგენა თვითონაც იწერება ლოგში — ამიტომ „მინიმუმ"
        $this->assertGreaterThanOrEqual($total, AuditLog::count());
        $this->assertSame(0, TrashEntry::withoutGlobalScope('owner')->count());

        // მეორე გასუფთავება და საბოლოო წაშლა — რიგები ბაზიდანაც ქრება
        $this->deleteJson('/api/admin/audit', ['confirm' => 'DELETE'])->assertOk();
        $entry = TrashEntry::withoutGlobalScope('owner')->sole();
        $this->deleteJson("/api/trash/audit_log/{$entry->id}")->assertNoContent();

        $this->assertSame(0, AuditLog::withoutGlobalScope('trash')->whereNotIn('action', AuditLog::PROTECTED_ACTIONS)->where('subject_label', 'like', 'r%')->count());
    }

    /** ⚠️ როლი რომ დაკარგოს — ელემენტი ჩანს, აღდგენა `admin:audit`-ს ითხოვს */
    public function test_restoring_an_audit_cleanup_needs_the_audit_right(): void
    {
        $role = Role::create([
            'key' => 'auditor', 'name_ka' => 'აუდიტორი', 'name_en' => 'Auditor',
            'permissions' => ['admin:audit' => ['view', 'delete']],
        ]);
        $auditor = $this->makeUser('auditor');
        $auditor->assignRole('auditor')->save();
        AuditLog::create(['action' => AuditLog::ACTION_UPDATE, 'module' => 'movie', 'created_at' => now()]);

        $this->actingAs($auditor->refresh())->deleteJson('/api/admin/audit', ['confirm' => 'DELETE'])->assertOk();

        $role->forceFill(['permissions' => []])->save();
        $auditor->refresh();

        $item = collect($this->actingAs($auditor)->getJson('/api/trash')->json('data'))->firstWhere('kind', 'audit_log')['items'][0];
        $this->assertSame([false, 'permission_missing'], [$item['restorable'], $item['blocked']]);

        $this->actingAs($auditor)->postJson("/api/trash/audit_log/{$item['id']}/restore")
            ->assertStatus(409)->assertJsonPath('message', 'permission_missing');
    }

    /** ვადის გასვლა აუდიტის ელემენტს მის რიგებთან ერთად შლის */
    public function test_prune_deletes_an_expired_audit_cleanup_with_its_rows(): void
    {
        AuditLog::create(['action' => AuditLog::ACTION_UPDATE, 'module' => 'movie', 'subject_label' => 'old', 'created_at' => now()]);
        $this->actingAs($this->admin)->deleteJson('/api/admin/audit', ['confirm' => 'DELETE'])->assertOk();

        TrashEntry::withoutGlobalScope('owner')->update(['trashed_at' => now()->subDays(40)]);
        $this->artisan('trash:prune')->assertSuccessful();

        $this->assertSame(0, TrashEntry::withoutGlobalScope('owner')->count());
        $this->assertSame(0, AuditLog::withoutGlobalScope('trash')->where('subject_label', 'old')->count());
    }
}
