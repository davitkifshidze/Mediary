<?php

namespace Tests\Feature;

use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Services\Gallery\AlbumVault;
use App\Support\AlbumLock;
use App\Support\StorageFolder;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\TestCase;

/**
 * **ჩაკეტილი ალბომის ფაილების ფიზიკური გადატანა (Tasks §7.9 → BUG-03).**
 *
 * `AlbumVault` ერთადერთი ადგილია, სადაც ფაილი დისკებს შორის დადის, და მისი
 * ორივე ჩავარდნა **ჩუმია** — ამიტომ ჰყავს საკუთარი ფაილი:
 *
 * ⚠️ ფაილი ტრანზაქციაში არ ცოცხლობს. ძველი რიგი „ჩაწერე ახალი → წაშალე
 * ძველი → შეინახე `path`" DB-ის ჩავარდნაზე სვეტს ძველ მნიშვნელობას
 * უბრუნებდა, ფაილი კი იქ აღარ იყო — **ალბომის ყველა ფოტო 404**.
 *
 * ⚠️ დისკზე დაკარგული ფაილის რიგიც „წარმატებით გადატანილად" ითვლებოდა და
 * `path` მეორე, ასევე ცარიელ მისამართზე გადაიწერებოდა.
 */
class AlbumVaultTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'nino',
            'username' => 'nino',
            'email' => 'nino@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::whereIn('key', ['movie', 'gallery'])->pluck('id')->all());
        $this->user = $this->user->refresh();

        Storage::fake('public');
        Storage::fake('private');
    }

    private function album(?string $password = 'secret1'): GalleryAlbum
    {
        $album = GalleryAlbum::create([
            'user_id' => $this->user->id,
            'name' => 'პირადი',
            'sort_order' => 1,
            'password_hash' => $password ? Hash::make($password) : null,
        ]);

        // სტატიკური მემო ერთ პროცესში ცოცხლობს — ახალი ლოკი უნდა დაინახოს
        AlbumLock::flush();

        return $album;
    }

    /** @param  'public'|'private'  $disk */
    private function photo(GalleryAlbum $album, string $path, ?Movie $parent = null, bool $onDisk = true, string $disk = 'public'): GalleryImage
    {
        if ($onDisk) {
            Storage::disk($disk)->put($path, 'x');
        }

        return GalleryImage::create([
            'user_id' => $this->user->id,
            'imageable_type' => $parent ? $parent->getMorphClass() : null,
            'imageable_id' => $parent?->getKey(),
            'album_id' => $album->id,
            'source' => 'tmdb',
            'category' => 'backdrop',
            'path' => $path,
            'size' => 100,
        ]);
    }

    /** ჩაკეტვა ფაილს პირად დისკზე გადაიტანს და `path`-ს იქით მიმართავს */
    public function test_sealing_moves_the_file_to_the_private_disk(): void
    {
        $album = $this->album();
        $image = $this->photo($album, 'gallery/images/a.jpg');

        $this->assertSame(1, AlbumVault::seal($album));

        $this->assertSame('gallery/locked/a.jpg', $image->refresh()->path);
        Storage::disk('private')->assertExists('gallery/locked/a.jpg');

        // ⚠️ ძველი ასლი **წაშლილია** — თორემ `/storage/...` ბმული ისევ იხსნება
        Storage::disk('public')->assertMissing('gallery/images/a.jpg');
    }

    /** პაროლის მოხსნა იმავე გზას უკან გადის */
    public function test_revealing_brings_the_file_back(): void
    {
        $album = $this->album(null);
        $image = $this->photo($album, 'gallery/locked/a.jpg', null, true, 'private');

        $this->assertSame(1, AlbumVault::reveal($album));

        $this->assertSame('gallery/images/a.jpg', $image->refresh()->path);
        Storage::disk('public')->assertExists('gallery/images/a.jpg');
        Storage::disk('private')->assertMissing('gallery/locked/a.jpg');
    }

    /**
     * **BUG-03 — DB-ის ჩავარდნაზე ფაილი ადგილზე რჩება.**
     *
     * ⚠️ ჩავარდნა `DB::listen`-ით კეთდება და არა მოდელის მოვლენით: `path`-ს
     * `saveQuietly()` წერს, ე.ი. `saving`/`updating` **საერთოდ არ ეშვება** —
     * ერთადერთი წერტილი, სადაც ამ ჩაწერაში ჩარევა შეიძლება, თვითონ query-ა.
     *
     * ⚠️ შემოწმება სამივე ფაქტს ეხება, არა მხოლოდ `path`-ს: ძველი ფაილი
     * ადგილზეა (თორემ ალბომი 404-ია) **და** ახალი ასლი აღარ არის (თორემ
     * ყოველი ჩავარდნილი ცდა ობოლ ფაილს ტოვებს და კვოტის გარეთ დგება).
     */
    public function test_a_failed_write_leaves_the_file_where_it_was(): void
    {
        $album = $this->album();
        $image = $this->photo($album, 'gallery/images/a.jpg');

        DB::listen(function ($query) {
            if (str_contains(strtolower($query->sql), 'update') && str_contains($query->sql, 'gallery_images')) {
                throw new RuntimeException('boom');
            }
        });

        try {
            AlbumVault::seal($album);
            $this->fail('გამონაკლისი უნდა ამოვარდნილიყო');
        } catch (RuntimeException $e) {
            $this->assertSame('boom', $e->getMessage());
        }

        $this->assertSame('gallery/images/a.jpg', $image->refresh()->path);
        Storage::disk('public')->assertExists('gallery/images/a.jpg');
        Storage::disk('private')->assertMissing('gallery/locked/a.jpg');
    }

    /**
     * **BUG-03 — დისკზე არარსებულ ფაილს `path` არ ეცვლება.**
     *
     * ადრე ასეთი რიგიც „გადატანილად" ითვლებოდა და მისამართს მეორე, ასევე
     * ცარიელ ადგილზე გადაიტანდა — ე.ი. დაკარგული ფაილის კვალი იკარგებოდა.
     */
    public function test_a_photo_missing_from_disk_keeps_its_path(): void
    {
        $album = $this->album();
        $image = $this->photo($album, 'gallery/images/gone.jpg', null, false);

        $this->assertSame(0, AlbumVault::seal($album));

        $this->assertSame('gallery/images/gone.jpg', $image->refresh()->path);
    }

    /**
     * დაკარგული ფაილი გვერდით მდგომს არ აჩერებს — ერთი გადადის, მეორე რჩება.
     *
     * ⚠️ სწორედ აქ ჩანს, რატომ არის `moved` მნიშვნელოვანი: ორი რიგია და
     * პასუხი „1"-ია, არა „2".
     */
    public function test_a_missing_file_does_not_stop_the_others(): void
    {
        $album = $this->album();
        $good = $this->photo($album, 'gallery/images/a.jpg');
        $gone = $this->photo($album, 'gallery/images/gone.jpg', null, false);

        $this->assertSame(1, AlbumVault::seal($album));

        $this->assertSame('gallery/locked/a.jpg', $good->refresh()->path);
        $this->assertSame('gallery/images/gone.jpg', $gone->refresh()->path);
    }

    /**
     * §7.14 — ჩაკეტვა ჩანაწერის პოსტერსაც წმენდს.
     *
     * „მთავარად დაყენება" `poster_path`-ს **ფოტოს ბილიკზე** მიუთითებს, ლოკის
     * scope კი მოდელზეა და არა ამ სვეტზე — ე.ი. ჩაკეტილი ფოტო პოსტერად
     * ისევ იხატებოდა, საჯარო ბარათზეც.
     */
    public function test_sealing_clears_a_poster_that_points_at_the_photo(): void
    {
        $album = $this->album();
        $movie = Movie::create([
            'user_id' => $this->user->id,
            'year' => 1979,
            'poster_path' => 'gallery/images/a.jpg',
            'poster_source' => 'tmdb',
        ]);
        $this->photo($album, 'gallery/images/a.jpg', $movie);

        AlbumVault::seal($album);

        $this->assertNull($movie->refresh()->poster_path);
        $this->assertNull($movie->poster_source);
    }

    /** ერთი ფოტოს ჩაკეტილ ალბომში გადატანა იმავე გზას გადის */
    public function test_placing_one_photo_into_a_locked_album_moves_its_file(): void
    {
        $locked = $this->album();
        $image = $this->photo($locked, 'gallery/images/a.jpg');

        AlbumVault::place($image, $locked);

        $this->assertSame('gallery/locked/a.jpg', $image->refresh()->path);
        Storage::disk('private')->assertExists('gallery/locked/a.jpg');
        Storage::disk('public')->assertMissing('gallery/images/a.jpg');
    }

    /** უკვე სამიზნე საქაღალდეში მდგომი ფაილი ხელახლა არ გადაიწერება */
    public function test_a_file_already_at_the_target_is_left_alone(): void
    {
        $album = $this->album();
        $image = $this->photo($album, 'gallery/locked/a.jpg', null, true, 'private');

        $this->assertSame(0, AlbumVault::seal($album));
        $this->assertSame('gallery/locked/a.jpg', $image->refresh()->path);
        $this->assertSame(StorageFolder::GALLERY_LOCKED, dirname($image->path));
    }
}
