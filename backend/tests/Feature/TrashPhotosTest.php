<?php

namespace Tests\Feature;

use App\Models\GalleryImage;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Place;
use App\Models\TrashedFile;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **მთავარი ფოტო და ავატარი ურნაში (Tasks §29, ეტაპი 4).**
 *
 * ⚠️ მოწმდება სამი ზღვარი: **მხოლოდ შენი ატვირთული** მიდის ურნაში (TMDB-ის
 * საერთო ფაილი და გალერეის ფოტო — არა; ეს უკანასკნელი ადრე ადგილის ფოტოს
 * ჩანაცვლებისას დისკიდანაც იშლებოდა), დაკავებულ სვეტში აღდგენა **ჯერ
 * იკითხავს** (`slot_taken`, ხოლო `replace` ახლანდელს ურნაში გადაიტანს), და
 * ჩანაწერის საბოლოო წაშლა ურნაში მყოფ ფოტოსაც შლის.
 */
class TrashPhotosTest extends TestCase
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
            'name' => 'photos', 'username' => 'photos',
            'email' => 'photos@example.com', 'password' => 'password',
        ]);
        $this->me->modules()->sync(Module::pluck('id')->all());
        $this->me->refresh();
    }

    private function movieWithUploadedPoster(): Movie
    {
        Storage::disk('public')->put('movies/posters/old.jpg', str_repeat('x', 500));

        $movie = Movie::create([
            'user_id' => $this->me->id, 'year' => 2001,
            'poster_path' => 'movies/posters/old.jpg', 'poster_source' => 'upload',
        ]);
        $movie->translations()->create(['locale' => 'en', 'title' => 'Old']);
        app(StorageMeter::class)->recalculate($this->me);

        return $movie->refresh();
    }

    private function used(): int
    {
        return (int) $this->me->refresh()->storage_used_bytes;
    }

    /** ჩანაცვლება: ძველი ურნაში, ორივე ადგილს იკავებს; აღდგენა ჯერ იკითხავს, მერე ჩაანაცვლებს */
    public function test_a_replaced_poster_goes_to_the_trash_and_can_swap_back(): void
    {
        $movie = $this->movieWithUploadedPoster();

        $this->actingAs($this->me)->post("/api/movies/{$movie->id}", [
            '_method' => 'PUT',
            'title_en' => 'Old',
            'poster' => UploadedFile::fake()->image('new.jpg', 10, 10),
        ])->assertOk();

        $new = $movie->refresh()->poster_path;
        $this->assertNotSame('movies/posters/old.jpg', $new);
        Storage::disk('public')->assertExists('movies/posters/old.jpg');

        $trashed = TrashedFile::withoutGlobalScope('owner')->sole();
        $this->assertSame(['record_photo', 'movie', 'poster_path'], [$trashed->kind, $trashed->record_type, $trashed->slot]);
        $this->assertSame(500 + Storage::disk('public')->size($new), $this->used(), 'ურნაში მყოფი ადგილს კვლავ იკავებს');

        // სვეტი დაკავებულია — ჯერ იკითხავს
        $item = collect($this->actingAs($this->me)->getJson('/api/trash')->json('data'))->firstWhere('kind', 'record_photo')['items'][0];
        $this->assertSame('slot_taken', $item['blocked']);
        $this->assertTrue($item['replaceable']);
        $this->actingAs($this->me)->postJson("/api/trash/record_photo/{$trashed->id}/restore")->assertStatus(409)->assertJsonPath('message', 'slot_taken');

        // ჩანაცვლება — ახალი თვითონ გადადის ურნაში
        $this->actingAs($this->me)->postJson("/api/trash/record_photo/{$trashed->id}/restore", ['replace' => true])->assertOk();

        $this->assertSame('movies/posters/old.jpg', $movie->refresh()->poster_path);
        $this->assertSame('upload', $movie->poster_source);
        $this->assertSame($new, TrashedFile::withoutGlobalScope('owner')->sole()->path);
    }

    /** მოშორება: სვეტი ცარიელდება, ფოტო ურნაში; აღდგენა ცარიელ სვეტში პირდაპირ */
    public function test_a_removed_poster_comes_back_into_its_empty_slot(): void
    {
        $movie = $this->movieWithUploadedPoster();

        $this->actingAs($this->me)->putJson("/api/movies/{$movie->id}", ['title_en' => 'Old', 'remove_poster' => true])->assertOk();

        $this->assertNull($movie->refresh()->poster_path);
        $this->assertSame(500, $this->used());

        $trashed = TrashedFile::withoutGlobalScope('owner')->sole();
        $this->actingAs($this->me)->postJson("/api/trash/record_photo/{$trashed->id}/restore")->assertOk();

        $this->assertSame('movies/posters/old.jpg', $movie->refresh()->poster_path);
    }

    /** ⚠️ TMDB-ის პოსტერი შენი არ არის — ურნაში არ მიდის და არც იშლება */
    public function test_a_shared_tmdb_poster_never_goes_to_the_trash(): void
    {
        Storage::disk('public')->put('movies/posters/shared.jpg', 'x');
        $movie = Movie::create(['user_id' => $this->me->id, 'year' => 2001, 'poster_path' => 'movies/posters/shared.jpg', 'poster_source' => 'tmdb']);

        $this->actingAs($this->me)->putJson("/api/movies/{$movie->id}", ['title_en' => 'Old', 'remove_poster' => true])->assertOk();

        $this->assertSame(0, TrashedFile::withoutGlobalScope('owner')->count());
        Storage::disk('public')->assertExists('movies/posters/shared.jpg');
    }

    /** ავატარის მოშორება ურნაშია; აღდგენა ცარიელ სვეტში */
    public function test_an_avatar_goes_to_the_trash_and_back(): void
    {
        Storage::disk('public')->put('account/avatars/me.jpg', str_repeat('x', 200));
        $this->me->forceFill(['avatar_path' => 'account/avatars/me.jpg'])->save();

        $this->actingAs($this->me)->patchJson('/api/auth/profile', ['remove_avatar' => true])->assertOk();

        $this->assertNull($this->me->refresh()->avatar_path);
        Storage::disk('public')->assertExists('account/avatars/me.jpg');

        $trashed = TrashedFile::withoutGlobalScope('owner')->sole();
        $this->assertSame('avatar', $trashed->kind);

        $this->actingAs($this->me)->postJson("/api/trash/avatar/{$trashed->id}/restore")->assertOk();
        $this->assertSame('account/avatars/me.jpg', $this->me->refresh()->avatar_path);
    }

    /**
     * ⚠️ **გალერეიდან „მთავარად დაყენებული" ადგილის ფოტო გალერეისაა** — ადრე
     * ადგილის ფოტოს ჩანაცვლება გალერეის ფაილს დისკიდან შლიდა (რიგი რჩებოდა,
     * ფოტო ტყდებოდა); ის არც ურნაში მიდის და არც ორჯერ ითვლება.
     */
    public function test_a_places_gallery_main_photo_is_left_to_the_gallery(): void
    {
        $place = Place::create(['user_id' => $this->me->id, 'name' => 'Kazbegi']);
        Storage::disk('public')->put('gallery/images/k.jpg', str_repeat('x', 300));
        GalleryImage::create([
            'user_id' => $this->me->id, 'imageable_type' => 'place', 'imageable_id' => $place->id,
            'source' => 'web', 'category' => 'backdrop', 'path' => 'gallery/images/k.jpg', 'size' => 300,
        ]);
        $place->forceFill(['photo_path' => 'gallery/images/k.jpg'])->save();

        // ⚠️ გადათვლა გალერეის ფაილს ერთხელ ითვლის
        $this->assertSame(300, app(StorageMeter::class)->recalculate($this->me));

        $this->actingAs($this->me)->post("/api/places/{$place->id}", [
            '_method' => 'PUT',
            'photo' => UploadedFile::fake()->image('mine.jpg', 10, 10),
        ])->assertOk();

        Storage::disk('public')->assertExists('gallery/images/k.jpg');
        $this->assertSame(0, TrashedFile::withoutGlobalScope('owner')->count());
    }

    /** ჩანაწერის საბოლოო წაშლა ურნაში მყოფ მის ფოტოსაც შლის — სვეტი აღარ არსებობს */
    public function test_hard_deleting_a_record_takes_its_trashed_photo_with_it(): void
    {
        $movie = $this->movieWithUploadedPoster();
        $this->actingAs($this->me)->putJson("/api/movies/{$movie->id}", ['title_en' => 'Old', 'remove_poster' => true])->assertOk();

        $this->actingAs($this->me)->deleteJson("/api/movies/{$movie->id}")->assertNoContent();
        $this->actingAs($this->me)->deleteJson("/api/trash/movie/{$movie->id}")->assertNoContent();

        $this->assertSame(0, TrashedFile::withoutGlobalScope('owner')->count());
        Storage::disk('public')->assertMissing('movies/posters/old.jpg');
        $this->assertSame(0, $this->used());
    }

    /** ვადის ამოწურვა ფოტოსაც შლის — ფაილიც და კვოტაც */
    public function test_prune_deletes_an_expired_photo(): void
    {
        $movie = $this->movieWithUploadedPoster();
        $this->actingAs($this->me)->putJson("/api/movies/{$movie->id}", ['title_en' => 'Old', 'remove_poster' => true])->assertOk();
        TrashedFile::withoutGlobalScope('owner')->update(['trashed_at' => now()->subDays(40)]);

        $this->artisan('trash:prune')->assertSuccessful();

        Storage::disk('public')->assertMissing('movies/posters/old.jpg');
        $this->assertSame(0, $this->used());
    }
}
