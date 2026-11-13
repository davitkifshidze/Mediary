<?php

namespace Tests\Feature;

use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\Module;
use App\Models\Movie;
use App\Models\RecordLock;
use App\Models\User;
use App\Services\Gallery\AlbumVault;
use App\Support\AlbumLock;
use App\Support\RecordLocks;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;
use ZipArchive;

/**
 * **ლოკის მიღმა ფაილი საცავის გვერდიდანაც არ გამოდის.**
 *
 * ⚠️ საცავის ინვენტარი (`StorageMeter::files()`) კვოტის გამო ყველა ლოკს ხსნის
 * — დამალული ფაილიც ადგილს იკავებს. ბიბლიოთეკა (სია, ZIP, წაშლა) კი ღია
 * სესიით მუშაობს და ალბომის ან ჩანაწერის პაროლს არ ითხოვს: ფილტრის გარეშე
 * ჩაკეტილი ალბომის ფოტოები სიაში ჩანდა, ZIP-ში ჩადიოდა და ურნაში გადადიოდა.
 *
 * ⚠️ იგივე ხვრელი გადატანას ჰქონდა: რიგი ლოკის ქვეშ იცვლებოდა, ფაილი კი —
 * მის გარეშე, ე.ი. `album_id: null` დაუხსნელი ალბომის ფაილს საჯარო დისკზე
 * გამოიტანდა.
 */
class LockedFilesLibraryTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        Storage::fake('public');
        Storage::fake('private');

        $this->user = $this->makeUser('nino');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'gallery'])->pluck('id')->all());

        return $user->refresh();
    }

    private function spa(?User $user = null)
    {
        return $this->actingAs($user ?? $this->user)->withHeaders(['Referer' => 'http://localhost:5173']);
    }

    /** ჩაკეტილი ალბომი ერთი ფოტოთი — ფაილი დაცულ დისკზეა */
    private function lockedAlbum(): GalleryImage
    {
        $album = GalleryAlbum::create(['user_id' => $this->user->id, 'name' => 'პირადი', 'sort_order' => 1]);
        $album->setPassword('secret1');
        AlbumLock::flush();

        Storage::disk('public')->put('gallery/images/secret.jpg', 'secret');
        $image = GalleryImage::create([
            'user_id' => $this->user->id,
            'album_id' => $album->id,
            'source' => 'upload',
            'path' => 'gallery/images/secret.jpg',
            'original_name' => 'secret.jpg',
            'size' => 6,
        ]);

        AlbumVault::seal($album);

        return $image->refresh();
    }

    private function openPhoto(): GalleryImage
    {
        Storage::disk('public')->put('gallery/images/open.jpg', 'open');

        return GalleryImage::create([
            'user_id' => $this->user->id,
            'source' => 'upload',
            'path' => 'gallery/images/open.jpg',
            'original_name' => 'open.jpg',
            'size' => 4,
        ]);
    }

    /** ამ სესიაში ალბომი გახსნილია */
    private function unlocked(GalleryImage $image)
    {
        return $this->spa()->withSession([RecordLocks::SESSION_KEY => [AlbumLock::TYPE => [(int) $image->album_id]]]);
    }

    /** @return list<string> */
    private function listedPaths($request): array
    {
        return array_column($request->getJson('/api/storage/files')->assertOk()->json('files'), 'path');
    }

    public function test_the_list_hides_a_locked_albums_photos_until_the_album_is_opened(): void
    {
        $secret = $this->lockedAlbum();
        $open = $this->openPhoto();

        $this->assertSame('gallery/locked/secret.jpg', $secret->path);
        $this->assertSame([$open->path], $this->listedPaths($this->spa()));

        $paths = $this->listedPaths($this->unlocked($secret));
        sort($paths);
        $this->assertSame([$open->path, $secret->path], $paths);
    }

    /** „ყველას ჩამოტვირთვა" და ცხადად გადმოცემული გზა — ორივე ლოკის ქვეშაა */
    public function test_the_archive_never_carries_a_locked_file(): void
    {
        $secret = $this->lockedAlbum();
        $this->openPhoto();

        $res = $this->spa()->post('/api/storage/files/download', ['all' => true])->assertOk();
        $this->assertSame(['gallery/open.jpg'], $this->zipNames($res->baseResponse->getFile()->getPathname()));

        $this->spa()->postJson('/api/storage/files/download', ['paths' => [$secret->path]])
            ->assertNotFound()
            ->assertJsonPath('message', 'file_not_found');

        $res = $this->unlocked($secret)->post('/api/storage/files/download', ['paths' => [$secret->path]])->assertOk();
        $this->assertSame(['gallery/secret.jpg'], $this->zipNames($res->baseResponse->getFile()->getPathname()));
    }

    public function test_deleting_never_touches_a_locked_file(): void
    {
        $secret = $this->lockedAlbum();
        $open = $this->openPhoto();

        $this->spa()->deleteJson('/api/storage/files', ['paths' => [$secret->path]])
            ->assertNotFound()
            ->assertJsonPath('message', 'file_not_found');

        $this->spa()->deleteJson('/api/storage/files', ['all' => true])
            ->assertOk()
            ->assertJsonPath('deleted', 1);

        $this->assertNull(GalleryImage::withoutGlobalScopes()->findOrFail($secret->id)->trashed_at);
        $this->assertNotNull(GalleryImage::withoutGlobalScopes()->findOrFail($open->id)->trashed_at);
        Storage::disk('private')->assertExists($secret->path);
    }

    /** დამალული ფილმის ატვირთული პოსტერი და მისი გალერეის ფოტო — იგივე წესი */
    public function test_a_hidden_records_files_are_not_listed(): void
    {
        $this->actingAs($this->user);

        Storage::disk('public')->put('movies/posters/hidden.jpg', 'poster');
        Storage::disk('public')->put('gallery/images/still.jpg', 'still');

        $movie = new Movie(['user_id' => $this->user->id, 'year' => 1999]);
        $movie->forceFill(['poster_path' => 'movies/posters/hidden.jpg', 'poster_source' => 'upload'])->save();

        GalleryImage::create([
            'user_id' => $this->user->id,
            'imageable_type' => $movie->getMorphClass(),
            'imageable_id' => $movie->id,
            'source' => 'upload',
            'path' => 'gallery/images/still.jpg',
            'size' => 5,
        ]);

        $paths = $this->listedPaths($this->spa());
        sort($paths);
        $this->assertSame(['gallery/images/still.jpg', 'movies/posters/hidden.jpg'], $paths);

        RecordLock::create([
            'user_id' => $this->user->id,
            'lockable_type' => $movie->getMorphClass(),
            'lockable_id' => $movie->id,
            'password_hash' => Hash::make('secret1'),
        ]);
        RecordLocks::flush();

        $this->assertSame([], $this->listedPaths($this->spa()));

        $open = $this->spa()->withSession([RecordLocks::SESSION_KEY => [$movie->getMorphClass() => [$movie->id]]]);
        $this->assertCount(2, $this->listedPaths($open));
    }

    /** ადმინის გვერდი სხვის ჩაკეტილ ფაილებს არ ჩამოთვლის — მისი სესია მათ ვერც „გახსნის" */
    public function test_an_admin_never_sees_another_accounts_locked_files(): void
    {
        $secret = $this->lockedAlbum();
        $open = $this->openPhoto();

        $admin = $this->makeUser('root');
        $admin->assignRole('super_admin')->save();

        $files = $this->spa($admin->refresh())
            ->withSession([RecordLocks::SESSION_KEY => [AlbumLock::TYPE => [(int) $secret->album_id]]])
            ->getJson("/api/admin/users/{$this->user->id}")
            ->assertOk()
            ->json('files');

        $this->assertSame([$open->path], array_column($files, 'path'));
    }

    /**
     * ⚠️ დაუხსნელი ალბომის ფოტოს id ცნობილია (ან გამოცნობადი): გადატანა მის
     * რიგს არ ცვლიდა (`moved: 0`), ფაილს კი საჯარო დისკზე გადაიტანდა.
     */
    public function test_moving_never_relocates_the_file_of_a_hidden_photo(): void
    {
        $secret = $this->lockedAlbum();
        $open = $this->openPhoto();

        $this->spa()->postJson('/api/gallery/images/move', ['ids' => [$secret->id, $open->id], 'album_id' => null])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $after = GalleryImage::withoutGlobalScopes()->findOrFail($secret->id);
        $this->assertSame('gallery/locked/secret.jpg', $after->path);
        $this->assertSame($secret->album_id, $after->album_id);
        Storage::disk('private')->assertExists('gallery/locked/secret.jpg');
        Storage::disk('public')->assertMissing('gallery/images/secret.jpg');

        // გახსნილ სესიაში იგივე მოთხოვნა ფოტოს მართლა გამოიყვანს — რიგიც და ფაილიც
        $this->unlocked($secret)->postJson('/api/gallery/images/move', ['ids' => [$secret->id], 'album_id' => null])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $after = GalleryImage::withoutGlobalScopes()->findOrFail($secret->id);
        $this->assertNull($after->album_id);
        $this->assertSame('gallery/images/secret.jpg', $after->path);
        Storage::disk('public')->assertExists('gallery/images/secret.jpg');
    }

    /** @return list<string> */
    private function zipNames(string $path): array
    {
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path) === true);

        $names = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $names[] = (string) $zip->getNameIndex($i);
        }
        $zip->close();
        sort($names);

        return $names;
    }
}
