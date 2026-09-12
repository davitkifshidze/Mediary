<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\NoteEntryFile;
use App\Models\User;
use App\Models\Video;
use App\Models\VideoFile;
use App\Services\Storage\StorageMeter;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Tasks 17.5 — საცავის მართვა user-ისთვის: „ყველაზე დიდი ფაილები",
 * ერთეულოვანი წაშლა და ობოლი ფაილების გასუფთავება.
 */
class StorageManagementTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private User $other;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        $this->user = $this->makeUser('vera', ['video']);
        $this->other = $this->makeUser('otto', ['video']);
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

    /**
     * ⚠️ `UploadedFile::fake()->create()` დისკზე **ცარიელ** ფაილს წერს და ზომას
     * მხოლოდ „აცხადებს", ე.ი. მრიცხველი (გაცხადებული) და დისკი (0) ერთმანეთს
     * ვერ დაემთხვევა. ამიტომ აქ მდგომარეობას პირდაპირ ვაწყობთ: რეალური შიგთავსი
     * დისკზე + `recalculate()`, რომ ორივე რიცხვი ერთი იყოს.
     */
    private function putFile(string $path, int $bytes): int
    {
        Storage::disk('public')->put($path, str_repeat('x', $bytes));

        return $bytes;
    }

    private function attach(Video $video, User $owner, string $path, int $bytes, string $kind = 'doc'): VideoFile
    {
        $this->putFile($path, $bytes);

        return $video->files()->create([
            'user_id' => $owner->id,
            'kind' => $kind,
            'path' => $path,
            'original_name' => basename($path),
            'mime' => $kind === 'doc' ? 'application/pdf' : 'image/jpeg',
            'size' => $bytes,
        ]);
    }

    /** სია ზომით დალაგებულია და მხოლოდ საკუთარ ფაილებს შეიცავს */
    public function test_files_list_is_sorted_and_scoped_to_the_owner(): void
    {
        Storage::fake('public');

        $video = Video::create([
            'user_id' => $this->user->id,
            'title' => 'Mine',
            'url' => 'https://youtu.be/dQw4w9WgXcQ',
            'thumbnail_path' => 'videos/thumbnails/thumb.jpg',
        ]);

        // 100 KB დოკუმენტი და 20 KB თამბნეილი — სიაში დიდი წინ უნდა იყოს
        $this->attach($video, $this->user, 'videos/files/docs/big.pdf', 102400);
        $this->putFile('videos/thumbnails/thumb.jpg', 20480);

        // სხვისი ფაილი — არ უნდა გამოჩნდეს
        $otherVideo = Video::create([
            'user_id' => $this->other->id,
            'title' => 'Theirs',
            'url' => 'https://youtu.be/aaaaaaaaaaa',
        ]);
        $this->attach($otherVideo, $this->other, 'videos/files/docs/theirs.pdf', 999);

        $used = app(StorageMeter::class)->recalculate($this->user);

        $body = $this->actingAs($this->user->refresh())->getJson('/api/storage/files')->assertOk()->json();

        $this->assertSame(2, $body['total']);
        $this->assertSame('doc', $body['files'][0]['kind']);
        $this->assertSame(102400, $body['files'][0]['size']);
        $this->assertSame('thumbnail', $body['files'][1]['kind']);
        $this->assertSame(20480, $body['files'][1]['size']);
        // სიის ჯამი და დაქეშილი მრიცხველი ერთი და იგივეა
        $this->assertSame($used, $body['bytes']);
        $this->assertSame($used, (int) $this->user->refresh()->storage_used_bytes);
    }

    /**
     * ⚠️ **ფაილის სია ამბობს, პრივატულ დისკზეა თუ არა** (§17.5).
     *
     * უამისოდ საცავის გვერდი `/storage/<path>`-ს ხატავდა ყველაზე — ჩანაწერის
     * დოკუმენტზე და ჩატის მედიაზე ეს **გატეხილი `<img>` და 404 ბმულია**,
     * რადგან ის ფაილები public დისკზე საერთოდ არ არიან. დროშა backend-ს
     * ეკუთვნის: SPA-ში `PRIVATE_ROOTS`-ის ასლი ერთ დღეს დაშორდებოდა.
     */
    public function test_file_list_marks_private_disk_files(): void
    {
        Storage::fake('public');
        Storage::fake('private');

        $video = Video::create([
            'user_id' => $this->user->id,
            'title' => 'Mine',
            'url' => 'https://youtu.be/dQw4w9WgXcQ',
        ]);
        $this->attach($video, $this->user, 'videos/files/docs/public.pdf', 1024);

        $note = NoteEntry::create(['user_id' => $this->user->id, 'title' => 'ჩანაწერი']);
        NoteEntryFile::create([
            'user_id' => $this->user->id,
            'note_entry_id' => $note->id,
            'kind' => 'doc',
            'path' => 'notes/files/docs/secret.pdf',
            'original_name' => 'secret.pdf',
            'size' => 2048,
        ]);

        $files = collect(
            $this->actingAs($this->user->refresh())->getJson('/api/storage/files')->assertOk()->json('files')
        )->keyBy('path');

        $this->assertFalse($files['videos/files/docs/public.pdf']['private']);
        $this->assertTrue($files['notes/files/docs/secret.pdf']['private']);
    }

    /**
     * ⚠️ **ჩანაწერის წაშლა ატვირთვასაც იტანს — მოდელის დონეზე.**
     *
     * ეს განზრახ **მოდელს** ამოწმებს და არა `DELETE` endpoint-ს: ჩანაწერს
     * კონტროლერის გარეშეც შლიან — `PurgeService` (Tasks 20) პირდაპირ
     * `$record->delete()`-ს აკეთებს, სწორედ იმიტომ, რომ ივენთები გაისროლოს.
     * აქამდე პოსტერის/თამბნეილის მოშორება **კონტროლერში** ეწერა, ე.ი.
     * მასობრივი წაშლა ფაილს დისკზე ტოვებდა და კვოტას არ ათავისუფლებდა
     * (წიგნი/თამაში/ბორდგეიმი თავიდანვე მოდელში აკეთებდნენ — სწორედ ამ
     * ასიმეტრიამ გამოაჩინა). გასწორდა 2026-09-06.
     */
    public function test_deleting_a_record_releases_its_upload_at_model_level(): void
    {
        Storage::fake('public');

        // ხელით ატვირთული პოსტერი — ითვლება კვოტაში (19.4/B)
        $movie = Movie::create([
            'user_id' => $this->user->id,
            'poster_path' => 'movies/posters/mine.jpg',
            'poster_source' => 'upload',
        ]);
        $this->putFile('movies/posters/mine.jpg', 30720);

        $video = Video::create([
            'user_id' => $this->user->id,
            'title' => 'Mine',
            'url' => 'https://youtu.be/dQw4w9WgXcQ',
            'thumbnail_path' => 'videos/thumbnails/mine.jpg',
        ]);
        $this->putFile('videos/thumbnails/mine.jpg', 10240);

        app(StorageMeter::class)->recalculate($this->user);
        $this->assertSame(40960, (int) $this->user->refresh()->storage_used_bytes);

        // ⚠️ endpoint-ის გარეშე — ზუსტად ისე, როგორც `PurgeService` შლის
        $movie->delete();
        $video->delete();

        $this->assertFalse(Storage::disk('public')->exists('movies/posters/mine.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('videos/thumbnails/mine.jpg'));
        $this->assertSame(0, (int) $this->user->refresh()->storage_used_bytes);
    }

    /**
     * ⚠️ **TMDB-ის პოსტერი წაშლისას არ ქრება** — ის საერთო ფაილია (იმავე
     * slug-ით სხვა ანგარიშსაც აქვს) და კვოტაშიც არ ითვლება (19.4/B).
     * წაშლა სხვისთვის სურათს გატეხავდა.
     */
    public function test_deleting_a_record_keeps_a_downloaded_poster(): void
    {
        Storage::fake('public');

        $movie = Movie::create([
            'user_id' => $this->user->id,
            'poster_path' => 'movies/posters/shared.jpg',
            'poster_source' => 'tmdb',
        ]);
        $this->putFile('movies/posters/shared.jpg', 30720);

        $movie->delete();

        $this->assertTrue(Storage::disk('public')->exists('movies/posters/shared.jpg'));
    }

    /** თამბნეილის წაშლა — სვეტი ცარიელდება, კვოტა თავისუფლდება */
    public function test_deleting_a_thumbnail_frees_the_quota(): void
    {
        Storage::fake('public');

        $video = Video::create([
            'user_id' => $this->user->id,
            'title' => 'Thumb',
            'url' => 'https://youtu.be/dQw4w9WgXcQ',
            'thumbnail_path' => 'videos/thumbnails/thumb.jpg',
        ]);
        $this->putFile('videos/thumbnails/thumb.jpg', 30720);

        $this->assertSame(30720, app(StorageMeter::class)->recalculate($this->user));

        $this->actingAs($this->user->refresh())
            ->deleteJson('/api/storage/files', ['path' => 'videos/thumbnails/thumb.jpg'])
            ->assertOk()
            ->assertJsonPath('used', 0);

        Storage::disk('public')->assertMissing('videos/thumbnails/thumb.jpg');
        $this->assertNull($video->refresh()->thumbnail_path);
    }

    /** მიმაგრებული ფაილი იმავე endpoint-იდან იშლება (ჩანაწერიც ქრება) */
    public function test_deleting_an_attachment_removes_the_row(): void
    {
        Storage::fake('public');

        $video = Video::create([
            'user_id' => $this->user->id,
            'title' => 'Docs',
            'url' => 'https://youtu.be/dQw4w9WgXcQ',
        ]);
        $attachment = $this->attach($video, $this->user, 'videos/files/docs/paper.pdf', 40960);

        $this->assertSame(40960, app(StorageMeter::class)->recalculate($this->user));

        $this->actingAs($this->user->refresh())
            ->deleteJson('/api/storage/files', ['path' => $attachment->path])
            ->assertOk()
            ->assertJsonPath('used', 0);

        $this->assertSame(0, VideoFile::withoutGlobalScope('owner')->count());
        Storage::disk('public')->assertMissing($attachment->path);
    }

    /**
     * **§6.2 — მონიშნულების და ყველას წაშლა.**
     *
     * ⚠️ სამი წესი ერთად: სკოუპი ცხადია (`paths` ან `all`), ცარიელი მონიშვნა
     * **422**-ია და არა „ყველაფერი", და ჯამი პასუხის ფესვშივე რჩება
     * (`used`) — ფრონტი და ძველი ტესტები სწორედ იქიდან კითხულობენ.
     */
    public function test_bulk_delete_needs_an_explicit_scope(): void
    {
        Storage::fake('public');

        $video = Video::create([
            'user_id' => $this->user->id,
            'title' => 'Bulk',
            'url' => 'https://youtu.be/dQw4w9WgXcQ',
            'thumbnail_path' => 'videos/thumbnails/one.jpg',
        ]);
        $this->putFile('videos/thumbnails/one.jpg', 1024);
        $second = $this->attach($video, $this->user, 'videos/files/docs/two.pdf', 2048);

        $this->assertSame(3072, app(StorageMeter::class)->recalculate($this->user));

        // ცარიელი მონიშვნა „ყველაფერს" არ ნიშნავს
        $this->actingAs($this->user->refresh())
            ->deleteJson('/api/storage/files', ['paths' => []])
            ->assertStatus(422);
        Storage::disk('public')->assertExists('videos/thumbnails/one.jpg');

        // მონიშნულები
        $this->actingAs($this->user->refresh())
            ->deleteJson('/api/storage/files', ['paths' => [$second->path]])
            ->assertOk()
            ->assertJsonPath('deleted', 1)
            ->assertJsonPath('used', 1024);

        // ყველა დანარჩენი
        $this->actingAs($this->user->refresh())
            ->deleteJson('/api/storage/files', ['all' => true])
            ->assertOk()
            ->assertJsonPath('used', 0);

        Storage::disk('public')->assertMissing('videos/thumbnails/one.jpg');
        $this->assertNull($video->refresh()->thumbnail_path);
    }

    /**
     * **§6.2 — zip.** არქივში მხოლოდ **ჩემი** ფაილები ხვდება; სხვისი გზა
     * ჩუმად გამოტოვდება (და არა 500), ე.ი. მონიშვნის შერევა საშიში არაა.
     */
    public function test_bulk_download_only_packs_my_own_files(): void
    {
        Storage::fake('public');

        $mine = Video::create([
            'user_id' => $this->user->id,
            'title' => 'Mine',
            'url' => 'https://youtu.be/dQw4w9WgXcQ',
        ]);
        $ours = $this->attach($mine, $this->user, 'videos/files/docs/mine.pdf', 2048);

        $theirsVideo = Video::create([
            'user_id' => $this->other->id,
            'title' => 'Theirs',
            'url' => 'https://youtu.be/aaaaaaaaaaa',
        ]);
        $theirs = $this->attach($theirsVideo, $this->other, 'videos/files/docs/theirs.pdf', 2048);

        $response = $this->actingAs($this->user->refresh())
            ->post('/api/storage/files/download', ['paths' => [$ours->path, $theirs->path]]);

        $response->assertOk();
        $response->assertHeader('content-type', 'application/zip');

        $zipPath = tempnam(sys_get_temp_dir(), 'mediary-test-');
        file_put_contents($zipPath, $response->streamedContent());

        $zip = new \ZipArchive;
        $this->assertTrue($zip->open($zipPath) === true);
        $names = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $names[] = $zip->getNameIndex($i);
        }
        $zip->close();
        @unlink($zipPath);

        $this->assertSame(['video/mine.pdf'], $names);
    }

    /** სხვისი (და TMDB-ის საერთო) ფაილი ამ endpoint-იდან ვერ იშლება */
    public function test_another_users_file_cannot_be_deleted(): void
    {
        Storage::fake('public');

        $video = Video::create([
            'user_id' => $this->other->id,
            'title' => 'Theirs',
            'url' => 'https://youtu.be/aaaaaaaaaaa',
        ]);
        $attachment = $this->attach($video, $this->other, 'videos/files/docs/theirs.pdf', 4096);

        // TMDB-ის პოსტერი კვოტაში არ ითვლება (19.4/B) → სიაშიც არაა, ე.ი. არც იშლება
        $tmdbPoster = 'movies/posters/shared.jpg';
        $this->putFile($tmdbPoster, 2048);

        foreach ([$attachment->path, $tmdbPoster] as $path) {
            $this->actingAs($this->user)
                ->deleteJson('/api/storage/files', ['path' => $path])
                ->assertStatus(404)
                ->assertJsonPath('message', 'file_not_found');
        }

        $this->assertSame(1, VideoFile::withoutGlobalScope('owner')->count());
        Storage::disk('public')->assertExists($attachment->path);
        Storage::disk('public')->assertExists($tmdbPoster);
    }

    /**
     * ობოლი ფაილი: ბაზაში არავინ იხსენიებს → სიაშია და იშლება.
     * მოხსენიებული და **ახლახან** ატვირთული — არ იშლება.
     */
    public function test_orphan_scan_is_admin_only_and_skips_referenced_and_fresh_files(): void
    {
        Storage::fake('public');
        /* ⚠️ **სკანერი ორივე დისკზე დადის** (§17.5): `notes/`, `chat/` და
           `videos/downloads` პრივატულია. მისი გაუყალბებლობა ნიშნავს, რომ
           ტესტი ნამდვილ `storage/app/private-uploads`-ს კითხულობს და სხვისი
           დატოვებული ფაილები მის შედეგს ცვლის. */
        Storage::fake('private');
        $disk = Storage::disk('public');

        // 1. ობოლი — ჩანაწერი არ არსებობს და ერთ საათზე ძველია
        $disk->put('gallery/images/orphan.jpg', 'x');
        touch($disk->path('gallery/images/orphan.jpg'), time() - 7200);

        // 2. ახალი ობოლი — მიმდინარე ატვირთვა შეიძლება იყოს, ხელს არ ვახლებთ
        $disk->put('gallery/images/fresh.jpg', 'x');

        // 3. მოხსენიებული — ვიდეოს თამბნეილი
        $disk->put('videos/thumbnails/used.jpg', 'x');
        touch($disk->path('videos/thumbnails/used.jpg'), time() - 7200);
        Video::create([
            'user_id' => $this->user->id,
            'title' => 'Used',
            'url' => 'https://youtu.be/dQw4w9WgXcQ',
            'thumbnail_path' => 'videos/thumbnails/used.jpg',
        ]);

        // ჩვეულებრივ user-ს წვდომა არ აქვს — გლობალური ოპერაციაა
        $this->actingAs($this->user)->getJson('/api/storage/orphans')->assertStatus(403);

        $this->user->assignRole('super_admin')->save();

        $body = $this->actingAs($this->user->refresh())
            ->getJson('/api/storage/orphans')
            ->assertOk()
            ->json();

        $this->assertSame(1, $body['total']);
        $this->assertSame('gallery/images/orphan.jpg', $body['files'][0]['path']);

        $this->actingAs($this->user)
            ->postJson('/api/storage/orphans/clean')
            ->assertOk()
            ->assertJsonPath('files', 1);

        $disk->assertMissing('gallery/images/orphan.jpg');
        $disk->assertExists('gallery/images/fresh.jpg');
        $disk->assertExists('videos/thumbnails/used.jpg');
    }

    /* ---------- 17.4 — ლიმიტის გაზრდის მოთხოვნა ---------- */

    /** მოთხოვნა იმავე `approval_requests`-ში ჯდება და ჩემს სიაში ჩანს */
    public function test_user_can_request_a_bigger_quota(): void
    {
        $quota = (int) $this->user->storage_quota_bytes;

        $this->actingAs($this->user)
            ->postJson('/api/requests/storage', [
                'requested_bytes' => $quota * 2,
                'message' => 'ვიდეოს ფაილები ვეღარ ეტევა',
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.type', 'storage_increase')
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.payload.requested_bytes', $quota * 2)
            ->assertJsonPath('data.payload.current_bytes', $quota);

        $this->actingAs($this->user)->getJson('/api/requests')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    /** მიმდინარეზე ნაკლები „გაზრდა" არაა; ღია მოთხოვნა კი მხოლოდ ერთია */
    public function test_quota_request_is_validated(): void
    {
        $quota = (int) $this->user->storage_quota_bytes;

        $this->actingAs($this->user)
            ->postJson('/api/requests/storage', ['requested_bytes' => $quota])
            ->assertStatus(422)
            ->assertJsonPath('message', 'storage_request_not_an_increase');

        $this->actingAs($this->user)
            ->postJson('/api/requests/storage', ['requested_bytes' => $quota * 2])
            ->assertStatus(201);

        $this->actingAs($this->user)
            ->postJson('/api/requests/storage', ['requested_bytes' => $quota * 3])
            ->assertStatus(422)
            ->assertJsonPath('message', 'storage_request_pending');
    }

    /**
     * დამტკიცება კვოტას ცვლის. ადმინს შეუძლია **ნაკლები** მისცეს —
     * რეალურად მინიჭებული `payload.granted_bytes`-ში იწერება.
     */
    public function test_admin_approval_applies_the_new_quota(): void
    {
        $quota = (int) $this->user->storage_quota_bytes;

        $id = $this->actingAs($this->user)
            ->postJson('/api/requests/storage', ['requested_bytes' => $quota * 4])
            ->assertStatus(201)
            ->json('data.id');

        // ჩვეულებრივი user ვერ ამტკიცებს — endpoint `super_admin`-ზეა
        $this->actingAs($this->other)
            ->postJson("/api/admin/requests/{$id}/approve")
            ->assertStatus(403);

        $this->other->assignRole('super_admin')->save();

        $this->actingAs($this->other->refresh())
            ->postJson("/api/admin/requests/{$id}/approve", ['granted_bytes' => $quota * 2])
            ->assertOk()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.payload.granted_bytes', $quota * 2);

        $this->assertSame($quota * 2, (int) $this->user->refresh()->storage_quota_bytes);
    }

    /* ---------- §17.2 — გადანაწილება მოდულებზე ---------- */

    /** ჯამი მთლიან კვოტას ვერ აღემატება — თორემ „გადანაწილება" კვოტას გვერდს აუვლიდა */
    public function test_allocations_cannot_exceed_the_total_quota(): void
    {
        $this->user->forceFill(['storage_quota_bytes' => 1000])->save();

        $this->actingAs($this->user->refresh())
            ->putJson('/api/storage/allocations', ['allocations' => ['video' => 900]])
            ->assertOk()
            ->assertJsonPath('allocations.video', 900)
            ->assertJsonPath('unallocated', 100);

        // ⚠️ ჯამი ითვლება **ყველა** ლიმიტზე და არა მარტო ახლა გაგზავნილზე
        $this->user->modules()->syncWithoutDetaching(
            Module::whereIn('key', ['movie'])->pluck('id')->all()
        );

        $this->actingAs($this->user->refresh())
            ->putJson('/api/storage/allocations', ['allocations' => ['movie' => 200]])
            ->assertStatus(422)
            ->assertJsonPath('message', 'allocation_exceeds_quota');

        // ჩავარდნილი მოთხოვნა **არაფერს** წერს
        $this->assertSame(['video' => 900], app(StorageMeter::class)->allocations($this->user->refresh()));
    }

    /**
     * მოდულის ლიმიტის ამოწურვა **ცალკე მდგომარეობაა**: საერთო ადგილი კიდევ
     * არის, უბრალოდ ამ მოდულს user-მა თვითონ შეუზღუდა.
     */
    public function test_module_limit_blocks_the_upload_with_its_own_code(): void
    {
        Storage::fake('public');

        $this->user->forceFill(['storage_quota_bytes' => 10_000_000])->save();
        $this->actingAs($this->user->refresh())
            ->putJson('/api/storage/allocations', ['allocations' => ['video' => 1024]])
            ->assertOk();

        $meter = app(StorageMeter::class);

        // ლიმიტში ჯდება
        $meter->guard($this->user->refresh(), 512, 'videos/files/docs');

        // ლიმიტს სცდება — თუმცა საერთო კვოტაში თავისუფლად ეტევა
        try {
            $meter->guard($this->user->refresh(), 4096, 'videos/files/docs');
            $this->fail('module limit was not enforced');
        } catch (HttpResponseException $e) {
            $payload = $e->getResponse()->getData(true);
            $this->assertSame(413, $e->getResponse()->getStatusCode());
            $this->assertSame('module_quota_exceeded', $payload['message']);
            $this->assertSame('video', $payload['module']);
        }

        // ⚠️ სხვა მოდული ლიმიტის გარეშეა — საერთო აუზიდან ისევ იხარჯება
        $meter->guard($this->user->refresh(), 4096, 'movies/posters');
    }

    /**
     * ⚠️ **ლიმიტის შემცირება უკვე დახარჯულზე ქვემოთ ფაილებს არ შლის**
     * (§17.2-ის ცხადი წესი) — მხოლოდ ახალი ატვირთვა ჩერდება.
     */
    public function test_shrinking_a_limit_below_usage_keeps_the_files(): void
    {
        Storage::fake('public');

        $video = Video::create(['user_id' => $this->user->id, 'title' => 'v', 'url' => 'https://x.dev/v']);
        $this->attach($video, $this->user, 'videos/files/docs/a.pdf', 4096);
        app(StorageMeter::class)->recalculate($this->user);

        $this->actingAs($this->user->refresh())
            ->putJson('/api/storage/allocations', ['allocations' => ['video' => 1024]])
            ->assertOk();

        // ფაილი ადგილზეა და ჯამშიც ითვლება
        Storage::disk('public')->assertExists('videos/files/docs/a.pdf');
        $this->assertSame(4096, app(StorageMeter::class)->usedByModule($this->user->refresh(), 'video'));

        // ახალი ატვირთვა კი აღარ გადის
        $this->expectException(HttpResponseException::class);
        app(StorageMeter::class)->guard($this->user->refresh(), 1, 'videos/files/docs');
    }

    /** `null` ლიმიტს **ხსნის** და მოდულს საერთო აუზში აბრუნებს (0 ≠ null) */
    public function test_null_clears_a_limit(): void
    {
        $this->user->forceFill(['storage_quota_bytes' => 10_000])->save();

        $this->actingAs($this->user->refresh())
            ->putJson('/api/storage/allocations', ['allocations' => ['video' => 0]])
            ->assertOk()
            ->assertJsonPath('allocations.video', 0);

        $this->actingAs($this->user->refresh())
            ->putJson('/api/storage/allocations', ['allocations' => ['video' => null]])
            ->assertOk()
            ->assertJsonMissingPath('allocations.video');

        $this->assertSame([], app(StorageMeter::class)->allocations($this->user->refresh()));
    }
}
