<?php

namespace Tests\Feature;

use App\Models\GalleryImage;
use App\Models\GalleryVideo;
use App\Models\Module;
use App\Models\Movie;
use App\Models\RecordLock;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **გალერეის ვიდეო-ბმული და ფოტო: მშობლის ურნა და საკეტი.**
 *
 * ⚠️ ფოტოს ერთი განსაზღვრება ჰქონდა (`GalleryImage::scopeListed()`), ვიდეოს კი —
 * მხოლოდ `owner`/`trash`: სია, ჭრილები, სათაურის მთვლელი და ძებნა ურნაში მყოფი და
 * დამალული ჩანაწერის ბმულს აბრუნებდა. დამალული ჩანაწერის ფოტოს წაშლა კი მშობლის
 * საკეტს არ ამოწმებდა და ურნა მის ესკიზს აჩვენებდა.
 */
class GalleryListedParentTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'nino', 'username' => 'nino', 'email' => 'nino@example.com', 'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::whereIn('key', ['movie', 'gallery'])->pluck('id')->all());
        $this->user = $this->user->refresh();
    }

    private function movie(string $title): Movie
    {
        $movie = Movie::create(['user_id' => $this->user->id, 'year' => 1979]);
        $movie->translations()->create(['locale' => 'en', 'title' => $title]);

        return $movie->refresh();
    }

    private function video(Movie $movie, string $title): GalleryVideo
    {
        return GalleryVideo::create([
            'user_id' => $this->user->id, 'videoable_type' => 'movie', 'videoable_id' => $movie->id,
            'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'title' => $title,
            'thumbnail_url' => "https://img.example/{$title}.jpg",
        ]);
    }

    private function lock(Movie $movie): void
    {
        RecordLock::create([
            'user_id' => $this->user->id,
            'lockable_type' => $movie->getMorphClass(),
            'lockable_id' => $movie->getKey(),
            'password_hash' => Hash::make('secret1'),
        ]);
    }

    public function test_a_video_of_a_binned_or_hidden_record_is_listed_nowhere(): void
    {
        $open = $this->video($this->movie('Open'), 'Visible trailer');

        $binned = $this->movie('Binned');
        $this->video($binned, 'Binned trailer');
        $binned->moveToTrash();

        $hidden = $this->movie('Hidden');
        $this->video($hidden, 'Hidden trailer');
        $this->lock($hidden);

        $this->actingAs($this->user);

        $list = $this->getJson('/api/gallery/videos')->assertOk();
        $this->assertSame([$open->id], array_column($list->json('data'), 'id'));
        $this->assertSame(1, $list->json('meta.total'));
        $this->assertSame(1, $list->json('facets.types.all'));

        $modules = $this->getJson('/api/gallery/videos/modules')->assertOk()->json('data');
        $this->assertSame([['kind' => 'movie', 'videos' => 1, 'records' => 1, 'thumbnails' => ['https://img.example/Visible trailer.jpg']]], $modules);

        $records = $this->getJson('/api/gallery/videos/records?type=movie')->assertOk();
        $this->assertSame([$open->videoable_id], array_column($records->json('data'), 'id'));

        $this->getJson('/api/gallery')->assertOk()->assertJsonPath('videos', 1);

        $search = $this->getJson('/api/search?q=trailer')->assertOk()->getContent();
        $this->assertStringContainsString('Visible trailer', $search);
        $this->assertStringNotContainsString('Binned trailer', $search);
        $this->assertStringNotContainsString('Hidden trailer', $search);
    }

    public function test_a_photo_of_a_hidden_record_is_not_deleted_and_shows_no_thumbnail_in_the_trash(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('gallery/images/h.jpg', 'x');

        $hidden = $this->movie('Hidden');
        $photo = GalleryImage::create([
            'user_id' => $this->user->id, 'imageable_type' => 'movie', 'imageable_id' => $hidden->id,
            'source' => 'tmdb', 'category' => 'backdrop', 'path' => 'gallery/images/h.jpg', 'size' => 100,
        ]);

        // ჯერ ურნაში — მერე ჩაიკეტა ჩანაწერი
        $binned = GalleryImage::create([
            'user_id' => $this->user->id, 'imageable_type' => 'movie', 'imageable_id' => $hidden->id,
            'source' => 'tmdb', 'category' => 'backdrop', 'path' => 'gallery/images/h.jpg', 'size' => 100,
        ]);
        $binned->moveToTrash();
        $this->lock($hidden);

        $this->actingAs($this->user)
            ->deleteJson("/api/gallery/images/{$photo->id}")
            ->assertStatus(423);
        $this->assertNull(GalleryImage::withoutGlobalScopes()->findOrFail($photo->id)->trashed_at);

        $item = collect($this->getJson('/api/trash/gallery_image/items')->assertOk()->json('data'))->firstWhere('id', $binned->id);
        $this->assertNotNull($item);
        $this->assertTrue($item['locked']);
        $this->assertNull($item['preview']);
    }
}
