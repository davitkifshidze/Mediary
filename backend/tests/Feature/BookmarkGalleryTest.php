<?php

namespace Tests\Feature;

use App\Models\Bookmark;
use App\Models\BookmarkFile;
use App\Models\GalleryImage;
use App\Models\Module;
use App\Models\User;
use App\Services\Gallery\ModuleImages;
use App\Services\Storage\StorageMeter;
use App\Support\GalleryParent;
use App\Support\TrashDomain;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **ბუკმარკის ფოტოები და გალერეა** (Tasks §36.4, §36.6).
 *
 * შენი სიტყვები: „შეიძლებოდეს ბუკმარკზე დაამატო გალერეა".
 *
 * ორი საცავი, ადგილისა და კურსის წესით: ჩემი ატვირთული ფოტო („შოპინგის"
 * სკრინშოტი) — `bookmark_files`-ში, ვებიდან მოტანილი — `gallery_images`-ში
 * (`GalleryParent::PARENTS['bookmark']`). ⚠️ მოწმდება ის, რაც ჩუმად ტყდება:
 * კვოტა, ურნა, ჩანაწერთან ერთად წაშლა და გალერეიდან „მთავარად დაყენებული"
 * ფოტო, რომელიც ბუკმარკის წაშლამ არ უნდა გაანადგუროს და კვოტაში ორჯერ არ ითვლება.
 */
class BookmarkGalleryTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'nika',
            'username' => 'nika',
            'email' => 'nika@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::whereIn('key', ['bookmark', 'gallery'])->pluck('id')->all());
        // ⚠️ ქარხანა კვოტას არ წერს — მეხსიერებაში `null`-ია და ატვირთვა 413
        $this->user->refresh();
        $this->actingAs($this->user);
    }

    private function bookmark(): Bookmark
    {
        $id = $this->postJson('/api/bookmarks', [
            'title' => 'MX Master 3S',
            'url' => 'https://www.logitech.com/mx-master-3s',
            'autofill' => 0,
            'status' => 'to_read',
            'category_id' => $this->getJson('/api/bookmark-categories')->json('data.0.id'),
        ])->assertStatus(201)->json('data.id');

        return Bookmark::findOrFail($id);
    }

    private function galleryImage(Bookmark $bookmark, int $size = 1000): GalleryImage
    {
        Storage::disk('public')->put($path = 'gallery/images/'.uniqid().'.jpg', str_repeat('x', $size));

        return $bookmark->galleryImages()->create([
            'user_id' => $this->user->id,
            'source' => 'web',
            'category' => GalleryParent::category('bookmark'),
            'path' => $path,
            'size' => $size,
        ]);
    }

    public function test_the_bookmark_is_a_gallery_parent(): void
    {
        $this->assertTrue(GalleryParent::has('bookmark'));
        $this->assertSame(Bookmark::class, GalleryParent::model('bookmark'));
        $this->assertSame('bookmark', GalleryParent::module('bookmark'));
        $this->assertSame('thumbnail_path', GalleryParent::primary('bookmark')['path']);
        $this->assertContains('bookmark', GalleryParent::recordKeys($this->user));
        $this->assertContains('bookmark_file', TrashDomain::kinds());
        $this->assertContains('bookmark', ModuleImages::modules());
    }

    public function test_my_photos_are_uploaded_metered_and_counted_in_the_list(): void
    {
        Storage::fake('public');
        $bookmark = $this->bookmark();

        $this->post("/api/bookmarks/{$bookmark->id}/files", [
            'files' => [UploadedFile::fake()->image('shop.png', 40, 40), UploadedFile::fake()->image('cart.jpg', 40, 40)],
        ], ['Accept' => 'application/json'])
            ->assertStatus(201)
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.kind', 'image');

        $path = BookmarkFile::firstOrFail()->path;
        $this->assertStringStartsWith('bookmarks/files/images/', $path);
        Storage::disk('public')->assertExists($path);
        $this->assertGreaterThan(0, (int) $this->user->refresh()->storage_used_bytes);

        $this->getJson("/api/bookmarks/{$bookmark->id}/files")->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/bookmarks')->assertOk()->assertJsonPath('data.0.files_count', 2);

        // საცავის ბიბლიოთეკაში ბუკმარკის ფოტოდ ჩანს — ურნის მშობლით
        $files = app(StorageMeter::class)->files($this->user->refresh());
        $mine = $files->firstWhere('owner_type', 'bookmark_file');
        $this->assertSame('bookmark', $mine['module']);
        $this->assertSame(['bookmark', $bookmark->id], $mine['_parent']);
    }

    public function test_only_images_are_accepted(): void
    {
        Storage::fake('public');
        $bookmark = $this->bookmark();

        $this->post("/api/bookmarks/{$bookmark->id}/files", [
            'files' => [UploadedFile::fake()->create('notes.pdf', 10, 'application/pdf')],
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $this->assertSame(0, BookmarkFile::count());
    }

    /** `DELETE` ურნაში აგზავნის: ფაილი და კვოტა ადგილზეა, სიაში აღარ ჩანს */
    public function test_deleting_a_photo_moves_it_to_the_trash(): void
    {
        Storage::fake('public');
        $bookmark = $this->bookmark();

        $id = $this->post("/api/bookmarks/{$bookmark->id}/files", [
            'files' => [UploadedFile::fake()->image('shop.png', 40, 40)],
        ], ['Accept' => 'application/json'])->json('data.0.id');

        $used = (int) $this->user->refresh()->storage_used_bytes;

        $this->deleteJson("/api/bookmark-files/{$id}")->assertNoContent();

        $this->getJson("/api/bookmarks/{$bookmark->id}/files")->assertOk()->assertJsonCount(0, 'data');
        $this->assertNotNull(BookmarkFile::withoutGlobalScope('trash')->findOrFail($id)->trashed_at);
        $this->assertSame($used, (int) $this->user->refresh()->storage_used_bytes);
    }

    /** სხვისი ფოტო 404-ია (`BelongsToUser` + `EnsureRecordOwnership`) */
    public function test_another_users_photo_is_not_found(): void
    {
        Storage::fake('public');
        $bookmark = $this->bookmark();
        $id = $this->post("/api/bookmarks/{$bookmark->id}/files", [
            'files' => [UploadedFile::fake()->image('shop.png', 40, 40)],
        ], ['Accept' => 'application/json'])->json('data.0.id');

        $other = User::create(['name' => 'oto', 'username' => 'oto', 'email' => 'oto@example.com', 'password' => 'password']);
        $other->modules()->sync(Module::whereIn('key', ['bookmark'])->pluck('id')->all());

        $this->actingAs($other->refresh())->deleteJson("/api/bookmark-files/{$id}")->assertStatus(404);
        $this->actingAs($other)->getJson("/api/bookmarks/{$bookmark->id}/files")->assertStatus(404);
    }

    /**
     * ⚠️ **საბოლოო წაშლა ყველაფერს ათავისუფლებს** — ჩემს ფოტოებს (ურნაში მყოფსაც),
     * გალერეის ფოტოებს და კვოტას. `PurgeService` სწორედ ამ გზით შლის.
     */
    public function test_photos_and_gallery_leave_with_the_bookmark(): void
    {
        Storage::fake('public');
        $bookmark = $this->bookmark();

        $ids = $this->post("/api/bookmarks/{$bookmark->id}/files", [
            'files' => [UploadedFile::fake()->image('a.png', 40, 40), UploadedFile::fake()->image('b.png', 40, 40)],
        ], ['Accept' => 'application/json'])->json('data.*.id');
        $this->deleteJson("/api/bookmark-files/{$ids[0]}")->assertNoContent();

        $image = $this->galleryImage($bookmark);
        $this->getJson("/api/bookmarks/{$bookmark->id}")->assertOk()->assertJsonPath('data.photos_count', 1);

        $bookmark->refresh()->delete();

        $this->assertSame(0, BookmarkFile::withoutGlobalScopes()->count());
        $this->assertDatabaseMissing('gallery_images', ['id' => $image->id]);
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    /**
     * ⚠️ **გალერეიდან „მთავარად დაყენებული" ფოტო** (ადგილის წესი): სვეტი გალერეის
     * ფაილზე მიუთითებს — ბიბლიოთეკა მას ბუკმარკის ფოტოდ მეორედ არ ითვლის, ფორმის
     * „მოშორება" ფაილს არ შლის, ხოლო ბუკმარკის წაშლა მას გალერეის რიგთან ერთად
     * ერთხელ ათავისუფლებს (კვოტა უარყოფითში არ ჩადის).
     */
    public function test_a_gallery_photo_can_be_the_main_photo(): void
    {
        Storage::fake('public');
        $bookmark = $this->bookmark();
        $image = $this->galleryImage($bookmark, 1000);
        $this->user->forceFill(['storage_used_bytes' => 1000])->save();

        $this->postJson("/api/gallery/images/{$image->id}/primary")
            ->assertOk()
            ->assertJsonPath('poster_path', $image->path);

        $this->assertSame($image->path, $bookmark->refresh()->thumbnail_path);
        $this->getJson("/api/bookmarks/{$bookmark->id}")->assertOk()->assertJsonPath('data.image', $image->path);

        // საცავში ერთხელ — გალერეის ფოტოდ და არა ბუკმარკის მთავარ ფოტოდ
        $files = app(StorageMeter::class)->files($this->user->refresh());
        $this->assertCount(0, $files->where('owner_type', 'bookmark'));
        $this->assertCount(1, $files->where('owner_type', 'gallery_image'));

        // „მოშორება" ფორმიდან — სვეტი ცარიელდება, გალერეის ფაილი რჩება
        $this->post("/api/bookmarks/{$bookmark->id}", ['_method' => 'PATCH', 'remove_thumbnail' => 1], ['Accept' => 'application/json'])
            ->assertOk();
        $this->assertNull($bookmark->refresh()->thumbnail_path);
        Storage::disk('public')->assertExists($image->path);

        // ხელახლა მთავარი და წაშლა — ფაილი ერთხელ ქრება, კვოტა ნულზე ჩერდება
        $this->postJson("/api/gallery/images/{$image->id}/primary")->assertOk();
        $bookmark->refresh()->delete();

        Storage::disk('public')->assertMissing($image->path);
        $this->assertSame(0, (int) $this->user->refresh()->storage_used_bytes);
    }
}
