<?php

namespace Tests\Feature;

use App\Models\BoardGame;
use App\Models\Book;
use App\Models\Concerns\HasTrash;
use App\Models\Course;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\GalleryVideo;
use App\Models\Game;
use App\Models\Module;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\Place;
use App\Models\TrashedFile;
use App\Models\User;
use App\Models\Video;
use App\Services\Storage\StorageMeter;
use App\Support\AlbumLock;
use App\Support\StorageFolder;
use App\Support\TrashDomain;
use Database\Seeders\ModulesSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * **ურნა ფაილებზეც (Tasks §29, ეტაპი 1).**
 *
 * ⚠️ **ორი ურთიერთსაპირისპირო ფაქტი, როგორც FEAT-11-ში**: ფაილის წაშლა
 * **არაფერს** ანადგურებს (რიგი, ფაილი და კვოტა ადგილზეა, აღდგენა უფასოა) —
 * და ჩანაწერის საბოლოო წაშლა, ვადის ამოწურვა და ანგარიშის წაშლა ურნაში
 * მყოფ ფაილსაც **მაინც** შლის. მეორე რომ გაფუჭდეს, ფაილი დისკზე ობლად
 * დარჩება და კვოტა სამუდამოდ დაკავებული იქნება.
 */
class TrashFilesTest extends TestCase
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
            'name' => 'bin', 'username' => 'bin',
            'email' => 'bin@example.com', 'password' => 'password',
        ]);
        $this->me->modules()->sync(Module::pluck('id')->all());
        $this->me->refresh();
    }

    /* ---------- დამხმარეები ---------- */

    /** @return array<string, array{0: string}> */
    public static function fileKinds(): array
    {
        return [
            'video' => ['video_file'],
            'book' => ['book_file'],
            'board game' => ['board_game_file'],
            'game' => ['game_file'],
            'note' => ['note_entry_file'],
            'course' => ['course_file'],
            'place' => ['place_file'],
        ];
    }

    /**
     * ჩანაწერი + ერთი მიმაგრებული ფაილი დისკზე.
     *
     * @return array{0: Model, 1: Model, 2: string, 3: string, 4: string} მშობელი, ფაილი, სიის URL, წაშლის URL, მშობლის წაშლის URL
     */
    private function makeFile(string $kind, int $bytes = 100): array
    {
        [$parent, $folder, $list, $delete, $parentDelete] = match ($kind) {
            'video_file' => [Video::create(['user_id' => $this->me->id, 'title' => 'v', 'url' => 'https://youtu.be/dQw4w9WgXcQ']), 'videos/files/docs', 'videos', 'video-files', 'videos'],
            'book_file' => [Book::create(['user_id' => $this->me->id, 'title_en' => 'b']), 'books/files/docs', 'books', 'book-files', 'books'],
            'board_game_file' => [BoardGame::create(['user_id' => $this->me->id, 'title' => 'bg']), 'boardgames/files/docs', 'board-games', 'board-game-files', 'board-games'],
            'game_file' => [Game::create(['user_id' => $this->me->id, 'title_en' => 'g']), 'games/files/docs', 'games', 'game-files', 'games'],
            'note_entry_file' => [NoteEntry::create(['user_id' => $this->me->id, 'title' => 'n']), 'notes/files/docs', 'notes', 'note-files', 'notes'],
            'course_file' => [Course::create(['user_id' => $this->me->id, 'title' => 'c']), 'courses/files/docs', 'courses', 'course-files', 'courses'],
            'place_file' => [Place::create(['user_id' => $this->me->id, 'name' => 'p']), 'places/files/docs', 'places', 'place-files', 'places'],
        };

        $path = "{$folder}/{$kind}.pdf";
        Storage::disk(StorageFolder::diskFor($path))->put($path, str_repeat('x', $bytes));

        $file = $parent->files()->create([
            'user_id' => $this->me->id, 'kind' => 'doc', 'path' => $path,
            'original_name' => "{$kind}.pdf", 'mime' => 'application/pdf', 'size' => $bytes,
        ]);

        app(StorageMeter::class)->recalculate($this->me);

        return [$parent, $file, "/api/{$list}/{$parent->id}/files", "/api/{$delete}/{$file->id}", "/api/{$parentDelete}/{$parent->id}"];
    }

    /** @return array<string, mixed>|null */
    private function group(string $kind): ?array
    {
        return collect($this->actingAs($this->me)->getJson('/api/trash')->assertOk()->json('data'))
            ->firstWhere('kind', $kind);
    }

    private function used(): int
    {
        return (int) $this->me->refresh()->storage_used_bytes;
    }

    private function photo(array $attributes = []): GalleryImage
    {
        $path = $attributes['path'] ?? 'gallery/images/p'.random_int(1, 1_000_000).'.jpg';
        $size = $attributes['size'] ?? 300;
        Storage::disk(StorageFolder::diskFor($path))->put($path, str_repeat('x', $size));

        return GalleryImage::create([
            'user_id' => $this->me->id, 'source' => 'tmdb', 'category' => 'backdrop',
            'path' => $path, 'size' => $size, 'mime' => 'image/jpeg',
            ...$attributes,
        ]);
    }

    /* ---------- ფაილები ---------- */

    /** ყოველი მოდულის ფაილი: წაშლა → ურნა (ფაილი და კვოტა რჩება) → აღდგენა */
    #[DataProvider('fileKinds')]
    public function test_a_module_file_goes_to_the_trash_and_back(string $kind): void
    {
        [, $file, $list, $delete] = $this->makeFile($kind, 100);
        $this->assertSame(100, $this->used());

        $this->actingAs($this->me)->deleteJson($delete)->assertNoContent();

        $row = $file::withoutGlobalScopes()->find($file->id);
        $this->assertNotNull($row, 'რიგი ადგილზე უნდა დარჩეს');
        $this->assertNotNull($row->trashed_at);
        Storage::disk(StorageFolder::diskFor($file->path))->assertExists($file->path);
        $this->assertSame(100, $this->used(), 'ურნაში მყოფი ადგილს კვლავ იკავებს');
        $this->actingAs($this->me)->getJson($list)->assertOk()->assertJsonCount(0, 'data');

        $group = $this->group($kind);
        $this->assertNotNull($group, "{$kind}: ურნაში არ ჩანს");
        $this->assertSame(1, $group['total']);
        $this->assertSame(100, $group['bytes']);
        $this->assertSame(100, $group['items'][0]['size']);
        $this->assertTrue($group['items'][0]['restorable']);
        $this->assertFalse($group['items'][0]['parent']['trashed']);

        $this->actingAs($this->me)
            ->postJson("/api/trash/{$kind}/{$file->id}/restore")
            ->assertOk()
            ->assertJsonPath('with_parent', false);

        $this->actingAs($this->me)->getJson($list)->assertOk()->assertJsonCount(1, 'data');
        $this->assertNull($this->group($kind));
    }

    /** საბოლოო წაშლა ურნიდან — ფაილიც და კვოტაც */
    #[DataProvider('fileKinds')]
    public function test_deleting_a_file_from_the_trash_frees_the_space(string $kind): void
    {
        [, $file, , $delete] = $this->makeFile($kind, 100);

        $this->actingAs($this->me)->deleteJson($delete)->assertNoContent();
        $this->actingAs($this->me)->deleteJson("/api/trash/{$kind}/{$file->id}")->assertNoContent();

        $this->assertNull($file::withoutGlobalScopes()->find($file->id));
        Storage::disk(StorageFolder::diskFor($file->path))->assertMissing($file->path);
        $this->assertSame(0, $this->used());
    }

    /**
     * ⚠️ **ფაილი, რომლის ჩანაწერიც თვითონ ურნაშია, ჩანაწერთან ერთად ბრუნდება**
     * (29.5) — თორემ ის უხილავ ჩანაწერს მიებმებოდა და „აღდგა" ტყუილი იქნებოდა.
     */
    public function test_a_file_of_a_trashed_record_comes_back_with_its_record(): void
    {
        [$video, $file, , $delete, $parentDelete] = $this->makeFile('video_file');

        $this->actingAs($this->me)->deleteJson($delete)->assertNoContent();
        $this->actingAs($this->me)->deleteJson($parentDelete)->assertNoContent();

        $item = $this->group('video_file')['items'][0];
        $this->assertSame(['kind' => 'video', 'id' => $video->id, 'title' => 'v', 'trashed' => true], $item['parent']);
        $this->assertSame('v', $item['subtitle']);

        $this->actingAs($this->me)
            ->postJson("/api/trash/video_file/{$file->id}/restore")
            ->assertOk()
            ->assertJsonPath('with_parent', true);

        $this->assertNotNull(Video::find($video->id), 'ჩანაწერი ფაილთან ერთად უნდა დაბრუნდეს');
        $this->assertNull($file->refresh()->trashed_at);
    }

    /**
     * ⚠️ **ჩანაწერის საბოლოო წაშლა ურნაში მყოფ ფაილსაც იტანს** — `trash` scope-ით
     * მშობლის `deleting` მას ვერ იპოვიდა და ფაილი დისკზე ობლად დარჩებოდა.
     */
    #[DataProvider('fileKinds')]
    public function test_hard_deleting_a_record_takes_its_trashed_file_with_it(string $kind): void
    {
        [$parent, $file, , $delete, $parentDelete] = $this->makeFile($kind);
        $domain = TrashDomain::ITEMS[$kind]['module'];

        $this->actingAs($this->me)->deleteJson($delete)->assertNoContent();
        $this->actingAs($this->me)->deleteJson($parentDelete)->assertNoContent();
        $this->actingAs($this->me)->deleteJson("/api/trash/{$domain}/{$parent->id}")->assertNoContent();

        $this->assertNull($file::withoutGlobalScopes()->find($file->id));
        Storage::disk(StorageFolder::diskFor($file->path))->assertMissing($file->path);
        $this->assertSame(0, $this->used());
    }

    /* ---------- გალერეა ---------- */

    /** ფოტო: წაშლა ურნაში, გალერეიდან ქრება, ადგილს იკავებს, ბრუნდება */
    public function test_a_gallery_photo_goes_to_the_trash_and_back(): void
    {
        $movie = Movie::create(['user_id' => $this->me->id, 'year' => 2001]);
        $photo = $this->photo(['imageable_type' => 'movie', 'imageable_id' => $movie->id]);
        app(StorageMeter::class)->recalculate($this->me);

        $this->actingAs($this->me)->deleteJson("/api/gallery/images/{$photo->id}")->assertNoContent();

        $this->assertSame(300, $this->used());
        $this->actingAs($this->me)->getJson("/api/gallery/movie/{$movie->id}")->assertOk()->assertJsonCount(0, 'images');

        $item = $this->group('gallery_image')['items'][0];
        $this->assertSame(['src' => $photo->path, 'private' => false], $item['preview']);
        $this->assertFalse($item['locked']);

        $this->actingAs($this->me)->postJson("/api/trash/gallery_image/{$photo->id}/restore")->assertOk();
        $this->actingAs($this->me)->getJson("/api/gallery/movie/{$movie->id}")->assertOk()->assertJsonCount(1, 'images');
    }

    /**
     * ⚠️ **ჩანაწერის საბოლოო წაშლა ურნაში მყოფ ფოტოსაც იტანს** (`HasGallery`)
     * — ჩაკეტილი ალბომისასაც: სამივე scope ითიშება.
     */
    public function test_hard_deleting_a_record_takes_its_trashed_photo_with_it(): void
    {
        $movie = Movie::create(['user_id' => $this->me->id, 'year' => 2001]);
        $photo = $this->photo(['imageable_type' => 'movie', 'imageable_id' => $movie->id]);
        $photo->moveToTrash();
        app(StorageMeter::class)->recalculate($this->me);

        $this->actingAs($this->me)->deleteJson("/api/movies/{$movie->id}")->assertNoContent();
        $this->actingAs($this->me)->deleteJson("/api/trash/movie/{$movie->id}")->assertNoContent();

        $this->assertNull(GalleryImage::withoutGlobalScopes()->find($photo->id));
        Storage::disk('public')->assertMissing($photo->path);
        $this->assertSame(0, $this->used());
    }

    /** ვიდეო-ბმული (Q22 — „ბმული") ურნაში მიდის და ბრუნდება */
    public function test_a_gallery_video_link_goes_to_the_trash_and_back(): void
    {
        $movie = Movie::create(['user_id' => $this->me->id, 'year' => 2001]);
        $video = new GalleryVideo(['user_id' => $this->me->id, 'title' => 'Trailer']);
        $video->applyUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        $movie->galleryVideos()->save($video);

        $this->actingAs($this->me)->deleteJson("/api/gallery/videos/{$video->id}")->assertNoContent();

        $this->assertNotNull(GalleryVideo::withoutGlobalScopes()->find($video->id));
        $group = $this->group('gallery_video');
        $this->assertSame('Trailer', $group['items'][0]['title']);
        $this->assertSame(0, $group['bytes']);

        $this->actingAs($this->me)->postJson("/api/trash/gallery_video/{$video->id}/restore")->assertOk();
        $this->assertNull($video->refresh()->trashed_at);
    }

    /**
     * ⚠️ **ჩაკეტილი ალბომის ფოტო ურნაშიც ჩაკეტილია** (29.5): ესკიზი არ
     * იგზავნება და ფაილის მარშრუტი 404-ია, სანამ ალბომი სესიაში არ გაიხსნება.
     */
    public function test_a_locked_albums_photo_stays_locked_in_the_trash(): void
    {
        $album = GalleryAlbum::create([
            'user_id' => $this->me->id, 'name' => 'პირადი',
            'password_hash' => Hash::make('secret1'), 'sort_order' => 1,
        ]);
        AlbumLock::flush();

        $photo = $this->photo(['path' => 'gallery/locked/p.jpg', 'album_id' => $album->id]);
        $photo->moveToTrash();

        $item = $this->group('gallery_image')['items'][0];
        $this->assertTrue($item['locked']);
        $this->assertNull($item['preview']);

        $this->actingAs($this->me)->get("/api/trash/gallery_image/{$photo->id}/file")->assertStatus(404);
    }

    /** პირადი დისკის ფაილის ესკიზი ურნის საკუთარ მარშრუტზე გადის */
    public function test_a_private_files_preview_goes_through_the_trash_route(): void
    {
        $note = NoteEntry::create(['user_id' => $this->me->id, 'title' => 'n']);
        $path = 'notes/files/images/scan.png';
        Storage::disk('private')->put($path, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='));
        $file = $note->files()->create([
            'user_id' => $this->me->id, 'kind' => 'image', 'path' => $path,
            'original_name' => 'scan.png', 'mime' => 'image/png', 'size' => 68,
        ]);

        $this->actingAs($this->me)->deleteJson("/api/note-files/{$file->id}")->assertNoContent();

        $item = $this->group('note_entry_file')['items'][0];
        $this->assertSame(['src' => "/trash/note_entry_file/{$file->id}/file", 'private' => true], $item['preview']);

        $this->actingAs($this->me)->get("/api/trash/note_entry_file/{$file->id}/file")->assertOk();
    }

    /* ---------- მოცულობა ---------- */

    /**
     * ⚠️ **ურნა თავის მოცულობას ამბობს** (29.4) — ჩანაწერის რიცხვში მისი
     * ფაილებიც ითვლება (ხელით ატვირთული პოსტერი, გალერეის ფოტო): საბოლოო
     * წაშლა სწორედ მათ ათავისუფლებს.
     */
    public function test_the_trash_reports_how_much_space_it_holds(): void
    {
        $movie = Movie::create(['user_id' => $this->me->id, 'year' => 2001, 'poster_path' => 'movies/posters/up.jpg', 'poster_source' => 'upload']);
        Storage::disk('public')->put('movies/posters/up.jpg', str_repeat('x', 500));
        $this->photo(['imageable_type' => 'movie', 'imageable_id' => $movie->id, 'size' => 300]);
        [, $file, , $delete] = $this->makeFile('video_file', 1000);

        $this->actingAs($this->me)->deleteJson("/api/movies/{$movie->id}")->assertNoContent();
        $this->actingAs($this->me)->deleteJson($delete)->assertNoContent();

        $payload = $this->actingAs($this->me)->getJson('/api/trash')->assertOk()->json();

        $this->assertSame(1800, $payload['bytes']);
        $this->assertSame(800, collect($payload['data'])->firstWhere('kind', 'movie')['items'][0]['size']);
        $this->assertSame(1000, collect($payload['data'])->firstWhere('kind', 'video_file')['items'][0]['size']);

        // და ეს ადგილი ნამდვილად დაკავებულია — გადათვლაც იგივეს ამბობს
        $this->assertSame(1800, app(StorageMeter::class)->recalculate($this->me));
    }

    /* ---------- წესები ---------- */

    /** გამორთული მოდულის ფაილი ჩანს, მაგრამ აღდგენა მოდულის ჩართვას ითხოვს (29.5) */
    public function test_a_disabled_modules_file_is_listed_but_cannot_come_back(): void
    {
        [, $file, , $delete] = $this->makeFile('book_file');
        $this->actingAs($this->me)->deleteJson($delete)->assertNoContent();

        $this->me->modules()->detach(Module::where('key', 'book')->value('id'));
        $this->me->refresh();

        $item = $this->group('book_file')['items'][0];
        $this->assertFalse($item['restorable']);
        $this->assertSame('module_disabled', $item['blocked']);

        $this->actingAs($this->me)
            ->postJson("/api/trash/book_file/{$file->id}/restore")
            ->assertStatus(409)
            ->assertJsonPath('message', 'module_disabled');
    }

    /** სხვისი ურნის ელემენტი 404-ია — „ეს არსებობს" თვითონ ინფორმაციაა */
    public function test_another_users_trashed_file_is_a_404(): void
    {
        [, $file, , $delete] = $this->makeFile('video_file');
        $this->actingAs($this->me)->deleteJson($delete)->assertNoContent();

        $other = User::create(['name' => 'o', 'username' => 'o', 'email' => 'o@example.com', 'password' => 'password']);
        $other->modules()->sync(Module::pluck('id')->all());

        $this->actingAs($other)->postJson("/api/trash/video_file/{$file->id}/restore")->assertStatus(404);
        $this->actingAs($other)->deleteJson("/api/trash/video_file/{$file->id}")->assertStatus(404);
        $this->actingAs($other)->get("/api/trash/video_file/{$file->id}/file")->assertStatus(404);
        $this->assertNotNull($file::withoutGlobalScopes()->find($file->id));
    }

    /**
     * ⚠️ **ვადის ამოწურვა ყველა სახეს შლის** — ჩაკეტილი ალბომის ფოტოსაც:
     * `album_lock` scope-ით ის ვერასდროს მოიძებნებოდა და კვოტას სამუდამოდ
     * დაიკავებდა.
     */
    public function test_prune_deletes_expired_files_including_a_locked_albums_photo(): void
    {
        $album = GalleryAlbum::create([
            'user_id' => $this->me->id, 'name' => 'x',
            'password_hash' => Hash::make('secret1'), 'sort_order' => 1,
        ]);
        AlbumLock::flush();

        $old = $this->photo(['path' => 'gallery/locked/old.jpg', 'album_id' => $album->id, 'size' => 50]);
        $old->forceFill(['trashed_at' => now()->subDays(TrashDomain::KEEP_DAYS + 1)])->saveQuietly();

        $fresh = $this->photo(['path' => 'gallery/images/fresh.jpg', 'size' => 70]);
        $fresh->forceFill(['trashed_at' => now()->subDays(2)])->saveQuietly();

        $chat = TrashedFile::create([
            'user_id' => $this->me->id, 'kind' => 'chat_file', 'record_type' => 'message', 'record_id' => 1,
            'path' => 'chat/files/docs/old.pdf', 'size' => 30, 'trashed_at' => now()->subDays(TrashDomain::KEEP_DAYS + 1),
        ]);
        Storage::disk('private')->put($chat->path, str_repeat('x', 30));

        app(StorageMeter::class)->recalculate($this->me);
        $this->assertSame(150, $this->used());

        /* ⚠️ **ავტორიზებული კონტექსტი განზრახაა**: კონსოლში `Auth::id()` ცარიელია
           და `album_lock` scope ისედაც არაფერს აკეთებს — ე.ი. ტესტი მის
           გამორთვას ვერ შეამოწმებდა. რექვესთიდან გაშვებულ გასუფთავებაზე კი
           ჩაკეტილი ალბომის ფოტო დამალული იქნებოდა და ვერასდროს წაიშლებოდა. */
        $this->actingAs($this->me);
        $this->artisan('trash:prune')->assertSuccessful();

        $this->assertNull(GalleryImage::withoutGlobalScopes()->find($old->id));
        Storage::disk('private')->assertMissing('gallery/locked/old.jpg');
        $this->assertNull(TrashedFile::withoutGlobalScope('owner')->find($chat->id));
        Storage::disk('private')->assertMissing($chat->path);

        $this->assertNotNull(GalleryImage::withoutGlobalScopes()->find($fresh->id));
        $this->assertSame(70, $this->used());
    }

    /**
     * ⚠️ **ობოლების სკანერი ურნაში მყოფს ცოცხლად თვლის** — სხვაგვარად ადმინის
     * „გასუფთავება" აღსადგენ ფაილს წაშლიდა. საკონტროლო ფაილი ამტკიცებს, რომ
     * სკანერი საერთოდ მუშაობს (თორემ ტესტი უაზროდ გაივლიდა).
     */
    public function test_the_orphan_scan_keeps_trashed_files(): void
    {
        $trashed = TrashedFile::create([
            'user_id' => $this->me->id, 'kind' => 'field_file', 'record_type' => 'video', 'record_id' => 1,
            'slot' => 'f', 'path' => 'videos/fields/kept.pdf', 'size' => 10, 'trashed_at' => now(),
        ]);
        $photo = $this->photo(['path' => 'gallery/images/kept.jpg']);
        $photo->moveToTrash();

        foreach ([$trashed->path, $photo->path, 'gallery/images/orphan.jpg'] as $path) {
            Storage::disk('public')->put($path, 'x');
            touch(Storage::disk('public')->path($path), time() - 7200);
        }

        $orphans = app(StorageMeter::class)->orphans()->pluck('path');

        $this->assertContains('gallery/images/orphan.jpg', $orphans->all());
        $this->assertNotContains($trashed->path, $orphans->all());
        $this->assertNotContains($photo->path, $orphans->all());
    }

    /** ყოველ რიგიან ფაილს სვეტიც აქვს და scope-იც — რუკა, მოდელი და სქემა ერთმანეთს ეთანხმება */
    public function test_every_trash_item_has_the_column_and_the_trait(): void
    {
        foreach (TrashDomain::ITEMS as $kind => $item) {
            $model = new $item['model'];

            $this->assertContains(HasTrash::class, class_uses_recursive($model), "{$kind}: `HasTrash` აკლია");
            $this->assertTrue(Schema::hasColumn($model->getTable(), 'trashed_at'), "{$kind}: `trashed_at` სვეტი აკლია");
            $this->assertArrayHasKey('trash', $model->getGlobalScopes(), "{$kind}: `trash` scope აკლია");
        }
    }
}
