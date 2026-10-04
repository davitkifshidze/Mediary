<?php

namespace Tests\Feature;

use App\Models\CastMember;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use App\Services\Users\AccountEraser;
use App\Support\StorageFolder;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **ახალი მსახიობი და მისი ხილვადობა (Tasks §35.3, Q9).**
 *
 * ხელით შექმნილი — `created_by`, ფოტო შემქმნელის კვოტით, **მხოლოდ მას უჩანს**
 * (ძებნა, გვერდი, მიბმა — სხვისთვის 404), სანამ TMDB-ის პირს არ დაუკავშირდება.
 * დუბლი არ იქმნება; TMDB-ის მსახიობს ხელით ვერ შეცვლი.
 */
class CastCreateTest extends TestCase
{
    use RefreshDatabase;

    private User $nino;

    private User $gio;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        Storage::fake('public');

        $this->nino = $this->makeUser('nino');
        $this->gio = $this->makeUser('gio');
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'series', 'anime', 'gallery'])->pluck('id')->all());

        return $user->refresh();
    }

    private function createManual(array $extra = []): int
    {
        return $this->actingAs($this->nino)
            ->post('/api/cast', [
                'name' => 'Nino Kasradze',
                'name_ka' => 'ნინო ქასრაძე',
                'gender' => CastMember::GENDER_FEMALE,
                'birthday' => '1980-05-02',
                'biography' => 'ქართველი მსახიობი.',
                ...$extra,
            ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('existing', false)
            ->json('actor.id');
    }

    public function test_a_hand_made_actor_belongs_to_its_creator_and_its_photo_to_the_creators_quota(): void
    {
        $id = $this->createManual(['photo' => UploadedFile::fake()->image('nino.jpg', 300, 450)]);

        $member = CastMember::withoutGlobalScopes()->findOrFail($id);
        $this->assertSame($this->nino->id, $member->created_by);
        $this->assertTrue($member->isPrivate());
        $this->assertStringStartsWith(StorageFolder::CAST_UPLOADS."/{$id}/", $member->photo_path);
        Storage::disk('public')->assertExists($member->photo_path);

        $size = Storage::disk('public')->size($member->photo_path);
        $this->assertSame($size, (int) $this->nino->refresh()->storage_used_bytes);
        $this->assertContains($member->photo_path, app(StorageMeter::class)->files($this->nino)->pluck('path')->all());

        $this->actingAs($this->nino)->getJson("/api/cast/{$id}")
            ->assertOk()
            ->assertJsonPath('actor.name_ka', 'ნინო ქასრაძე')
            ->assertJsonPath('actor.created_by_me', true)
            ->assertJsonPath('actor.is_private', true)
            ->assertJsonPath('actor.birthday', '1980-05-02');

        // ⚠️ ჩანაწერის გარეშეც ჩემს სიაშია — ის მე შევქმენი
        $this->actingAs($this->nino)->getJson('/api/actors')
            ->assertOk()
            ->assertJsonPath('items.0.id', $id)
            ->assertJsonPath('items.0.records', 0);
    }

    /** ⚠️ სხვისი კერძო მსახიობი არსად ჩანს — გვერდი, ძებნა, მიბმა, რედაქტირება 404-ია */
    public function test_someone_elses_hand_made_actor_is_invisible(): void
    {
        $id = $this->createManual();
        $movie = Movie::create(['user_id' => $this->gio->id, 'year' => 2020]);

        $this->actingAs($this->gio)->getJson("/api/cast/{$id}")->assertNotFound();
        $this->actingAs($this->gio)->getJson('/api/cast/search?q=Kasradze')
            ->assertOk()
            ->assertJsonCount(0, 'items');
        $this->actingAs($this->gio)->postJson("/api/media/cast/movie/{$movie->id}", ['cast_member_id' => $id])->assertNotFound();
        $this->actingAs($this->gio)->putJson("/api/cast/{$id}", ['name' => 'Hacked'])->assertNotFound();
        $this->actingAs($this->gio)->getJson('/api/actors')->assertJsonCount(0, 'items');

        // ⚠️ იგივე სახელით მას თავისი რიგი ექმნება — ჩემს კერძოს არ „პოულობს"
        $this->actingAs($this->gio)->postJson('/api/cast', ['name' => 'Nino Kasradze'])
            ->assertCreated()
            ->assertJsonPath('existing', false);

        $this->assertSame(2, CastMember::withoutGlobalScopes()->where('name', 'Nino Kasradze')->count());
    }

    /** დუბლი არ იქმნება — იგივე სახელი ან იგივე TMDB-ის პირი არსებულს აბრუნებს */
    public function test_an_existing_actor_is_returned_instead_of_a_duplicate(): void
    {
        $tmdb = CastMember::create(['name' => 'Liam Neeson', 'tmdb_person_id' => 3896]);
        $id = $this->createManual();

        $this->actingAs($this->nino)->postJson('/api/cast', ['name' => 'nino   KASRADZE'])
            ->assertOk()
            ->assertJsonPath('existing', true)
            ->assertJsonPath('actor.id', $id);

        $this->actingAs($this->nino)->postJson('/api/cast', ['tmdb_person_id' => 3896])
            ->assertOk()
            ->assertJsonPath('existing', true)
            ->assertJsonPath('actor.id', $tmdb->id);

        $this->assertSame(2, CastMember::withoutGlobalScopes()->count());
    }

    /** TMDB-ის პირი საერთოა: `created_by` არ აქვს და ყველას უჩანს */
    public function test_a_tmdb_person_becomes_a_shared_actor(): void
    {
        $this->giveCredential($this->nino, 'tmdb');
        Http::fake(['api.themoviedb.org/3/person/*' => Http::response(['id' => 287, 'name' => 'Brad Pitt', 'gender' => 2, 'profile_path' => null])]);

        $id = $this->actingAs($this->nino)->postJson('/api/cast', ['tmdb_person_id' => 287])
            ->assertCreated()
            ->assertJsonPath('actor.name', 'Brad Pitt')
            ->assertJsonPath('actor.is_private', false)
            ->json('actor.id');

        $this->assertNull(CastMember::find($id)->created_by);
        $this->actingAs($this->gio)->getJson("/api/cast/{$id}")->assertOk();
    }

    public function test_only_the_creator_edits_and_a_new_photo_replaces_the_old_one(): void
    {
        $id = $this->createManual(['photo' => UploadedFile::fake()->image('a.jpg', 200, 300)]);
        $old = CastMember::findOrFail($id)->photo_path;

        $this->actingAs($this->nino)
            ->post("/api/cast/{$id}", [
                '_method' => 'PUT',
                'name' => 'Nino K.',
                'name_ka' => '',
                'biography' => '',
                'photo' => UploadedFile::fake()->image('b.jpg', 100, 150),
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('actor.name', 'Nino K.')
            ->assertJsonPath('actor.name_ka', null)
            ->assertJsonPath('actor.biography', null);

        $member = CastMember::findOrFail($id);
        Storage::disk('public')->assertMissing($old);
        Storage::disk('public')->assertExists($member->photo_path);
        // ⚠️ კვოტაში მხოლოდ ახალი ფოტოა — ძველი ჩამოიჭრა
        $this->assertSame(Storage::disk('public')->size($member->photo_path), (int) $this->nino->refresh()->storage_used_bytes);

        // TMDB-ის მსახიობი ფაქტია — ხელით არ იცვლება
        $tmdb = CastMember::create(['name' => 'Liam Neeson', 'tmdb_person_id' => 3896]);
        $this->actingAs($this->nino)->putJson("/api/cast/{$tmdb->id}", ['name' => 'Other'])
            ->assertForbidden()
            ->assertJsonPath('message', 'cast_member_readonly');
    }

    /** TMDB-ის პირთან დაკავშირება კერძოს საერთოდ აქცევს */
    public function test_linking_to_tmdb_makes_the_actor_shared(): void
    {
        $id = $this->createManual();
        $movie = Movie::create(['user_id' => $this->nino->id, 'year' => 2020]);

        $this->actingAs($this->nino)
            ->postJson("/api/media/cast/movie/{$movie->id}", ['tmdb_person_id' => 555, 'name' => 'Nino Kasradze'])
            ->assertCreated()
            ->assertJsonPath('data.id', $id);

        $this->assertFalse(CastMember::findOrFail($id)->isPrivate());
        $this->actingAs($this->gio)->getJson("/api/cast/{$id}")->assertOk();
    }

    /** ხელით დამატება ჩანაწერზე ახალ რიგს კერძოდ ქმნის */
    public function test_adding_by_hand_on_a_record_creates_a_private_actor(): void
    {
        $movie = Movie::create(['user_id' => $this->nino->id, 'year' => 2020]);

        $id = $this->actingAs($this->nino)
            ->postJson("/api/media/cast/movie/{$movie->id}", ['name' => 'Levan Gelbakhiani'])
            ->assertCreated()
            ->json('data.id');

        $this->assertSame($this->nino->id, CastMember::findOrFail($id)->created_by);
        $this->actingAs($this->gio)->getJson("/api/cast/{$id}")->assertNotFound();
    }

    /** ანგარიშის წაშლა კერძო მსახიობს ფოტოიანად შლის; TMDB-ის მსახიობი რჩება */
    public function test_erasing_the_account_removes_its_private_actors(): void
    {
        $id = $this->createManual(['photo' => UploadedFile::fake()->image('a.jpg', 200, 300)]);
        $path = CastMember::findOrFail($id)->photo_path;
        $tmdb = CastMember::create(['name' => 'Liam Neeson', 'tmdb_person_id' => 3896, 'created_by' => $this->nino->id]);

        app(AccountEraser::class)->erase($this->nino);

        $this->assertNull(CastMember::withoutGlobalScopes()->find($id));
        Storage::disk('public')->assertMissing($path);
        $this->assertNotNull($tmdb->fresh());
        $this->assertNull($tmdb->fresh()->created_by);
    }
}
