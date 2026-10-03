<?php

namespace Tests\Feature;

use App\Models\CastMember;
use App\Models\GalleryVideo;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Support\GalleryParent;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **გალერეის ვიდეოების გვერდი — ძებნა, მფლობელის სახე, დალაგება** (Tasks §25.5).
 */
class GalleryVideoListTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'gia',
            'username' => 'gia',
            'email' => 'gia@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::whereIn('key', ['movie', 'gallery'])->pluck('id')->all());
        $this->actingAs($this->user->refresh());
    }

    private function seedVideos(): void
    {
        $movie = Movie::create(['user_id' => $this->user->id, 'year' => 2021]);
        $movie->setTranslation('en', ['title' => 'Dune']);
        $actor = CastMember::create(['name' => 'Zendaya']);

        GalleryVideo::create(['user_id' => $this->user->id, 'videoable_type' => 'movie', 'videoable_id' => $movie->id, 'url' => 'https://youtu.be/one', 'platform' => 'youtube', 'title' => 'Beta trailer', 'channel' => 'Legendary']);
        GalleryVideo::create(['user_id' => $this->user->id, 'videoable_type' => 'movie', 'videoable_id' => $movie->id, 'url' => 'https://youtu.be/two', 'platform' => 'youtube', 'title' => 'Alpha featurette', 'channel' => 'Warner']);
        GalleryVideo::create(['user_id' => $this->user->id, 'videoable_type' => GalleryParent::ACTOR, 'videoable_id' => $actor->id, 'url' => 'https://youtu.be/three', 'platform' => 'youtube', 'title' => 'Interview', 'channel' => 'Talk show']);
    }

    public function test_the_owner_type_filter_splits_records_from_actors(): void
    {
        $this->seedVideos();

        $this->getJson('/api/gallery/videos')->assertOk()->assertJsonCount(3, 'data');
        $this->getJson('/api/gallery/videos?owner_type=actor')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.title', 'Interview');
        $this->getJson('/api/gallery/videos?owner_type=record')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_search_matches_title_or_channel_and_sort_orders_the_list(): void
    {
        $this->seedVideos();

        $this->getJson('/api/gallery/videos?q=warner')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.title', 'Alpha featurette');
        $this->getJson('/api/gallery/videos?q=trailer')->assertOk()->assertJsonCount(1, 'data');

        $titles = collect($this->getJson('/api/gallery/videos?sort=title')->assertOk()->json('data'))->pluck('title')->all();
        $this->assertSame(['Alpha featurette', 'Beta trailer', 'Interview'], $titles);

        $oldest = collect($this->getJson('/api/gallery/videos?sort=old')->assertOk()->json('data'))->pluck('title')->first();
        $this->assertSame('Beta trailer', $oldest);

        $this->getJson('/api/gallery/videos?sort=sideways')->assertStatus(422);
    }
}
