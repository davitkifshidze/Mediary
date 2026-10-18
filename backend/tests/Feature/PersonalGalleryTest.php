<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Person;
use App\Models\PersonalAlbum;
use App\Models\PersonalMedia;
use App\Models\Role;
use App\Models\User;
use App\Services\Personal\MediaInspector;
use App\Services\Purge\PurgeService;
use App\Services\Storage\StorageMeter;
use App\Services\Video\YtDlp;
use App\Support\StorageFolder;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **პირადი გალერეა** — ატვირთვა, ესკიზი, სერვირება, გადატანის
 * ინვარიანტი, ურნა და რეესტრები.
 *
 * ⚠️ ფოტოს ესკიზი **ნამდვილი GD-ით** კეთდება (ყალბი JPEG-ით) — ტესტი ზუსტად
 * იმას ამოწმებს, რაც პროდაქშენში მოხდება. ვიდეოს შემოწმება კი ffmpeg-ზე დგას,
 * ამიტომ იქ `MediaInspector` ყალბითაა ჩანაცვლებული (ტესტი ბინარზე არ უნდა
 * იყოს დამოკიდებული).
 */
class PersonalGalleryTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        Storage::fake('public');
        Storage::fake('private');

        $this->user = $this->makeUser('nino');
        $this->actingAs($this->user);
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::where('key', 'personal')->pluck('id')->all());

        // ⚠️ `create()` კვოტას მეხსიერებაში არ წერს — `refresh()` ბაზის ნაგულისხმევს მოიტანს
        return $user->refresh();
    }

    private function upload(array $extra = [], ?UploadedFile $file = null)
    {
        return $this->post('/api/personal/media', [
            'file' => $file ?? UploadedFile::fake()->image('beach.jpg', 1200, 800),
            ...$extra,
        ], ['Accept' => 'application/json']);
    }

    private function person(string $name = 'დედა'): Person
    {
        return Person::findOrFail($this->postJson('/api/personal/people', ['name' => $name])->assertCreated()->json('data.id'));
    }

    private function album(string $name = 'ზღვა', ?int $personId = null): PersonalAlbum
    {
        return PersonalAlbum::findOrFail($this->postJson('/api/personal/albums', ['name' => $name, 'person_id' => $personId])
            ->assertCreated()->json('data.id'));
    }

    /** ფაილით დისკზე — ურნა/წაშლა ფაილების გაქრობას ამოწმებს */
    private function media(array $attributes = []): PersonalMedia
    {
        $id = PersonalMedia::query()->max('id') + 1;
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

    /** ffmpeg-ის გარეშე — ვიდეოს შემოწმება წინასწარ ცნობილ პასუხს აბრუნებს */
    private function fakeInspector(): void
    {
        $this->app->instance(MediaInspector::class, new class(app(YtDlp::class)) extends MediaInspector
        {
            public function inspect(string $absolutePath, string $kind): array
            {
                return [
                    'width' => 1920,
                    'height' => 1080,
                    'duration' => 42,
                    'taken_at' => Carbon::parse('2024-05-01 10:00:00'),
                    'thumb' => 'frame-bytes',
                ];
            }
        });
    }

    private function body($response): string
    {
        ob_start();
        $response->baseResponse->sendContent();

        return (string) ob_get_clean();
    }

    /* ---------- ატვირთვა ---------- */

    public function test_a_photo_lands_on_the_private_disk_with_a_thumbnail_and_counts_in_the_quota(): void
    {
        $response = $this->upload(['caption' => 'ბათუმი'])
            ->assertCreated()
            ->assertJsonPath('data.kind', 'photo')
            ->assertJsonPath('data.private', true)
            ->assertJsonPath('data.width', 1200)
            ->assertJsonPath('data.height', 800)
            ->assertJsonPath('data.caption', 'ბათუმი');

        $media = PersonalMedia::findOrFail($response->json('data.id'));

        $this->assertSame("/personal/media/{$media->id}/file", $response->json('data.url'));
        $this->assertStringStartsWith("/personal/media/{$media->id}/thumb?v=", (string) $response->json('data.thumb'));
        $this->assertStringStartsWith(StorageFolder::PERSONAL_PHOTOS.'/', $media->path);
        $this->assertStringStartsWith(StorageFolder::PERSONAL_THUMBS.'/', (string) $media->thumb_path);

        // ⚠️ პირადი დისკი — საჯაროზე ფაილი არ არსებობს
        Storage::disk('private')->assertExists($media->path);
        Storage::disk('private')->assertExists($media->thumb_path);
        Storage::disk('public')->assertMissing($media->path);

        // ესკიზის გრძელი გვერდი — 640
        [$w, $h] = getimagesizefromstring(Storage::disk('private')->get($media->thumb_path));
        $this->assertSame(640, max($w, $h));

        // კვოტაში ორივე ფაილია
        $this->assertGreaterThan(0, $media->thumb_size);
        $this->assertSame($media->size + $media->thumb_size, (int) $this->user->fresh()->storage_used_bytes);
        $this->assertSame((int) $this->user->fresh()->storage_used_bytes, app(StorageMeter::class)->recalculate($this->user->fresh()));
    }

    public function test_the_browser_date_is_used_when_the_photo_has_no_exif(): void
    {
        $this->upload(['taken_at' => '2023-08-15T12:00:00+04:00'])->assertCreated();

        $this->assertSame('2023-08-15', PersonalMedia::firstOrFail()->taken_at->toDateString());

        // მომავალი და 1970 (ცარიელი `lastModified`) არ ითვლება
        $this->upload(['taken_at' => '1970-01-01T00:00:00Z'])->assertCreated();
        $this->assertNull(PersonalMedia::query()->orderByDesc('id')->firstOrFail()->taken_at);
    }

    public function test_a_video_is_recognised_by_its_content_and_inspected(): void
    {
        $this->fakeInspector();

        $mp4 = pack('N', 24).'ftypmp42'.pack('N', 0).'mp42isom'.str_repeat("\0", 2000);

        $response = $this->upload([], UploadedFile::fake()->createWithContent('clip.mp4', $mp4))
            ->assertCreated()
            ->assertJsonPath('data.kind', 'video')
            ->assertJsonPath('data.duration', 42)
            ->assertJsonPath('data.width', 1920);

        $media = PersonalMedia::findOrFail($response->json('data.id'));
        $this->assertStringStartsWith(StorageFolder::PERSONAL_VIDEOS.'/', $media->path);
        $this->assertSame('frame-bytes', Storage::disk('private')->get($media->thumb_path));
        $this->assertSame('2024-05-01', $media->taken_at->toDateString());
    }

    public function test_a_wrong_format_or_size_is_refused(): void
    {
        $this->upload([], UploadedFile::fake()->create('doc.pdf', 10, 'application/pdf'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('file');

        // 15 MB-ზე მეტი ფოტო
        $this->upload([], UploadedFile::fake()->image('big.jpg')->size(16 * 1024))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('file');

        $this->assertSame(0, PersonalMedia::query()->count());
    }

    public function test_the_quota_stops_an_upload(): void
    {
        $this->user->forceFill(['storage_quota_bytes' => 100])->save();
        $this->actingAs($this->user->refresh());

        $this->upload()->assertStatus(413)->assertJsonPath('message', 'storage_quota_exceeded');
        $this->assertSame(0, PersonalMedia::query()->count());
    }

    /* ---------- სერვირება ---------- */

    public function test_the_file_streams_with_range_and_the_thumbnail_is_cached(): void
    {
        $media = $this->media();
        Storage::disk('private')->put($media->path, '0123456789');

        $whole = $this->get("/api/personal/media/{$media->id}/file");
        $whole->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff')->assertHeader('Accept-Ranges', 'bytes');
        $this->assertSame('0123456789', $this->body($whole));

        $part = $this->get("/api/personal/media/{$media->id}/file", ['Range' => 'bytes=2-5']);
        $part->assertStatus(206)->assertHeader('Content-Range', 'bytes 2-5/10');
        $this->assertSame('2345', $this->body($part));

        $thumb = $this->get("/api/personal/media/{$media->id}/thumb");
        $thumb->assertOk();
        $this->assertStringContainsString('max-age=2592000', (string) $thumb->headers->get('Cache-Control'));

        // ჩამოტვირთვა — ორიგინალი სახელით, `attachment`
        $download = $this->get("/api/personal/media/{$media->id}/file?download=1");
        $download->assertOk();
        $this->assertStringStartsWith('attachment', (string) $download->headers->get('Content-Disposition'));
        $this->assertStringContainsString($media->original_name, (string) $download->headers->get('Content-Disposition'));
    }

    public function test_another_account_gets_404_and_moves_nothing(): void
    {
        $person = $this->person();
        $album = $this->album('ზღვა', $person->id);
        $media = $this->media(['person_id' => $person->id]);

        $stranger = $this->makeUser('gio');
        $this->actingAs($stranger);

        $this->getJson("/api/personal/people/{$person->id}")->assertNotFound();
        $this->getJson("/api/personal/albums/{$album->id}")->assertNotFound();
        $this->get("/api/personal/media/{$media->id}/file")->assertNotFound();
        $this->get("/api/personal/media/{$media->id}/thumb")->assertNotFound();
        $this->patchJson("/api/personal/media/{$media->id}", ['caption' => 'x'])->assertNotFound();
        $this->deleteJson("/api/personal/people/{$person->id}")->assertNotFound();
        $this->postJson('/api/personal/media/move', ['ids' => [$media->id], 'person_id' => null])
            ->assertOk()->assertJsonPath('moved', 0);

        // სხვისი ადამიანი ატვირთვისას — ვალიდაციის შეცდომა, არა მიბმა
        $this->upload(['person_id' => $person->id])->assertUnprocessable()->assertJsonValidationErrors('person_id');

        $this->getJson('/api/personal/people')->assertOk()->assertJsonCount(0, 'data');
        $this->assertSame($person->id, $media->fresh()->person_id);
    }

    /* ---------- გადატანა და ინვარიანტი ---------- */

    public function test_a_photo_uploaded_into_a_persons_album_belongs_to_that_person(): void
    {
        $person = $this->person();
        $album = $this->album('ზღვა', $person->id);

        $id = $this->upload(['album_id' => $album->id])->assertCreated()->json('data.id');

        $this->assertSame($person->id, PersonalMedia::findOrFail($id)->person_id);
    }

    public function test_moving_keeps_a_persons_album_and_its_photos_together(): void
    {
        $mom = $this->person('დედა');
        $dad = $this->person('მამა');
        $momsAlbum = $this->album('დედას ალბომი', $mom->id);
        $outside = $this->album('ზაფხული');

        $inMomsAlbum = $this->media(['person_id' => $mom->id, 'album_id' => $momsAlbum->id]);
        $loose = $this->media();

        // სხვა ადამიანზე — წინა ადამიანის ალბომი ეხსნება
        $this->postJson('/api/personal/media/move', ['ids' => [$inMomsAlbum->id], 'person_id' => $dad->id])
            ->assertOk()->assertJsonPath('moved', 1);
        $this->assertSame([$dad->id, null], [$inMomsAlbum->fresh()->person_id, $inMomsAlbum->fresh()->album_id]);

        // ადამიანის ალბომში — ადამიანიც მისი ხდება
        $this->postJson('/api/personal/media/move', ['ids' => [$loose->id], 'album_id' => $momsAlbum->id])->assertOk();
        $this->assertSame([$mom->id, $momsAlbum->id], [$loose->fresh()->person_id, $loose->fresh()->album_id]);

        // „გარე" ალბომი ადამიანს არ ცვლის
        $this->postJson('/api/personal/media/move', ['ids' => [$loose->id], 'album_id' => $outside->id])->assertOk();
        $this->assertSame([$mom->id, $outside->id], [$loose->fresh()->person_id, $loose->fresh()->album_id]);

        // ცვლილების გარეშე — 422
        $this->postJson('/api/personal/media/move', ['ids' => [$loose->id]])->assertStatus(422);
    }

    public function test_an_album_moved_to_another_person_takes_its_photos(): void
    {
        $mom = $this->person('დედა');
        $dad = $this->person('მამა');
        $album = $this->album('ალბომი', $mom->id);
        $photo = $this->media(['person_id' => $mom->id, 'album_id' => $album->id]);

        $this->patchJson("/api/personal/albums/{$album->id}", ['person_id' => $dad->id])
            ->assertOk()
            ->assertJsonPath('data.person.name', 'მამა');

        $this->assertSame($dad->id, $photo->fresh()->person_id);
    }

    /* ---------- სიები, მთვლელები, მთავარი ფოტო ---------- */

    public function test_people_and_albums_carry_counts_and_a_main_photo(): void
    {
        $person = $this->person();
        $album = $this->album('ზღვა', $person->id);
        $older = $this->media(['person_id' => $person->id, 'taken_at' => now()->subYear()]);
        $newer = $this->media(['person_id' => $person->id, 'album_id' => $album->id, 'taken_at' => now()]);
        $this->media(['person_id' => $person->id, 'kind' => 'video', 'thumb_path' => null, 'thumb_size' => 0]);

        $row = collect($this->getJson('/api/personal/people')->assertOk()->json('data'))->firstWhere('id', $person->id);
        $this->assertSame([2, 1, 1], [$row['photos'], $row['videos'], $row['albums']]);
        // ნაგულისხმევად — უახლესი
        $this->assertSame($newer->thumbUrl(), $row['cover']);

        // ცხადად არჩეული
        $this->patchJson("/api/personal/people/{$person->id}", ['cover_media_id' => $older->id])
            ->assertOk()
            ->assertJsonPath('data.cover', $older->thumbUrl());

        $this->getJson("/api/personal/albums?person_id={$person->id}")
            ->assertOk()
            ->assertJsonPath('data.0.photos', 1)
            ->assertJsonPath('data.0.person.name', 'დედა');
        $this->getJson('/api/personal/albums?outside=1')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_reorder_saves_the_whole_sequence(): void
    {
        $a = $this->person('ა');
        $b = $this->person('ბ');

        $this->postJson('/api/personal/people/reorder', ['ids' => [$b->id, $a->id]])
            ->assertOk()
            ->assertJsonPath('data.0.id', $b->id);
    }

    public function test_favorite_and_caption(): void
    {
        $media = $this->media();

        $this->patchJson("/api/personal/media/{$media->id}/favorite")->assertOk()->assertJsonPath('data.is_favorite', true);
        $this->patchJson("/api/personal/media/{$media->id}", ['caption' => 'ახალი წელი', 'taken_at' => '2020-01-01'])
            ->assertOk()
            ->assertJsonPath('data.caption', 'ახალი წელი');

        $this->assertSame('2020-01-01', $media->fresh()->taken_at->toDateString());
    }

    public function test_the_list_filters(): void
    {
        $person = $this->person();
        $this->media(['person_id' => $person->id, 'caption' => 'ზღვა', 'taken_at' => '2024-07-10 10:00:00']);
        $this->media(['is_favorite' => true, 'taken_at' => '2024-08-01 10:00:00']);
        $this->media(['kind' => 'video', 'thumb_path' => null]);

        $count = fn (string $query) => count($this->getJson("/api/personal/media?{$query}")->assertOk()->json('data'));

        $this->assertSame(3, $count(''));
        $this->assertSame(1, $count("person_id={$person->id}"));
        $this->assertSame(2, $count('ungrouped=1'));
        $this->assertSame(1, $count('kind=video'));
        $this->assertSame(1, $count('favorite=1'));
        $this->assertSame(1, $count('month=2024-07'));
        $this->assertSame(1, $count('month=undated'));
        $this->assertSame(1, $count('q='.urlencode('ზღვ')));

        // გადაღების თარიღით — უახლესი პირველი, თარიღის გარეშე ბოლოს
        $order = collect($this->getJson('/api/personal/media')->json('data'))->pluck('taken_at')->all();
        $this->assertNotNull($order[0]);
        $this->assertNull($order[2]);
    }

    public function test_groups_and_the_summary(): void
    {
        $person = $this->person();
        $album = $this->album('ზღვა');
        $this->media(['person_id' => $person->id, 'taken_at' => '2024-07-10 10:00:00']);
        $this->media(['album_id' => $album->id, 'taken_at' => '2024-07-20 10:00:00']);
        $this->media(['kind' => 'video', 'thumb_path' => null]);

        $byPerson = collect($this->getJson('/api/personal/media/groups?by=person')->assertOk()->json('data'))->keyBy('key');
        $this->assertSame(1, $byPerson["person:{$person->id}"]['photos']);
        $this->assertSame(2, $byPerson['person:none']['total']);

        $byAlbum = collect($this->getJson('/api/personal/media/groups?by=album')->json('data'))->keyBy('key');
        $this->assertSame(['album_id' => $album->id], $byAlbum["album:{$album->id}"]['filter']);

        $byMonth = collect($this->getJson('/api/personal/media/groups?by=month')->json('data'));
        $this->assertSame(['month:2024-07', 'month:undated'], $byMonth->pluck('key')->all());
        $this->assertSame(2, $byMonth[0]['photos']);
        $this->assertCount(2, $byMonth[0]['previews']);

        $this->getJson('/api/personal/summary')
            ->assertOk()
            ->assertJsonPath('people', 1)
            ->assertJsonPath('albums', 1)
            ->assertJsonPath('photos', 2)
            ->assertJsonPath('videos', 1)
            ->assertJsonPath('ungrouped', 1);
    }

    /* ---------- ურნა ---------- */

    public function test_a_deleted_person_takes_its_parts_to_the_trash_and_restore_brings_them_back(): void
    {
        $person = $this->person();
        $album = $this->album('ზღვა', $person->id);
        $media = $this->media(['person_id' => $person->id, 'album_id' => $album->id]);
        $loose = $this->media();

        $this->deleteJson("/api/personal/people/{$person->id}")->assertNoContent();

        // ნაწილები არსად ჩანს
        $this->assertSame([$loose->id], collect($this->getJson('/api/personal/media')->json('data'))->pluck('id')->all());
        $this->getJson('/api/personal/albums')->assertJsonCount(0, 'data');
        $this->get("/api/personal/media/{$media->id}/file")->assertNotFound();

        // ურნაში ადამიანია, მისი ფოტოების ზომით
        $group = collect($this->getJson('/api/trash')->assertOk()->json('data'))->firstWhere('kind', 'personal');
        $this->assertSame($person->id, $group['items'][0]['id']);
        $this->assertSame(110, $group['items'][0]['size']);

        $this->postJson("/api/trash/personal/{$person->id}/restore")->assertOk();

        $this->assertCount(2, $this->getJson('/api/personal/media')->json('data'));
        $this->getJson('/api/personal/albums')->assertJsonCount(1, 'data');
    }

    public function test_keep_releases_the_parts_and_restore_reattaches_them(): void
    {
        $person = $this->person();
        $album = $this->album('ზღვა', $person->id);
        $media = $this->media(['person_id' => $person->id, 'album_id' => $album->id]);

        $this->deleteJson("/api/personal/people/{$person->id}?keep=1")->assertNoContent();

        $this->assertNull($media->fresh()->person_id);
        $this->assertNull($album->fresh()->person_id);
        $this->assertCount(1, $this->getJson('/api/personal/media')->json('data'));

        $this->postJson("/api/trash/personal/{$person->id}/restore")->assertOk();

        $this->assertSame($person->id, $media->fresh()->person_id);
        $this->assertSame($person->id, $album->fresh()->person_id);
    }

    public function test_a_deleted_album_keeps_its_photos_unless_asked(): void
    {
        $album = $this->album();
        $media = $this->media(['album_id' => $album->id]);

        // ნაგულისხმევი — ფოტო რჩება, ალბომის გარეშე
        $this->deleteJson("/api/personal/albums/{$album->id}")->assertNoContent();
        $this->assertNull($media->fresh()->album_id);
        $this->assertCount(1, $this->getJson('/api/personal/media')->json('data'));

        $this->postJson("/api/trash/personal_album/{$album->id}/restore")->assertOk();
        $this->assertSame($album->id, $media->fresh()->album_id);

        // „ფოტოებიც" — ალბომთან ერთად იმალება და ბრუნდება
        $this->deleteJson("/api/personal/albums/{$album->id}?with_media=1")->assertNoContent();
        $this->assertCount(0, $this->getJson('/api/personal/media')->json('data'));

        $this->postJson("/api/trash/personal_album/{$album->id}/restore")->assertOk();
        $this->assertCount(1, $this->getJson('/api/personal/media')->json('data'));
    }

    public function test_the_final_delete_frees_both_files_and_the_quota(): void
    {
        $person = $this->person();
        $media = $this->media(['person_id' => $person->id]);
        $before = (int) $this->user->fresh()->storage_used_bytes;

        $this->deleteJson("/api/personal/people/{$person->id}")->assertNoContent();
        // ურნაში — ადგილი ჯერ ისევ დაკავებულია
        $this->assertSame($before, (int) $this->user->fresh()->storage_used_bytes);

        $this->deleteJson("/api/trash/personal/{$person->id}")->assertNoContent();

        Storage::disk('private')->assertMissing($media->path);
        Storage::disk('private')->assertMissing($media->thumb_path);
        $this->assertNull(PersonalMedia::withoutGlobalScopes()->find($media->id));
        $this->assertSame($before - 110, (int) $this->user->fresh()->storage_used_bytes);
    }

    public function test_a_trashed_photo_is_previewed_by_its_thumbnail(): void
    {
        $media = $this->media();

        $this->deleteJson("/api/personal/media/{$media->id}")->assertNoContent();

        $item = collect($this->getJson('/api/trash')->json('data'))->firstWhere('kind', 'personal_media')['items'][0];
        $this->assertSame(['src' => "/trash/personal_media/{$media->id}/file", 'private' => true], $item['preview']);

        $this->get("/api/trash/personal_media/{$media->id}/file")->assertOk();

        $this->postJson("/api/trash/personal_media/{$media->id}/restore")->assertOk();
        $this->assertCount(1, $this->getJson('/api/personal/media')->json('data'));
    }

    public function test_many_photos_go_to_the_trash_at_once(): void
    {
        $a = $this->media();
        $b = $this->media();

        $this->deleteJson('/api/personal/media', ['ids' => [$a->id, $b->id]])->assertOk()->assertJsonPath('trashed', 2);
        $this->assertCount(0, $this->getJson('/api/personal/media')->json('data'));
    }

    /* ---------- რეესტრები ---------- */

    public function test_purge_counts_a_persons_photos_with_their_thumbnails(): void
    {
        $person = $this->person();
        $this->media(['person_id' => $person->id]);
        $this->media(['person_id' => $person->id]);

        $plan = app(PurgeService::class)->plan($this->user, ['target' => 'personal', 'mode' => 'all'], PurgeService::TO_TRASH);

        $this->assertSame(1, $plan['records']);
        $this->assertSame(2, $plan['attachments']);
        $this->assertSame(220, $plan['bytes']);
    }

    public function test_search_dashboard_and_stats_know_the_module(): void
    {
        $person = $this->person('ანანო');
        $this->album('ქორწილი');
        $this->media(['caption' => 'ფეიერვერკი', 'taken_at' => now()]);

        $groups = collect($this->getJson('/api/search?q='.urlencode('ანანო'))->assertOk()->json('groups'))->keyBy('key');
        $this->assertSame($person->id, $groups['personal']['items'][0]['id']);
        $this->assertTrue(collect($this->getJson('/api/search?q='.urlencode('ქორწ'))->json('groups'))->pluck('key')->contains('personal_album'));
        $this->assertTrue(collect($this->getJson('/api/search?q='.urlencode('ფეიერ'))->json('groups'))->pluck('key')->contains('personal_media'));

        $card = collect($this->getJson('/api/dashboard')->assertOk()->json('data'))->firstWhere('key', 'personal');
        $this->assertSame(1, $card['count']);

        $tab = collect($this->getJson('/api/stats')->assertOk()->json('data'))->firstWhere('key', 'personal');
        $this->assertSame(1, $tab['total']);
    }

    public function test_deleting_the_account_removes_every_personal_file_and_thumbnail(): void
    {
        $person = $this->person();
        $inPerson = $this->media(['person_id' => $person->id]);
        $loose = $this->media(['album_id' => $this->album()->id]);
        $trashed = $this->media();
        $trashed->moveToTrash();

        $admin = User::factory()->create(['role_id' => Role::where('key', 'super_admin')->value('id')]);
        $this->actingAs($admin)->deleteJson("/api/admin/users/{$this->user->id}")->assertNoContent();

        foreach ([$inPerson, $loose, $trashed] as $media) {
            Storage::disk('private')->assertMissing($media->path);
            Storage::disk('private')->assertMissing($media->thumb_path);
        }

        $this->assertSame(0, PersonalMedia::withoutGlobalScopes()->count());
        $this->assertSame(0, PersonalAlbum::withoutGlobalScopes()->count());
        $this->assertSame(0, Person::withoutGlobalScopes()->count());
    }
}
