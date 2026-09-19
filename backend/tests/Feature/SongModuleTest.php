<?php

namespace Tests\Feature;

use App\Models\GalleryImage;
use App\Models\Module;
use App\Models\Song;
use App\Models\SongFile;
use App\Models\SongGenre;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * სიმღერების მოდული (`song`, 2026-09-03).
 *
 * ამოწმებს იმას, რაც „ცალკე მოდულის" გადაწყვეტილებას ამართლებს: მოდულის
 * gate, საკუთარი ჟანრების ლექსიკონი, სრული ველების ნაკრები და მფლობელობა.
 */
class SongModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('mona', ['song']);
    }

    private function makeUser(string $name, array $modules): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', $modules)->pluck('id')->all());

        return $user->refresh();
    }

    /** მოდულის gate + სრული ველების ნაკრები (19.x: „სრული მუსიკის ბაზა") */
    public function test_module_gate_and_full_field_set(): void
    {
        $outsider = $this->makeUser('nomodule', []);
        $this->actingAs($outsider)->getJson('/api/songs')->assertStatus(403);

        $genreId = $this->actingAs($this->user)->getJson('/api/song-genres')->json('data.0.id');

        $this->actingAs($this->user)
            ->postJson('/api/songs', [
                'title' => 'თბილისო',
                'artist' => 'ვახტანგ კიკაბიძე',
                'album' => 'ოქროს კოლექცია',
                'year' => 1959,
                'genre_ids' => [$genreId],
                'duration' => 214,
                'rating' => 9,
                'tags' => ['ქართული', 'ქართული', ' რეტრო '],
                'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                'autofill' => 0,
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.artist', 'ვახტანგ კიკაბიძე')
            ->assertJsonPath('data.album', 'ოქროს კოლექცია')
            ->assertJsonPath('data.year', 1959)
            ->assertJsonPath('data.genre_ids', [$genreId])
            ->assertJsonPath('data.duration', 214)
            ->assertJsonPath('data.rating', 9)
            ->assertJsonPath('data.platform', 'youtube')
            ->assertJsonPath('data.embed_url', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
            // 16.5 — ხილვადობა default-ად პირადია
            ->assertJsonPath('data.visibility', 'private')
            // ტეგების დუბლი რეგისტრისა და სივრცის მიუხედავად იჭრება
            ->assertJsonPath('data.tags', ['ქართული', 'რეტრო']);
    }

    /** ქულა 1..10-ის გარეთ არ გადის */
    public function test_rating_is_bounded(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/songs', [
                'title' => 'X',
                'url' => 'https://youtu.be/aaaaaaaaaaa',
                'rating' => 11,
                'autofill' => 0,
            ])
            ->assertStatus(422);
    }

    /** ჟანრი **per-user** ლექსიკონია — სხვისი ჟანრის id 422-ია */
    public function test_genre_dictionary_is_per_user(): void
    {
        $other = $this->makeUser('otto', ['song']);

        $this->actingAs($this->user)->getJson('/api/song-genres')->assertOk();
        $theirGenre = $this->actingAs($other)->getJson('/api/song-genres')->json('data.0.id');

        // ლენივი დეფაულტები ორივე ანგარიშზე ცალკე შეიქმნა
        $this->assertSame(
            count(SongGenre::DEFAULTS) * 2,
            SongGenre::withoutGlobalScope('owner')->count(),
        );

        $this->actingAs($this->user)
            ->postJson('/api/songs', [
                'title' => 'X',
                'url' => 'https://youtu.be/aaaaaaaaaaa',
                'genre_ids' => [$theirGenre],
                'autofill' => 0,
            ])
            ->assertStatus(422);
    }

    /**
     * **მრავალჟანრიანობა** (`DECISIONS.md` §5, 2026-09-06) — ჩანაწერზე
     * რამდენიმე ჟანრია და ფილტრი მათ **AND**-ით კვეთს (5.2-ის წესი).
     */
    public function test_a_song_can_have_several_genres_and_the_filter_ands_them(): void
    {
        $genres = $this->actingAs($this->user)->getJson('/api/song-genres')->json('data');
        [$pop, $rock] = [$genres[0]['id'], $genres[1]['id']];

        $both = $this->actingAs($this->user)
            ->postJson('/api/songs', [
                'title' => 'Both',
                'url' => 'https://youtu.be/aaaaaaaaaaa',
                'genre_ids' => [$pop, $rock],
                'autofill' => 0,
            ])
            ->assertStatus(201)
            ->json('data.id');

        $this->actingAs($this->user)
            ->postJson('/api/songs', [
                'title' => 'RockOnly',
                'url' => 'https://youtu.be/bbbbbbbbbbb',
                'genre_ids' => [$rock],
                'autofill' => 0,
            ])
            ->assertStatus(201);

        // ერთი ჟანრი — ორივე ჩანაწერი
        $this->actingAs($this->user)
            ->getJson("/api/songs?genre_id={$rock}")
            ->assertJsonCount(2, 'data');

        // ორი ჟანრი — მხოლოდ ის, რომელსაც **ორივე** აქვს
        $this->actingAs($this->user)
            ->getJson("/api/songs?genre_id={$pop},{$rock}")
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $both);

        // ⚠️ ცარიელი მასივი აღარ „ხსნის" ჟანრებს — მინიმუმ ერთი სავალდებულოა.
        // ძველი ქცევა („ცარიელი = თავისუფალდება") განზრახვედ შეიცვალა 422-ით.
        $this->actingAs($this->user)
            ->patchJson("/api/songs/{$both}", ['genre_ids' => [], 'autofill' => 0])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['genre_ids']);
    }

    /**
     * ჟანრის წაშლა სიმღერას არ შლის — გადააქვს ან ჟანრის გარეშე ტოვებს.
     *
     * ⚠️ pivot-ზე „გადატანა" **ამატებს** და არა ცვლის: სიმღერის დანარჩენი
     * ჟანრები უნდა შენარჩუნდეს (თამაშების იგივე წესი).
     */
    public function test_deleting_a_genre_moves_its_songs(): void
    {
        $genres = $this->actingAs($this->user)->getJson('/api/song-genres')->json('data');
        [$from, $to, $keep] = [$genres[0]['id'], $genres[1]['id'], $genres[2]['id']];

        $song = $this->actingAs($this->user)
            ->postJson('/api/songs', [
                'title' => 'X',
                'url' => 'https://youtu.be/aaaaaaaaaaa',
                'genre_ids' => [$from, $keep],
                'autofill' => 0,
            ])
            ->json('data.id');

        $this->actingAs($this->user)
            ->deleteJson("/api/song-genres/{$from}", ['move_to' => $to])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $left = $this->actingAs($this->user)->getJson("/api/songs/{$song}")->json('data.genre_ids');

        // წაშლილი ჟანრი გაქრა, სამიზნე დაემატა, დანარჩენი გადარჩა
        $this->assertEqualsCanonicalizing([$to, $keep], $left);
    }

    /** სხვისი სიმღერა 404-ია (`BelongsToUser`-ის `owner` scope) */
    public function test_another_users_song_is_not_found(): void
    {
        $other = $this->makeUser('otto', ['song']);
        $song = Song::create([
            'user_id' => $other->id,
            'title' => 'Theirs',
            'url' => 'https://youtu.be/bbbbbbbbbbb',
        ]);

        $this->actingAs($this->user)->getJson("/api/songs/{$song->id}")->assertStatus(404);
        $this->actingAs($this->user)->deleteJson("/api/songs/{$song->id}")->assertStatus(404);
    }

    /** ატვირთული ფოტო კვოტაზე გადის და წაშლისას თავისუფლდება (17.1) */
    public function test_thumbnail_counts_towards_the_quota(): void
    {
        Storage::fake('public');

        // ⚠️ ჟანრი სავალდებულოა — უინგო, შექმნა 422-ით დაბრუნდება
        $genreId = $this->actingAs($this->user)->getJson('/api/song-genres')->json('data.0.id');

        $id = $this->actingAs($this->user)
            ->post('/api/songs', [
                'title' => 'X',
                'url' => 'https://youtu.be/aaaaaaaaaaa',
                'autofill' => 0,
                'genre_ids' => [$genreId],
                'thumbnail' => UploadedFile::fake()->image('cover.jpg'),
            ])
            ->assertStatus(201)
            ->json('data.id');

        $used = (int) $this->user->refresh()->storage_used_bytes;
        $this->assertGreaterThan(0, $used);
        // მოდულის ჭრილშიც სიმღერას ეკუთვნის და არა ვიდეოს
        $this->actingAs($this->user)->getJson('/api/storage')->assertJsonPath('modules.song', $used);

        /* ⚠️ **კალათა (FEAT-11)** — `DELETE /api/<module>/{id}` ჩანაწერს
           აღარ შლის, კალათაში გადააქვს; ფაილი და კვოტა მაშინ თავისუფლდება,
           როცა ის კალათიდანაც წაიშლება. ტესტი სწორედ ამ სრულ გზას გადის. */
        $this->actingAs($this->user)->deleteJson("/api/songs/{$id}")->assertNoContent();
        $this->actingAs($this->user)->deleteJson("/api/trash/song/{$id}")->assertNoContent();
        $this->assertSame(0, (int) $this->user->refresh()->storage_used_bytes);
    }

    /** გალერეა სიმღერასაც ეკიდება — morph alias `song` (სქემის მზადყოფნა) */
    public function test_gallery_images_can_hang_on_a_song(): void
    {
        Storage::fake('public');

        $song = Song::create([
            'user_id' => $this->user->id,
            'title' => 'X',
            'url' => 'https://youtu.be/aaaaaaaaaaa',
        ]);

        Storage::disk('public')->put('gallery/images/cover.jpg', str_repeat('x', 128));
        $song->galleryImages()->create([
            'user_id' => $this->user->id,
            'source' => 'upload',
            'path' => 'gallery/images/cover.jpg',
            'size' => 128,
        ]);

        $this->assertSame('song', GalleryImage::withoutGlobalScope('owner')->firstOrFail()->imageable_type);

        // სიმღერის წაშლა ფოტოსაც შლის (morphs cascade-ს არ ქმნის)
        $song->delete();

        $this->assertSame(0, GalleryImage::withoutGlobalScope('owner')->count());
        Storage::disk('public')->assertMissing('gallery/images/cover.jpg');
    }

    /* ---------- §7.4 — მიმაგრებული ფაილები და ჩანიშვნები ---------- */

    /**
     * ატვირთვა კვოტაზე გადის, საქაღალდე მოდულისაა და **წაშლა ორივეს
     * აბრუნებს** — დისკსაც და მრიცხველსაც (`StoredFile`-ის გარანტია).
     */
    public function test_song_files_are_metered_and_released(): void
    {
        Storage::fake('public');
        $song = Song::create(['user_id' => $this->user->id, 'title' => 'მზე', 'url' => 'https://youtu.be/abc123']);

        $ids = $this->actingAs($this->user)
            ->post("/api/songs/{$song->id}/files", [
                'kind' => 'doc',
                'files' => [UploadedFile::fake()->create('lyrics.pdf', 120)],
            ])
            ->assertCreated()
            ->json('data.*.id');

        $file = SongFile::findOrFail($ids[0]);
        // ⚠️ ფესვი მოდულისაა (`songs/`), თორემ §17.2-ის ლიმიტი სხვას დაეთვლებოდა
        $this->assertStringStartsWith('songs/files/docs/', $file->path);
        Storage::disk('public')->assertExists($file->path);

        $used = (int) $this->user->fresh()->storage_used_bytes;
        $this->assertSame((int) $file->size, $used);
        $this->actingAs($this->user)->getJson('/api/storage')
            ->assertOk()
            ->assertJsonPath('modules.song', $used);

        $this->actingAs($this->user)
            ->deleteJson("/api/song-files/{$file->id}")
            ->assertNoContent();

        Storage::disk('public')->assertMissing($file->path);
        $this->assertSame(0, (int) $this->user->fresh()->storage_used_bytes);
    }

    /**
     * ⚠️ **სიმღერის წაშლა ფაილსაც იღებს და კვოტასაც ათავისუფლებს.** SQL-ის
     * cascade რიგებს წაიღებდა, დისკზე კი ფაილი დარჩებოდა — ივენთი არ ისვრება.
     * ტესტი **მოდელით** შლის (და არა endpoint-ით), რომ `PurgeService`-ის
     * გზაც დაიფაროს (17.1-ის წესი).
     */
    public function test_deleting_the_song_removes_its_files_at_model_level(): void
    {
        Storage::fake('public');
        $song = Song::create(['user_id' => $this->user->id, 'title' => 'მზე', 'url' => 'https://youtu.be/abc123']);

        $this->actingAs($this->user)->post("/api/songs/{$song->id}/files", [
            'kind' => 'image',
            'files' => [UploadedFile::fake()->image('cover.jpg')],
        ])->assertCreated();

        $path = SongFile::firstOrFail()->path;
        $this->assertGreaterThan(0, (int) $this->user->fresh()->storage_used_bytes);

        $song->delete();

        Storage::disk('public')->assertMissing($path);
        $this->assertSame(0, SongFile::count());
        $this->assertSame(0, (int) $this->user->fresh()->storage_used_bytes);
    }

    /** ჩანიშვნები — შექმნა, რედაქტირება, წაშლა და სხვისი ჩანიშვნის 404 */
    public function test_song_notes_are_per_user(): void
    {
        $song = Song::create(['user_id' => $this->user->id, 'title' => 'მზე', 'url' => 'https://youtu.be/abc123']);

        $id = $this->actingAs($this->user)
            ->postJson("/api/songs/{$song->id}/notes", ['body' => 'გიტარის აკორდები'])
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($this->user)
            ->patchJson("/api/song-notes/{$id}", ['body' => 'აკორდები: Am F C G'])
            ->assertOk()
            ->assertJsonPath('data.body', 'აკორდები: Am F C G');

        $this->actingAs($this->user)
            ->getJson("/api/songs/{$song->id}/notes")
            ->assertOk()
            ->assertJsonCount(1, 'data');

        // სხვისი ჩანიშვნა 404-ია (`BelongsToUser`-ის global scope)
        $other = $this->makeUser('otto', ['song']);
        $this->actingAs($other)->deleteJson("/api/song-notes/{$id}")->assertStatus(404);

        $this->actingAs($this->user)->deleteJson("/api/song-notes/{$id}")->assertNoContent();
    }
}
