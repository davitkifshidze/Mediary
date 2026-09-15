<?php

namespace Tests\Feature;

use App\Models\CastMember;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **უკატეგორიო სექცია, ალბომები და ფოტოს გადატანა (Tasks §26)**, პლუს
 * „ჩანაწერს ვშლი — ფოტოები დამიტოვე" (§25.5).
 */
class GalleryAlbumTest extends TestCase
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
    }

    private function makeMovie(string $title = 'Alien'): Movie
    {
        $movie = Movie::create(['user_id' => $this->user->id, 'year' => 1979]);
        $movie->translations()->create(['locale' => 'en', 'title' => $title]);

        return $movie->refresh();
    }

    private function photo(?object $parent, string $path = 'gallery/images/a.jpg'): GalleryImage
    {
        Storage::disk('public')->put($path, 'x');

        return GalleryImage::create([
            'user_id' => $this->user->id,
            'imageable_type' => $parent ? $parent->getMorphClass() : null,
            'imageable_id' => $parent?->getKey(),
            'source' => 'tmdb',
            'category' => 'backdrop',
            'path' => $path,
            'size' => 100,
        ]);
    }

    /** უმშობლო ფოტო კანონიერია და „უკატეგორიოს" ჭრილში ჩანს */
    public function test_a_photo_can_live_without_a_parent(): void
    {
        Storage::fake('public');
        $loose = $this->photo(null);
        $this->photo($this->makeMovie(), 'gallery/images/b.jpg');

        $this->actingAs($this->user)
            ->getJson('/api/gallery/photos?owner=none')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $loose->id)
            // ⚠️ უმშობლო ფოტოს `owner` **null**-ია და არა გამოტოვებული ველი
            ->assertJsonPath('data.0.owner', null);

        $this->actingAs($this->user)
            ->getJson('/api/gallery')
            ->assertOk()
            ->assertJsonPath('uncategorized', 1);
    }

    /**
     * გადატანის ორი ღერძი ცალ-ცალკე მუშაობს.
     *
     * ⚠️ **ალბომში ჩაგდება მშობელს არ ხსნის** — გასაღები რომ არ მოსულა,
     * ის ღერძი ხელუხლებელია. ამ ორის აღრევა ნიშნავდა, რომ ფოტოს
     * დახარისხება ჩუმად ფილმს მოაშორებდა.
     */
    public function test_moving_changes_only_the_axis_that_was_sent(): void
    {
        Storage::fake('public');
        $movie = $this->makeMovie();
        $image = $this->photo($movie);

        $album = $this->actingAs($this->user)
            ->postJson('/api/gallery/albums', ['name' => 'საყვარლები'])
            ->assertCreated()
            ->json();

        // მხოლოდ ალბომი
        $this->actingAs($this->user)
            ->postJson('/api/gallery/images/move', ['ids' => [$image->id], 'album_id' => $album['id']])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $image->refresh();
        $this->assertSame($album['id'], $image->album_id);
        $this->assertSame('movie', $image->imageable_type);

        // მხოლოდ მშობელი — ალბომი რჩება
        $actor = CastMember::create(['name' => 'Sigourney']);
        $this->actingAs($this->user)
            ->postJson('/api/gallery/images/move', ['ids' => [$image->id], 'target' => 'cast_member:'.$actor->id])
            ->assertOk();

        $image->refresh();
        $this->assertSame('cast_member', $image->imageable_type);
        $this->assertSame($album['id'], $image->album_id);

        // `none` — უკატეგორიოში
        $this->actingAs($this->user)
            ->postJson('/api/gallery/images/move', ['ids' => [$image->id], 'target' => 'none'])
            ->assertOk();

        $this->assertNull($image->refresh()->imageable_type);
    }

    /** სხვისი ფოტო უბრალოდ ვერ მოიძებნება — `owner` სკოუპი */
    public function test_moving_never_reaches_another_users_photo(): void
    {
        Storage::fake('public');
        $other = User::create([
            'name' => 'otto', 'username' => 'otto',
            'email' => 'otto@example.com', 'password' => 'password',
        ]);
        $theirs = GalleryImage::create([
            'user_id' => $other->id, 'imageable_type' => null, 'imageable_id' => null,
            'source' => 'upload', 'path' => 'gallery/images/x.jpg', 'size' => 10,
        ]);

        $album = $this->actingAs($this->user)
            ->postJson('/api/gallery/albums', ['name' => 'Mine'])->json();

        $this->actingAs($this->user)
            ->postJson('/api/gallery/images/move', ['ids' => [$theirs->id], 'album_id' => $album['id']])
            ->assertOk()
            ->assertJsonPath('moved', 0);

        $this->assertNull($theirs->refresh()->album_id);
    }

    /**
     * ალბომის წაშლა **ფოტოებს არ შლის** — ისინი უკატეგორიოში ბრუნდება
     * (ან `move_to`-თი სხვა ალბომში).
     */
    public function test_deleting_an_album_keeps_its_photos(): void
    {
        Storage::fake('public');
        $image = $this->photo(null);

        $album = $this->actingAs($this->user)->postJson('/api/gallery/albums', ['name' => 'A'])->json();
        $target = $this->actingAs($this->user)->postJson('/api/gallery/albums', ['name' => 'B'])->json();

        $this->actingAs($this->user)
            ->postJson('/api/gallery/images/move', ['ids' => [$image->id], 'album_id' => $album['id']])
            ->assertOk();

        $this->actingAs($this->user)
            ->deleteJson('/api/gallery/albums/'.$album['id'], ['move_to' => $target['id']])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $this->assertSame($target['id'], $image->refresh()->album_id);
        $this->assertSame(1, GalleryImage::withoutGlobalScope('owner')->count());
        $this->assertSame(1, GalleryAlbum::withoutGlobalScope('owner')->count());
    }

    /**
     * §25.5 — „ჩანაწერს ვშლი, ფოტოები გალერეაში დამიტოვე".
     *
     * ⚠️ ფოტო **უკატეგორიო** ხდება და არა იშლება; მოცულობა კი არ
     * თავისუფლდება, რასაც გეგმაც ცხადად ამბობს.
     */
    public function test_purge_can_keep_a_records_photos_in_the_gallery(): void
    {
        Storage::fake('public');
        $this->user->assignRole('super_admin')->save();

        $movie = $this->makeMovie();
        $image = $this->photo($movie);

        $this->actingAs($this->user->refresh())
            ->postJson('/api/admin/purge/plan', [
                'target' => 'movie', 'mode' => 'all', 'keep_gallery' => true,
            ])
            ->assertOk()
            ->assertJsonPath('plan.photos', 0)
            ->assertJsonPath('plan.kept_photos', 1)
            // ადგილი არ თავისუფლდება — ფაილი დისკზე რჩება
            ->assertJsonPath('plan.bytes', 0);

        $this->actingAs($this->user)
            ->postJson('/api/admin/purge/item', [
                'target' => 'movie', 'id' => $movie->id,
                'keep_gallery' => true, 'confirm' => 'DELETE',
            ])
            ->assertOk();

        $this->assertSame(0, Movie::withoutGlobalScope('owner')->count());
        $kept = GalleryImage::withoutGlobalScope('owner')->find($image->id);
        $this->assertNotNull($kept, 'the photo must survive the record');
        $this->assertNull($kept->imageable_type);
    }

    /** ნაგულისხმევად ისევ იშლება — „დატოვება" ცხადი არჩევანია */
    public function test_without_the_flag_the_gallery_still_goes(): void
    {
        Storage::fake('public');
        $this->user->assignRole('super_admin')->save();

        $movie = $this->makeMovie();
        $image = $this->photo($movie);

        $this->actingAs($this->user->refresh())
            ->postJson('/api/admin/purge/item', [
                'target' => 'movie', 'id' => $movie->id, 'confirm' => 'DELETE',
            ])
            ->assertOk();

        $this->assertNull(GalleryImage::withoutGlobalScope('owner')->find($image->id));
    }
}
