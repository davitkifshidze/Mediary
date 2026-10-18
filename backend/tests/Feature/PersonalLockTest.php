<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Person;
use App\Models\PersonalAlbum;
use App\Models\PersonalMedia;
use App\Models\RecordLock;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **პირადი გალერეის ჩაკეტვა და საჯარო ალბომი.**
 *
 * ⚠️ ჩაკეტილი ჩანაწერი **მოდელით** იქმნება და არა API-ით: API-ით დადებული
 * ლოკი იმავე სესიაში ღია რჩება (განზრახ — შენ ახლა დაადე), ე.ი. „დამალულს"
 * ტესტი ვეღარ შეამოწმებდა (`GalleryAlbumTest::spa()`-ის გაკვეთილი). სესიის
 * გარეშე მოთხოვნა (Referer-ის გარეშე) ყოველთვის „დაუხსნელია".
 */
class PersonalLockTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        Storage::fake('private');
        config(['mediary.public_profiles' => true]);

        $this->user = User::create([
            'name' => 'nino',
            'username' => 'nino',
            'email' => 'nino@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync([
            Module::where('key', 'personal')->value('id') => ['enabled_at' => now(), 'is_public' => true],
        ]);
        $this->user->refresh();

        $this->actingAs($this->user);
    }

    /** stateful მოთხოვნა — ზუსტად ისეთი, როგორსაც SPA აგზავნის (სესიით) */
    private function spa()
    {
        return $this->actingAs($this->user)->withHeaders(['Referer' => 'http://localhost:5173']);
    }

    private function person(string $name = 'დედა', array $extra = []): Person
    {
        return Person::create(['user_id' => $this->user->id, 'name' => $name, 'sort_order' => 1, ...$extra]);
    }

    private function album(string $name = 'ზღვა', ?int $personId = null, array $extra = []): PersonalAlbum
    {
        return PersonalAlbum::create(['user_id' => $this->user->id, 'name' => $name, 'person_id' => $personId, 'sort_order' => 1, ...$extra]);
    }

    private function media(array $attributes = []): PersonalMedia
    {
        $id = (int) PersonalMedia::withoutGlobalScopes()->max('id') + 1;
        $path = "personal/photos/m{$id}.jpg";
        $thumb = "personal/thumbs/m{$id}.webp";

        Storage::disk('private')->put($path, str_repeat('x', 100));
        Storage::disk('private')->put($thumb, str_repeat('t', 10));
        app(StorageMeter::class)->addFor($this->user->id, 110);

        return PersonalMedia::create([
            'user_id' => $this->user->id,
            'kind' => 'photo',
            'path' => $path,
            'original_name' => "m{$id}.jpg",
            'mime' => 'image/jpeg',
            'size' => 100,
            'thumb_path' => $thumb,
            'thumb_size' => 10,
            ...$attributes,
        ]);
    }

    /** ჩაკეტვა მოდელით — სესიაში არავინ გახსნა */
    private function lock(Person|PersonalAlbum $record, string $password = 'secret1'): RecordLock
    {
        return RecordLock::create([
            'user_id' => $this->user->id,
            'lockable_type' => $record->getMorphClass(),
            'lockable_id' => $record->getKey(),
            'password_hash' => Hash::make($password),
            'hint' => 'ზღვის სახელი',
        ]);
    }

    /** @return list<int> */
    private function listedMedia(string $query = ''): array
    {
        return collect($this->getJson('/api/personal/media'.$query)->assertOk()->json('data'))->pluck('id')->all();
    }

    /* ---------- დამალვა ---------- */

    public function test_a_locked_person_is_a_padlock_card_and_everything_inside_disappears(): void
    {
        $person = $this->person('ანანო', ['note' => 'საიდუმლო ჩანიშვნა', 'birthday' => '1990-05-01']);
        $album = $this->album('ქორწილი', $person->id);
        $own = $this->media(['person_id' => $person->id, 'caption' => 'ფეიერვერკი']);
        $inAlbum = $this->media(['person_id' => $person->id, 'album_id' => $album->id]);
        $free = $this->media();
        $person->update(['cover_media_id' => $own->id]);

        $this->lock($person);

        // ბარათი რჩება — სახელი და რიცხვები, ჩანიშვნა/დაბადება/ყდა კი არა
        $card = collect($this->getJson('/api/personal/people')->assertOk()->json('data'))->firstWhere('id', $person->id);
        $this->assertTrue($card['locked']);
        $this->assertFalse($card['unlocked']);
        $this->assertSame('ზღვის სახელი', $card['lock_hint']);
        $this->assertSame(2, $card['photos'], 'ბოქლომიანი ბარათის რიცხვი ლოკის მიღმა ითვლება');
        $this->assertSame(1, $card['albums']);
        $this->assertNull($card['note']);
        $this->assertNull($card['birthday']);
        $this->assertNull($card['cover']);
        $this->assertStringNotContainsString('საიდუმლო', $this->getJson("/api/personal/people/{$person->id}")->getContent());

        // ფოტოები, ალბომი, ჯგუფები, ჯამები — დამალულია
        $this->assertSame([$free->id], $this->listedMedia());
        $this->assertSame([], $this->listedMedia("?person_id={$person->id}"));
        $this->assertSame([], collect($this->getJson('/api/personal/albums')->json('data'))->pluck('id')->all());
        $this->getJson("/api/personal/albums/{$album->id}")->assertNotFound();
        $this->assertSame(['person:none'], collect($this->getJson('/api/personal/media/groups?by=person')->json('data'))->pluck('key')->all());
        $this->getJson('/api/personal/summary')->assertJsonPath('photos', 1)->assertJsonPath('albums', 0)->assertJsonPath('people', 1);

        // ფაილი და ესკიზი — 404, ზუსტად ისე, როგორც სხვისი
        foreach ([$own, $inAlbum] as $media) {
            $this->get("/api/personal/media/{$media->id}/file")->assertNotFound();
            $this->get("/api/personal/media/{$media->id}/thumb")->assertNotFound();
        }

        // დამატებითი ველები და ძებნა
        $this->getJson("/api/custom-fields/personal/{$person->id}")->assertNotFound();
        $keys = collect($this->getJson('/api/search?q='.urlencode('ანანო'))->assertOk()->json('groups'))->pluck('key');
        $this->assertNotContains('personal', $keys);
        $this->assertNotContains('personal_media', collect($this->getJson('/api/search?q='.urlencode('ფეიერ'))->json('groups'))->pluck('key'));
    }

    public function test_a_locked_album_stays_a_card_and_hides_only_its_media(): void
    {
        $person = $this->person();
        $album = $this->album('ზღვა', $person->id, ['description' => 'აღწერა']);
        $inside = $this->media(['person_id' => $person->id, 'album_id' => $album->id]);
        $loose = $this->media(['person_id' => $person->id]);

        $this->lock($album);

        $card = collect($this->getJson('/api/personal/albums')->json('data'))->firstWhere('id', $album->id);
        $this->assertTrue($card['locked']);
        $this->assertSame(1, $card['photos']);
        $this->assertNull($card['description']);

        $this->assertSame([$loose->id], $this->listedMedia());
        $this->get("/api/personal/media/{$inside->id}/file")->assertNotFound();

        // ადამიანის ბარათი მის დამალულ ალბომს არ ითვლის — გახსნილი გვერდიც ასე აჩვენებს
        $this->getJson("/api/personal/people/{$person->id}")->assertJsonPath('data.photos', 1)->assertJsonPath('data.albums', 1);
    }

    public function test_an_outside_album_does_not_count_or_show_a_locked_persons_photo(): void
    {
        $locked = $this->person('ანა');
        $open = $this->person('ლუკა');
        $album = $this->album('დაბადების დღე');
        $this->media(['person_id' => $locked->id, 'album_id' => $album->id]);
        $visible = $this->media(['person_id' => $open->id, 'album_id' => $album->id]);

        $this->lock($locked);

        $this->getJson("/api/personal/albums/{$album->id}")->assertJsonPath('data.photos', 1);
        $this->assertSame([$visible->id], $this->listedMedia("?album_id={$album->id}"));
    }

    /* ---------- გახსნა და ისევ ჩაკეტვა ---------- */

    public function test_unlocking_opens_the_person_for_this_session_and_relocking_hides_it_again(): void
    {
        $person = $this->person();
        $media = $this->media(['person_id' => $person->id]);
        $this->lock($person);

        $this->spa()->postJson("/api/personal/people/{$person->id}/unlock", ['password' => 'wrong'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'record_password_wrong');
        $this->assertSame(1, RecordLock::withoutGlobalScopes()->value('failed_unlocks'));

        $this->postJson("/api/personal/people/{$person->id}/unlock", ['password' => 'secret1'])
            ->assertOk()
            ->assertJsonPath('data.unlocked', true)
            ->assertJsonPath('data.failed_unlocks', 0);

        $this->assertSame([$media->id], $this->listedMedia());
        $this->get("/api/personal/media/{$media->id}/thumb")->assertOk();

        $this->postJson("/api/personal/people/{$person->id}/lock")->assertOk()->assertJsonPath('data.unlocked', false);
        $this->assertSame([], $this->listedMedia());
    }

    /** ⚠️ სესიის გარეშე სწორი პაროლიც 409-ია — თორემ ჩუმად არაფერს გახსნიდა */
    public function test_unlocking_needs_a_session(): void
    {
        $person = $this->person();
        $this->lock($person);

        $this->postJson("/api/personal/people/{$person->id}/unlock", ['password' => 'secret1'])
            ->assertStatus(409)
            ->assertJsonPath('message', 'session_required');
    }

    /** 10 არასწორი ცდა → 15 წუთი ბლოკი; ბლოკის დროს სწორი პაროლიც 423-ია */
    public function test_too_many_wrong_passwords_block_the_record(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);

        $album = $this->album();
        $lock = $this->lock($album);

        for ($i = 0; $i < RecordLock::MAX_UNLOCK_ATTEMPTS; $i++) {
            $this->spa()->postJson("/api/personal/albums/{$album->id}/unlock", ['password' => 'wrong'])->assertStatus(422);
        }

        $this->assertTrue($lock->refresh()->unlockBlocked());

        $this->postJson("/api/personal/albums/{$album->id}/unlock", ['password' => 'secret1'])
            ->assertStatus(423)
            ->assertJsonPath('message', 'record_temporarily_locked');

        $this->getJson("/api/personal/albums/{$album->id}")->assertJsonPath('data.unlock_blocked_until', $lock->unlock_blocked_until->toIso8601String());

        $lock->forceFill(['unlock_blocked_until' => now()->subMinute()])->saveQuietly();

        $this->postJson("/api/personal/albums/{$album->id}/unlock", ['password' => 'secret1'])
            ->assertOk()
            ->assertJsonPath('data.unlocked', true);
    }

    /* ---------- დადება, შეცვლა, მოხსნა ---------- */

    public function test_a_new_lock_stays_open_for_its_setter_and_changing_it_asks_for_the_account_password(): void
    {
        $person = $this->person();

        $this->spa()->putJson("/api/personal/people/{$person->id}/lock", ['password' => 'secret1', 'hint' => 'ზღვა'])
            ->assertOk()
            ->assertJsonPath('data.locked', true)
            ->assertJsonPath('data.unlocked', true)
            ->assertJsonPath('data.lock_hint', 'ზღვა');

        $this->assertStringNotContainsString('password_hash', $this->getJson("/api/personal/people/{$person->id}")->getContent());

        // ახალი სესია — დამალულია, ცვლილებას კი ანგარიშის პაროლი სჭირდება
        $this->flushSession();
        $this->getJson("/api/personal/people/{$person->id}")->assertJsonPath('data.unlocked', false);

        $this->putJson("/api/personal/people/{$person->id}/lock", ['password' => 'other12'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'account_password_wrong');

        $this->putJson("/api/personal/people/{$person->id}/lock", ['password' => 'other12', 'account_password' => 'password'])
            ->assertOk()
            ->assertJsonPath('data.unlocked', true);

        $this->flushSession();
        $this->postJson("/api/personal/people/{$person->id}/unlock", ['password' => 'secret1'])->assertStatus(422);
        $this->postJson("/api/personal/people/{$person->id}/unlock", ['password' => 'other12'])->assertOk();

        // სესიაში გახსნილზე მოხსნა ანგარიშის პაროლს აღარ ითხოვს
        $this->putJson("/api/personal/people/{$person->id}/lock", ['remove' => true])
            ->assertOk()
            ->assertJsonPath('data.locked', false);

        $this->assertSame(0, RecordLock::withoutGlobalScopes()->count());
    }

    public function test_a_new_lock_needs_a_password(): void
    {
        $person = $this->person();

        $this->putJson("/api/personal/people/{$person->id}/lock", ['hint' => 'მარტო მინიშნება'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'record_password_required');
    }

    /* ---------- დამალული ცვლილებას არ იღებს ---------- */

    public function test_a_hidden_record_refuses_changes_with_423(): void
    {
        $person = $this->person();
        $album = $this->album('გარე');
        $visible = $this->media();
        $this->lock($person);
        $this->lock($album);

        $this->patchJson("/api/personal/people/{$person->id}", ['name' => 'სხვა'])->assertStatus(423)->assertJsonPath('message', 'record_locked');
        $this->deleteJson("/api/personal/people/{$person->id}?keep=1")->assertStatus(423);
        $this->patchJson("/api/personal/albums/{$album->id}", ['name' => 'სხვა'])->assertStatus(423);
        $this->deleteJson("/api/personal/albums/{$album->id}")->assertStatus(423);

        // დამალულში ჩაგდება — ფოტო მომხმარებლის თვალწინ „გაქრებოდა"
        $this->postJson('/api/personal/media/move', ['ids' => [$visible->id], 'person_id' => $person->id])->assertStatus(423);
        $this->postJson('/api/personal/media/move', ['ids' => [$visible->id], 'album_id' => $album->id])->assertStatus(423);
        $this->postJson('/api/personal/albums', ['name' => 'ახალი', 'person_id' => $person->id])->assertStatus(423);

        $this->assertNull($visible->refresh()->person_id);
        $this->assertSame('დედა', $person->refresh()->name);
        $this->assertNull($person->trashed_at);
    }

    /** დამალული ადამიანის ალბომში ატვირთვაც 423-ია და არა „უადამიანო" ფოტო */
    public function test_uploading_into_a_hidden_persons_album_is_refused(): void
    {
        $person = $this->person();
        $album = $this->album('შიგნით', $person->id);
        $this->lock($person);

        $this->post('/api/personal/media', [
            'file' => UploadedFile::fake()->image('x.jpg', 40, 40),
            'album_id' => $album->id,
        ], ['Accept' => 'application/json'])->assertStatus(423);

        $this->assertSame(0, PersonalMedia::withoutGlobalScopes()->count());
    }

    /** საცავის ბიბლიოთეკა დამალულ ფაილს არ აჩვენებს — კვოტა კი მას ითვლის */
    public function test_the_storage_library_skips_a_hidden_file_but_the_quota_counts_it(): void
    {
        $album = $this->album();
        $hidden = $this->media(['album_id' => $album->id]);
        $shown = $this->media();
        $this->lock($album);

        $paths = collect($this->getJson('/api/storage/files')->assertOk()->json('files'))->pluck('path');
        $this->assertContains($shown->path, $paths);
        $this->assertNotContains($hidden->path, $paths);

        $this->assertSame(220, app(StorageMeter::class)->recalculate($this->user->refresh()));
    }

    /* ---------- ურნა და საბოლოო წაშლა ---------- */

    public function test_the_trash_keeps_a_hidden_photo_without_its_preview(): void
    {
        $album = $this->album();
        $media = $this->media(['album_id' => $album->id]);
        $media->moveToTrash();
        $this->lock($album);

        $item = collect($this->getJson('/api/trash')->json('data'))->firstWhere('kind', 'personal_media')['items'][0];
        $this->assertTrue($item['locked']);
        $this->assertNull($item['preview']);

        $this->get("/api/trash/personal_media/{$media->id}/file")->assertNotFound();
    }

    public function test_final_deletion_removes_the_lock_and_the_trash_keeps_it(): void
    {
        $person = $this->person();
        $album = $this->album('შიგნით', $person->id);

        $this->spa()->putJson("/api/personal/people/{$person->id}/lock", ['password' => 'secret1'])->assertOk();
        $this->putJson("/api/personal/albums/{$album->id}/lock", ['password' => 'secret2'])->assertOk();

        // ურნა ლოკს არ ეხება — აღდგენილი ისევ ჩაკეტილია
        $this->deleteJson("/api/personal/people/{$person->id}")->assertNoContent();
        $this->assertSame(2, RecordLock::withoutGlobalScopes()->count());

        $this->deleteJson("/api/trash/personal/{$person->id}")->assertNoContent();
        $this->assertSame(0, RecordLock::withoutGlobalScopes()->count(), 'საბოლოო წაშლა ადამიანის და მისი ალბომის ლოკსაც შლის');
    }

    /* ---------- საჯარო ---------- */

    private function publicProfile(): void
    {
        $this->user->forceFill(['profile_visibility' => 'public'])->save();
    }

    public function test_locking_an_album_turns_public_off_and_public_is_refused_while_locked(): void
    {
        $album = $this->album('ზღვა', null, ['visibility' => 'public']);

        $this->spa()->putJson("/api/personal/albums/{$album->id}/lock", ['password' => 'secret1'])
            ->assertOk()
            ->assertJsonPath('data.visibility', 'private');

        $this->patchJson("/api/personal/albums/{$album->id}", ['visibility' => 'public'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'record_locked_not_public');
    }

    public function test_a_public_album_is_served_through_the_public_routes(): void
    {
        $this->publicProfile();
        $open = $this->person('ლუკა');
        $locked = $this->person('ანა');
        $album = $this->album('ზღვა', null, ['visibility' => 'public', 'description' => 'ბათუმი']);
        $shown = $this->media(['person_id' => $open->id, 'album_id' => $album->id, 'caption' => 'ტალღა']);
        $hidden = $this->media(['person_id' => $locked->id, 'album_id' => $album->id]);
        $this->lock($locked);

        // სტუმარი — ავტორიზაციის გარეშე
        $this->app['auth']->forgetGuards();

        $card = $this->getJson('/api/public/profiles/nino/personal_album')->assertOk()->json('data.0');
        $this->assertSame(1, $card['photos'], 'ჩაკეტილი ადამიანის ფოტო საჯარო ალბომშიც არ ითვლება');
        $this->assertSame($shown->id, $card['cover_id']);

        $page = $this->getJson("/api/public/profiles/nino/personal-albums/{$album->id}")->assertOk();
        $this->assertSame([$shown->id], collect($page->json('data'))->pluck('id')->all());
        $this->assertSame("/public/profiles/nino/personal-media/{$shown->id}/thumb", $page->json('data.0.thumb'));
        $this->assertStringNotContainsString('personal/photos', $page->getContent(), 'დისკის გზა გარეთ არ გამოდის');

        $this->get("/api/public/profiles/nino/personal-media/{$shown->id}/thumb")->assertOk();
        $this->get("/api/public/profiles/nino/personal-media/{$shown->id}/file")->assertOk();
        $this->get("/api/public/profiles/nino/personal-media/{$hidden->id}/file")->assertNotFound();
    }

    /** ⚠️ ჩაკეტილი ალბომი საჯარო არასდროსაა — მფლობელის სესიაში გახსნილიც */
    public function test_a_locked_album_is_never_public_even_when_its_owner_opened_it(): void
    {
        $this->publicProfile();
        $album = $this->album('დღიური', null, ['visibility' => 'public']);
        $media = $this->media(['album_id' => $album->id]);
        $this->lock($album);

        $this->spa()->postJson("/api/personal/albums/{$album->id}/unlock", ['password' => 'secret1'])->assertOk();

        $this->getJson('/api/public/profiles/nino/personal_album')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/public/profiles/nino/personal-albums/{$album->id}")->assertNotFound();
        $this->get("/api/public/profiles/nino/personal-media/{$media->id}/thumb")->assertNotFound();
    }

    public function test_a_private_album_and_a_loose_photo_stay_private(): void
    {
        $this->publicProfile();
        $album = $this->album('პირადი');
        $inside = $this->media(['album_id' => $album->id]);
        $loose = $this->media();

        $this->getJson("/api/public/profiles/nino/personal-albums/{$album->id}")->assertNotFound();
        $this->get("/api/public/profiles/nino/personal-media/{$inside->id}/file")->assertNotFound();
        $this->get("/api/public/profiles/nino/personal-media/{$loose->id}/file")->assertNotFound();
    }
}
