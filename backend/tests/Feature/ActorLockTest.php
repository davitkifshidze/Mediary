<?php

namespace Tests\Feature;

use App\Models\CastMember;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\Module;
use App\Models\Movie;
use App\Models\RecordLock;
use App\Models\User;
use App\Support\LockedPhotos;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **მსახიობისა და ფოტოს ჩაკეტვა.**
 *
 * მსახიობი გლობალურია, ე.ი. ლოკი **მნახველისაა**: ჩემი პაროლი მას მხოლოდ ჩემგან
 * მალავს — `/actors`, მისი გვერდი, ჩანაწერის მსახიობები, ძებნა, გალერეა და ჩემი
 * საჯარო გალერეა; სხვა ანგარიშს ის ჩვეულებრივ უჩანს. ფოტოს „ჩაკეტვა" მას
 * სისტემურ ჩაკეტილ ალბომში გადაიტანს (პირველად — პაროლით).
 */
class ActorLockTest extends TestCase
{
    use RefreshDatabase;

    private User $me;

    private User $other;

    private CastMember $actor;

    private Movie $mine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        Storage::fake('public');
        Storage::fake('private');

        $this->me = $this->makeUser('nino');
        $this->other = $this->makeUser('gio');

        $this->actor = CastMember::create(['name' => 'Liam Neeson', 'tmdb_person_id' => 3896]);
        $this->mine = $this->movie($this->me, 'Taken');
        $this->mine->castLinks()->attach($this->actor->id, ['billing_order' => 0]);
        $this->movie($this->other, 'Schindler')->castLinks()->attach($this->actor->id, ['billing_order' => 0]);
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'series', 'anime', 'gallery'])->pluck('id')->all());

        return $user->refresh();
    }

    private function movie(User $owner, string $title): Movie
    {
        $movie = Movie::create(['user_id' => $owner->id, 'year' => 2010]);
        $movie->setTranslation('en', ['title' => $title]);

        return $movie;
    }

    private function spa(?User $user = null)
    {
        return $this->actingAs($user ?? $this->me)->withHeaders(['Referer' => 'http://localhost:5173']);
    }

    /** ჩემი ლოკი მოდელით — სესიაში არავინ გახსნა */
    private function lockActor(): RecordLock
    {
        return RecordLock::create([
            'user_id' => $this->me->id,
            'lockable_type' => 'cast_member',
            'lockable_id' => $this->actor->id,
            'password_hash' => Hash::make('secret1'),
        ]);
    }

    private function photo(User $owner, string $type, int $id, string $name): GalleryImage
    {
        Storage::disk('public')->put("gallery/images/{$name}.jpg", 'x');

        return GalleryImage::create([
            'user_id' => $owner->id, 'imageable_type' => $type, 'imageable_id' => $id,
            'source' => 'web', 'category' => 'still', 'path' => "gallery/images/{$name}.jpg", 'size' => 1,
        ]);
    }

    public function test_my_lock_hides_the_actor_from_me_only(): void
    {
        $this->lockActor();

        $this->actingAs($this->me)->getJson('/api/actors')->assertOk()->assertJsonCount(0, 'items');
        $card = $this->getJson('/api/actors?locked=1')->assertOk()->assertJsonCount(1, 'items')->json('items.0');
        $this->assertTrue($card['hidden']);
        $this->assertSame('Liam Neeson', $card['name']);
        $this->assertArrayNotHasKey('photo', $card);

        $this->getJson("/api/cast/{$this->actor->id}")
            ->assertOk()
            ->assertJsonPath('actor.hidden', true)
            ->assertJsonPath('movies', [])
            ->assertJsonMissingPath('actor.biography');
        $this->getJson("/api/media/cast/movie/{$this->mine->id}")->assertOk()->assertJsonCount(0, 'data');
        $this->assertStringNotContainsString('Liam Neeson', $this->getJson('/api/search?q=Liam')->getContent());

        // ⚠️ სხვისთვის არაფერი შეცვლილა — ლოკი ჩემია
        $this->actingAs($this->other)->getJson('/api/actors')->assertOk()->assertJsonPath('items.0.name', 'Liam Neeson');
        $this->getJson("/api/cast/{$this->actor->id}")->assertOk()->assertJsonPath('actor.locked', false);
    }

    /** დამალულის სხვა კარები 423-ია — ტეგები, გალერეა, TMDB-ის განახლება */
    public function test_a_hidden_actor_refuses_its_other_doors(): void
    {
        $this->lockActor();

        $this->actingAs($this->me)->putJson("/api/cast/{$this->actor->id}/tags", ['tags' => ['x']])->assertStatus(423);
        $this->getJson("/api/gallery/cast/{$this->actor->id}")->assertStatus(423);
        $this->postJson("/api/cast/{$this->actor->id}/resync")->assertStatus(423);
    }

    public function test_locking_and_unlocking_through_the_api(): void
    {
        $this->spa()->putJson("/api/cast/{$this->actor->id}/lock", ['password' => 'secret1'])
            ->assertOk()
            ->assertJsonPath('data.locked', true)
            ->assertJsonPath('data.unlocked', true);

        // დამდები სესიაში ღიად რჩება, „ისევ ჩაკეტვა" მალავს
        $this->assertSame(1, count($this->getJson('/api/actors')->json('items')));
        $this->postJson("/api/cast/{$this->actor->id}/lock")->assertOk()->assertJsonPath('data.hidden', true);
        $this->assertSame([], $this->getJson('/api/actors')->json('items'));

        $this->postJson("/api/cast/{$this->actor->id}/unlock", ['password' => 'secret1'])->assertOk()->assertJsonPath('data.unlocked', true);
        $this->getJson("/api/cast/{$this->actor->id}")->assertOk()->assertJsonPath('actor.name', 'Liam Neeson')->assertJsonPath('actor.unlocked', true);

        // ლოკი ჩემია: უნიკალურობა მფლობელზეა, მეორე ანგარიშს თავისი შეიძლება ჰქონდეს
        $this->assertSame($this->me->id, RecordLock::withoutGlobalScopes()->value('user_id'));
    }

    /** ჩემი გალერეა — ფოტოს ბრტყელი სია და მსახიობების ჯგუფები */
    public function test_the_actors_photos_leave_my_gallery(): void
    {
        $actorPhoto = $this->photo($this->me, 'cast_member', $this->actor->id, 'liam');
        $moviePhoto = $this->photo($this->me, 'movie', $this->mine->id, 'taken');
        $this->lockActor();

        $this->actingAs($this->me);
        $this->assertSame([$moviePhoto->id], array_column($this->getJson('/api/gallery/photos')->assertOk()->json('data'), 'id'));
        $this->assertSame([], $this->getJson('/api/gallery/groups?by=actor')->assertOk()->json('groups'));

        $this->assertNotNull($actorPhoto->fresh());
    }

    /** ჩემი საჯარო გალერეა ჩემ მიერ ჩაკეტილ მსახიობს არ აჩვენებს */
    public function test_my_public_gallery_hides_my_locked_actor(): void
    {
        config(['mediary.public_profiles' => true]);
        $this->me->forceFill(['profile_visibility' => 'public'])->save();
        foreach (['movie', 'gallery'] as $key) {
            $this->me->modules()->syncWithoutDetaching([Module::where('key', $key)->value('id') => ['is_public' => true]]);
        }
        $this->mine->forceFill(['visibility' => 'public'])->save();
        $this->photo($this->me, 'cast_member', $this->actor->id, 'liam');

        $groups = fn () => array_column($this->getJson('/api/public/profiles/nino/gallery-groups?by=actor')->assertOk()->json('groups') ?? [], 'id');

        $this->assertSame([$this->actor->id], $groups());

        $this->lockActor();

        $this->assertSame([], $groups());
    }

    /**
     * **ფოტოს ჩაკეტვა** — პირველად პაროლს ითხოვს (409) და სისტემურ ჩაკეტილ ალბომს
     * ქმნის; ფოტო `gallery/locked`-ში გადადის; შემდეგი ფოტო იმავე ალბომში მიდის.
     */
    public function test_locking_photos_moves_them_into_the_locked_photos_album(): void
    {
        $first = $this->photo($this->me, 'movie', $this->mine->id, 'one');
        $second = $this->photo($this->me, 'movie', $this->mine->id, 'two');

        $this->actingAs($this->me)->postJson('/api/gallery/images/lock', ['ids' => [$first->id]])
            ->assertStatus(409)
            ->assertJsonPath('message', 'locked_album_password_required');

        $albumId = $this->postJson('/api/gallery/images/lock', ['ids' => [$first->id], 'password' => 'secret1'])
            ->assertOk()
            ->assertJsonPath('created', true)
            ->json('album_id');

        $album = GalleryAlbum::query()->withoutGlobalScopes()->findOrFail($albumId);
        $this->assertTrue($album->isLocked());
        $this->assertSame(LockedPhotos::NAME, $album->name);

        $first = GalleryImage::withoutGlobalScopes()->findOrFail($first->id);
        $this->assertSame($albumId, $first->album_id);
        $this->assertStringStartsWith('gallery/locked/', $first->path);
        Storage::disk('private')->assertExists($first->path);

        // მეორე — პაროლის გარეშე, იმავე ალბომში
        $this->postJson('/api/gallery/images/lock', ['ids' => [$second->id]])
            ->assertOk()
            ->assertJsonPath('created', false)
            ->assertJsonPath('album_id', $albumId);

        // სხვისი ფოტო ვერ მოიძებნება
        $theirs = $this->photo($this->other, 'movie', $this->mine->id, 'theirs');
        $this->postJson('/api/gallery/images/lock', ['ids' => [$theirs->id]])->assertNotFound();
    }

    /** ურნაში გადატანილი სისტემური ალბომი აღარ ითვლება — შემდეგი ჩაკეტვა ისევ პაროლს ითხოვს */
    public function test_a_trashed_locked_photos_album_is_not_reused(): void
    {
        $photo = $this->photo($this->me, 'movie', $this->mine->id, 'one');
        $album = LockedPhotos::create($this->me, 'secret1');
        $album->moveToTrash();

        $this->actingAs($this->me)->postJson('/api/gallery/images/lock', ['ids' => [$photo->id]])
            ->assertStatus(409)
            ->assertJsonPath('message', 'locked_album_password_required');
    }
}
