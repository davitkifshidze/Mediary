<?php

namespace Tests\Feature;

use App\Models\BoardGame;
use App\Models\Book;
use App\Models\CastMember;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\Game;
use App\Models\MediaWatch;
use App\Models\Module;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\NoteReminder;
use App\Models\Playlist;
use App\Models\Song;
use App\Models\TrashEntry;
use App\Models\User;
use App\Models\Video;
use App\Services\Notes\ReminderDispatcher;
use App\Support\AlbumLock;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * **ურნა ჩანაწერის ნაწილებზე (Tasks §29, ეტაპი 2).**
 *
 * ⚠️ ყოველ ნაწილს თავისი გვერდითი ეფექტი აქვს და სწორედ ისინი მოწმდება:
 * ურნაში მყოფი ნახვა „ბოლო ნახვას" აღარ ცვლის, ურნაში მყოფი შეხსენება
 * არ ისვრის (და ჩანაწერის ურნაში ყოფნა მას **არ** თიშავს), ალბომის
 * აღდგენა ფოტოებს უკან აბრუნებს და თავიდან კეტავს, მსახიობის ბმულის
 * აღდგენა როლს ინარჩუნებს და TMDB-ის საფლავის ქვა ურნის შემდეგაც რჩება.
 */
class TrashPartsTest extends TestCase
{
    use RefreshDatabase;

    private User $me;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        Storage::fake('public');
        Storage::fake('private');

        $this->me = User::create([
            'name' => 'parts', 'username' => 'parts',
            'email' => 'parts@example.com', 'password' => 'password',
        ]);
        $this->me->modules()->sync(Module::pluck('id')->all());
        $this->me->refresh();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /** @return array<string, mixed>|null */
    private function group(string $kind): ?array
    {
        return collect($this->actingAs($this->me)->getJson('/api/trash')->assertOk()->json('data'))
            ->firstWhere('kind', $kind);
    }

    /* ---------- ჩანიშვნები ---------- */

    /** @return array<string, array{0: string}> */
    public static function noteKinds(): array
    {
        return [
            'video' => ['video_note'],
            'book' => ['book_note'],
            'game' => ['game_note'],
            'board game' => ['board_game_note'],
        ];
    }

    #[DataProvider('noteKinds')]
    public function test_a_note_goes_to_the_trash_and_back(string $kind): void
    {
        [$parent, $list, $delete] = match ($kind) {
            'video_note' => [Video::create(['user_id' => $this->me->id, 'title' => 'v', 'url' => 'https://youtu.be/dQw4w9WgXcQ']), 'videos', 'video-notes'],
            'book_note' => [Book::create(['user_id' => $this->me->id, 'title_en' => 'b']), 'books', 'book-notes'],
            'game_note' => [Game::create(['user_id' => $this->me->id, 'title_en' => 'g']), 'games', 'game-notes'],
            'board_game_note' => [BoardGame::create(['user_id' => $this->me->id, 'title' => 'bg']), 'board-games', 'board-game-notes'],
        };

        $note = $parent->notes()->create(['user_id' => $this->me->id, 'body' => 'ეს ფილმი მშვენიერია და კიდევ ბევრი სიტყვა']);

        $this->actingAs($this->me)->deleteJson("/api/{$delete}/{$note->id}")->assertNoContent();

        $this->assertNotNull($note::withoutGlobalScopes()->find($note->id)?->trashed_at);
        $this->actingAs($this->me)->getJson("/api/{$list}/{$parent->id}/notes")->assertOk()->assertJsonCount(0, 'data');

        $item = $this->group($kind)['items'][0];
        $this->assertSame('ეს ფილმი მშვენიერია და კიდევ ბევრი სიტყვა', $item['title']);

        $this->actingAs($this->me)->postJson("/api/trash/{$kind}/{$note->id}/restore")->assertOk();
        $this->actingAs($this->me)->getJson("/api/{$list}/{$parent->id}/notes")->assertOk()->assertJsonCount(1, 'data');
    }

    /* ---------- თამაშის ვიდეო და ფლეილისტი ---------- */

    public function test_a_game_video_goes_to_the_trash_and_back(): void
    {
        $game = Game::create(['user_id' => $this->me->id, 'title_en' => 'g']);
        $video = $game->videos()->create(['user_id' => $this->me->id, 'title' => 'Walkthrough', 'url' => 'https://youtu.be/dQw4w9WgXcQ', 'kind' => 'walkthrough']);

        $this->actingAs($this->me)->deleteJson("/api/game-videos/{$video->id}")->assertNoContent();
        $this->actingAs($this->me)->getJson("/api/games/{$game->id}/videos")->assertOk()->assertJsonCount(0, 'data');
        $this->assertSame('Walkthrough', $this->group('game_video')['items'][0]['title']);

        $this->actingAs($this->me)->postJson("/api/trash/game_video/{$video->id}/restore")->assertOk();
        $this->actingAs($this->me)->getJson("/api/games/{$game->id}/videos")->assertOk()->assertJsonCount(1, 'data');
    }

    /** ⚠️ ფლეილისტის pivot ადგილზე რჩება — აღდგენა სიმღერებს იმავე რიგით აბრუნებს */
    public function test_a_playlist_comes_back_with_its_songs_in_order(): void
    {
        $a = Song::create(['user_id' => $this->me->id, 'title' => 'a', 'url' => 'https://youtu.be/dQw4w9WgXcQ']);
        $b = Song::create(['user_id' => $this->me->id, 'title' => 'b', 'url' => 'https://youtu.be/dQw4w9WgXcQ']);
        $playlist = Playlist::create(['user_id' => $this->me->id, 'name' => 'Road']);
        $playlist->songs()->attach([$b->id => ['sort_order' => 0], $a->id => ['sort_order' => 1]]);

        $this->actingAs($this->me)->deleteJson("/api/playlists/{$playlist->id}")->assertNoContent();
        $this->actingAs($this->me)->getJson('/api/playlists')->assertOk()->assertJsonCount(0, 'data');

        $this->actingAs($this->me)->postJson("/api/trash/playlist/{$playlist->id}/restore")->assertOk();

        $songs = $this->actingAs($this->me)->getJson("/api/playlists/{$playlist->id}")->assertOk()->json('data.songs');
        $this->assertSame(['b', 'a'], array_column($songs, 'title'));
    }

    /* ---------- შეხსენება ---------- */

    /**
     * ⚠️ **ურნაში მყოფი შეხსენება არ ისვრის, აღდგენა კი `next_at`-ს თავიდან ითვლის** —
     * ძველი მომენტი დაბრუნებისთანავე ყველა გამოტოვებულს ერთად ისვრიდა.
     */
    public function test_a_trashed_reminder_never_fires_and_comes_back_rescheduled(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-04 12:00:00', 'UTC'));
        $note = NoteEntry::create(['user_id' => $this->me->id, 'title' => 'Pay rent']);
        $reminder = $note->reminders()->create([
            'user_id' => $this->me->id, 'mode' => 'daily', 'times_of_day' => ['09:00'],
            'timezone' => 'Asia/Tbilisi', 'channels' => ['browser'], 'is_active' => true,
        ]);
        $reminder->forceFill(['next_at' => $reminder->computeNextAt()])->save();

        $this->actingAs($this->me)->deleteJson("/api/note-reminders/{$reminder->id}")->assertNoContent();

        // ორი დღე გავიდა — ურნაში მყოფი არ ისროლა
        Carbon::setTestNow(Carbon::parse('2026-09-06 12:00:00', 'UTC'));
        $this->assertSame(0, app(ReminderDispatcher::class)->run());

        $item = $this->group('note_reminder')['items'][0];
        $this->assertSame('Pay rent', $item['title']);
        $this->assertNotNull($item['when']);

        $this->actingAs($this->me)->postJson("/api/trash/note_reminder/{$reminder->id}/restore")->assertOk();

        $this->assertTrue($reminder->refresh()->next_at->greaterThan(now()), 'ვადაგასული მომენტი დარჩა');
    }

    /**
     * ⚠️ **ჩანაწერის ურნაში ყოფნა მის შეხსენებას არ თიშავს** — ადრე
     * `noteEntry` ცარიელი მოდიოდა და შეხსენება სამუდამოდ ითიშებოდა.
     */
    public function test_a_trashed_notes_reminder_survives_and_comes_back_rescheduled(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-04 12:00:00', 'UTC'));
        $note = NoteEntry::create(['user_id' => $this->me->id, 'title' => 'n']);
        $reminder = $note->reminders()->create([
            'user_id' => $this->me->id, 'mode' => 'daily', 'times_of_day' => ['09:00'],
            'timezone' => 'Asia/Tbilisi', 'channels' => ['browser'], 'is_active' => true,
        ]);
        $reminder->forceFill(['next_at' => $reminder->computeNextAt()])->save();

        $this->actingAs($this->me)->deleteJson("/api/notes/{$note->id}")->assertNoContent();

        Carbon::setTestNow(Carbon::parse('2026-09-06 12:00:00', 'UTC'));
        $this->assertSame(0, app(ReminderDispatcher::class)->run());
        $this->assertTrue($reminder->refresh()->is_active, 'ურნაში მყოფი ჩანაწერის შეხსენება გაითიშა');

        $this->actingAs($this->me)->postJson("/api/trash/note/{$note->id}/restore")->assertOk();
        $this->assertTrue($reminder->refresh()->next_at->greaterThan(now()));
    }

    /* ---------- ყურების ჟურნალი ---------- */

    /**
     * ⚠️ **ურნაში მყოფი ნახვა „ბოლო ნახვაში" და სტატისტიკაში აღარ ითვლება**,
     * აღდგენა კი მას უკან აბრუნებს.
     */
    public function test_a_trashed_watch_leaves_the_last_watched_and_the_stats(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-01-10 12:00:00', 'UTC'));
        $movie = Movie::create(['user_id' => $this->me->id, 'year' => 2001]);
        $this->actingAs($this->me)->postJson("/api/media/watches/movie/{$movie->id}")->assertCreated();

        Carbon::setTestNow(Carbon::parse('2026-09-19 12:00:00', 'UTC'));
        $latest = $this->actingAs($this->me)->postJson("/api/media/watches/movie/{$movie->id}")->assertCreated()->json('data.id');
        $this->assertSame('2026-09-19', $movie->refresh()->watched_at?->format('Y-m-d'));

        $this->actingAs($this->me)->deleteJson("/api/media-watches/{$latest}")->assertNoContent();

        $this->assertSame('2026-01-10', $movie->refresh()->watched_at?->format('Y-m-d'));
        $september = collect($this->actingAs($this->me)->getJson('/api/stats?year=2026')->json('data'))
            ->firstWhere('key', 'movie')['months'][8]['count'];
        $this->assertSame(0, $september, 'ურნაში მყოფი ნახვა სტატისტიკაში ითვლება');

        $item = $this->group('media_watch')['items'][0];
        $this->assertStringStartsWith('2026-09-19', $item['when']);

        $this->actingAs($this->me)->postJson("/api/trash/media_watch/{$latest}/restore")->assertOk();
        $this->assertSame('2026-09-19', $movie->refresh()->watched_at?->format('Y-m-d'));
    }

    /** ⚠️ ჩანაწერის საბოლოო წაშლა მის ჟურნალსაც შლის — polymorphic-ს კასკადი არ აქვს */
    public function test_hard_deleting_a_record_removes_its_watches(): void
    {
        $movie = Movie::create(['user_id' => $this->me->id, 'year' => 2001]);
        $this->actingAs($this->me)->postJson("/api/media/watches/movie/{$movie->id}")->assertCreated();
        $this->actingAs($this->me)->postJson("/api/media/watches/movie/{$movie->id}")->assertCreated();
        MediaWatch::withoutGlobalScopes()->first()->moveToTrash();

        $this->actingAs($this->me)->deleteJson("/api/movies/{$movie->id}")->assertNoContent();
        $this->actingAs($this->me)->deleteJson("/api/trash/movie/{$movie->id}")->assertNoContent();

        $this->assertSame(0, MediaWatch::withoutGlobalScopes()->count());
    }

    /* ---------- ალბომი ---------- */

    /**
     * ⚠️ **ალბომი ფოტოებს იმახსოვრებს**: წაშლა მათ ალბომის გარეშე ტოვებს
     * (და საჯარო დისკზე), აღდგენა კი უკან აბრუნებს და ჩაკეტილს თავიდან
     * კეტავს — ფაილი ისევ პირად დისკზე.
     */
    public function test_a_locked_album_comes_back_with_its_photos_and_its_lock(): void
    {
        $album = GalleryAlbum::create([
            'user_id' => $this->me->id, 'name' => 'პირადი',
            'password_hash' => Hash::make('secret1'), 'sort_order' => 1,
        ]);
        AlbumLock::flush();
        Storage::disk('private')->put('gallery/locked/s.jpg', 'x');
        $photo = GalleryImage::create([
            'user_id' => $this->me->id, 'album_id' => $album->id, 'source' => 'tmdb',
            'category' => 'backdrop', 'path' => 'gallery/locked/s.jpg', 'size' => 100,
        ]);

        $this->actingAs($this->me)
            ->withHeaders(['Referer' => 'http://localhost:5173'])
            ->withSession([AlbumLock::SESSION_KEY => [$album->id]])
            ->deleteJson("/api/gallery/albums/{$album->id}")
            ->assertOk();

        $photo = GalleryImage::withoutGlobalScopes()->find($photo->id);
        $this->assertNull($photo->album_id);
        $this->assertStringStartsWith('gallery/images/', $photo->path);

        $item = $this->group('gallery_album')['items'][0];
        $this->assertSame(1, $item['count']);
        $this->assertNotNull(GalleryAlbum::withoutGlobalScopes()->find($album->id)->password_hash, 'პაროლი ურნაში უნდა დარჩეს');

        $this->actingAs($this->me)->postJson("/api/trash/gallery_album/{$album->id}/restore")->assertOk();

        $photo = GalleryImage::withoutGlobalScopes()->find($photo->id);
        $this->assertSame($album->id, $photo->album_id);
        $this->assertStringStartsWith('gallery/locked/', $photo->path);
        Storage::disk('private')->assertExists($photo->path);
        $this->assertNull(GalleryAlbum::find($album->id)->trashed_photo_ids);
    }

    /** ურნაში მყოფ ალბომში ფოტოს გადატანა ფოტოს უხილავს გახდიდა — 422 */
    public function test_photos_cannot_be_moved_into_a_trashed_album(): void
    {
        $album = GalleryAlbum::create(['user_id' => $this->me->id, 'name' => 'x', 'sort_order' => 1]);
        $album->moveToTrash();
        $photo = GalleryImage::create([
            'user_id' => $this->me->id, 'source' => 'tmdb', 'category' => 'backdrop',
            'path' => 'gallery/images/m.jpg', 'size' => 1,
        ]);

        $this->actingAs($this->me)
            ->postJson('/api/gallery/images/move', ['ids' => [$photo->id], 'album_id' => $album->id])
            ->assertStatus(422);
    }

    /* ---------- მსახიობის ბმული ---------- */

    /** ხელით დამატებული (TMDB-ის გარეშე) — მოხსნა ურნაშია, აღდგენა როლს ინარჩუნებს */
    public function test_a_hand_added_cast_member_comes_back_with_the_role(): void
    {
        $movie = Movie::create(['user_id' => $this->me->id, 'year' => 2001]);
        $id = $this->actingAs($this->me)
            ->postJson("/api/media/cast/movie/{$movie->id}", ['name' => 'Nino Kasradze', 'character' => 'Mother'])
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($this->me)->deleteJson("/api/media/cast/movie/{$movie->id}/{$id}")->assertOk();
        $this->assertSame(0, $movie->castLinks()->count(), 'TMDB-ის გარეშე ბმული ნამდვილად იხსნება');

        $entry = TrashEntry::withoutGlobalScope('owner')->sole();
        $item = $this->group('cast_link')['items'][0];
        $this->assertSame('Nino Kasradze', $item['title']);
        $this->assertSame((int) $movie->id, $item['parent']['id']);

        $this->actingAs($this->me)->postJson("/api/trash/cast_link/{$entry->id}/restore")->assertOk();

        $link = $movie->cast()->whereKey($id)->first();
        $this->assertNotNull($link);
        $this->assertSame('Mother', $link->pivot->character);
        $this->assertTrue((bool) $link->pivot->is_manual);
        $this->assertSame(0, TrashEntry::withoutGlobalScope('owner')->count());
    }

    /**
     * ⚠️ **TMDB-ის მსახიობის საფლავის ქვა ურნის საბოლოო წაშლის შემდეგაც რჩება**
     * — სწორედ ის უშლის სინქრონიზაციას მის დაბრუნებას.
     */
    public function test_a_tmdb_cast_members_tombstone_outlives_the_trash(): void
    {
        $movie = Movie::create(['user_id' => $this->me->id, 'year' => 2001]);
        $person = CastMember::create(['name' => 'Keanu Reeves', 'tmdb_person_id' => 6384]);
        $movie->castLinks()->attach($person->id, ['character' => 'Neo', 'billing_order' => 0]);

        $this->actingAs($this->me)->deleteJson("/api/media/cast/movie/{$movie->id}/{$person->id}")->assertOk();
        $entry = TrashEntry::withoutGlobalScope('owner')->sole();

        $this->actingAs($this->me)->deleteJson("/api/trash/cast_link/{$entry->id}")->assertNoContent();

        $this->assertSame(0, TrashEntry::withoutGlobalScope('owner')->count());
        $this->assertTrue((bool) $movie->castLinks()->whereKey($person->id)->first()->pivot->is_removed);
        $this->assertSame(0, $movie->cast()->count());
    }

    /** ხელით თავიდან დამატება ურნის ჩანაწერს შლის — აღდგენა „უკვე ადგილზეა"-ს იტყოდა */
    public function test_re_adding_a_cast_member_clears_its_trash_entry(): void
    {
        $movie = Movie::create(['user_id' => $this->me->id, 'year' => 2001]);
        $person = CastMember::create(['name' => 'Keanu Reeves', 'tmdb_person_id' => 6384]);
        $movie->castLinks()->attach($person->id, ['character' => 'Neo', 'billing_order' => 0]);

        $this->actingAs($this->me)->deleteJson("/api/media/cast/movie/{$movie->id}/{$person->id}")->assertOk();
        $this->assertSame(1, TrashEntry::withoutGlobalScope('owner')->count());

        $this->actingAs($this->me)
            ->postJson("/api/media/cast/movie/{$movie->id}", ['cast_member_id' => $person->id])
            ->assertCreated();

        $this->assertSame(0, TrashEntry::withoutGlobalScope('owner')->count());
    }

    /** ჩანაწერის საბოლოო წაშლა მის ურნაში მყოფ ბმულებსაც შლის */
    public function test_hard_deleting_a_record_drops_its_cast_entries(): void
    {
        $movie = Movie::create(['user_id' => $this->me->id, 'year' => 2001]);
        $id = $this->actingAs($this->me)
            ->postJson("/api/media/cast/movie/{$movie->id}", ['name' => 'Nino Kasradze'])
            ->json('data.id');
        $this->actingAs($this->me)->deleteJson("/api/media/cast/movie/{$movie->id}/{$id}")->assertOk();

        $this->actingAs($this->me)->deleteJson("/api/movies/{$movie->id}")->assertNoContent();
        $this->actingAs($this->me)->deleteJson("/api/trash/movie/{$movie->id}")->assertNoContent();

        $this->assertSame(0, TrashEntry::withoutGlobalScope('owner')->count());
    }

    /** ვადის ამოწურვა ურნის ჩანაწერსაც შლის */
    public function test_prune_drops_expired_entries_and_parts(): void
    {
        $game = Game::create(['user_id' => $this->me->id, 'title_en' => 'g']);
        $note = $game->notes()->create(['user_id' => $this->me->id, 'body' => 'old']);
        $note->moveToTrash();
        $note->forceFill(['trashed_at' => now()->subDays(40)])->saveQuietly();

        TrashEntry::create([
            'user_id' => $this->me->id, 'kind' => 'cast_link', 'record_type' => 'movie', 'record_id' => 1,
            'slot' => '1', 'label' => 'x', 'trashed_at' => now()->subDays(40),
        ]);

        $this->artisan('trash:prune')->assertSuccessful();

        $this->assertNull($note::withoutGlobalScopes()->find($note->id));
        $this->assertSame(0, TrashEntry::withoutGlobalScope('owner')->count());
    }

    /** ⚠️ მაცნე: ყოველ ნაწილს სვეტიც აქვს და ტრეიტიც (`TrashFilesTest`-ის შემოწმება მათაც ფარავს) */
    public function test_reminder_and_watch_models_carry_the_trash_scope(): void
    {
        $this->assertArrayHasKey('trash', (new NoteReminder)->getGlobalScopes());
        $this->assertArrayHasKey('trash', (new MediaWatch)->getGlobalScopes());
    }
}
