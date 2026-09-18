<?php

namespace Tests\Feature;

use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\Book;
use App\Models\Bookmark;
use App\Models\Concerns\StoredFile;
use App\Models\DatabaseBackup;
use App\Models\GalleryImage;
use App\Models\Game;
use App\Models\Message;
use App\Models\Module;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\NoteEntryFile;
use App\Models\Series;
use App\Models\Song;
use App\Models\User;
use App\Models\Video;
use App\Models\VideoFile;
use App\Services\Chat\ChatService;
use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
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
    /* ---------- კვოტის ატომურობა (აუდიტი 2026-09-14) ---------- */

    /**
     * **ჯავშანი ატომურია — ორი პარალელური ატვირთვა ლიმიტს ვერ გადალახავს.**
     *
     * ⚠️ ადრე `guard()` (კითხვა) და `add()` (ჩაწერა) ცალკე ნაბიჯები იყო:
     * ორივე მოთხოვნა ერთსა და იმავე ნაშთს დაინახავდა, ორივე გაივლიდა და
     * ორივე დაამატებდა — ე.ი. კვოტა გადალახვადი იყო. `reserve()` ერთი
     * პირობითი `UPDATE`-ია, ე.ი. მეორე ცდა 0 რიგს ცვლის და უარს იღებს.
     */
    public function test_two_reservations_cannot_both_fit_into_one_slot(): void
    {
        $meter = app(StorageMeter::class);
        $user = $this->user;

        $user->forceFill(['storage_quota_bytes' => 1000, 'storage_used_bytes' => 0])->save();

        $this->assertTrue($meter->reserve($user, 600));
        // მეორეს ადგილი აღარ აქვს — და ეს **ბაზაშივე** წყდება
        $this->assertFalse($meter->reserve($user->refresh(), 600));

        $this->assertSame(600, (int) $user->refresh()->storage_used_bytes);
    }

    /** ზუსტად ჩატეული ჯავშანი გადის — ზღვარი „<=" არის და არა „<" */
    public function test_a_reservation_that_exactly_fills_the_quota_is_allowed(): void
    {
        $meter = app(StorageMeter::class);
        $user = $this->user;

        $user->forceFill(['storage_quota_bytes' => 1000, 'storage_used_bytes' => 400])->save();

        $this->assertTrue($meter->reserve($user, 600));
        $this->assertFalse($meter->reserve($user->refresh(), 1));
    }

    /* ================= PERF-03 ================= */

    /**
     * ერთი ფაილი ყოველ ბლოკზე, რომელსაც `files()` კითხულობს — ქვედა ორი
     * ტესტის საერთო საფუძველი.
     *
     * ⚠️ ზომები **განზრახ განსხვავებულია**: ერთი და იგივე რიცხვი ბლოკების
     * აღრევას დაფარავდა.
     */
    private function inventory(): User
    {
        $u = $this->user;
        $u->forceFill(['avatar_path' => 'account/avatars/a.jpg'])->save();

        $movie = Movie::create(['user_id' => $u->id, 'poster_path' => 'movies/posters/m.jpg', 'poster_source' => 'upload']);
        Series::create(['user_id' => $u->id, 'poster_path' => 'series/posters/s.jpg', 'poster_source' => 'upload']);
        Anime::create(['user_id' => $u->id, 'poster_path' => 'animes/posters/a.jpg', 'poster_source' => 'upload']);

        $video = Video::create([
            'user_id' => $u->id, 'title' => 'v', 'url' => 'https://youtu.be/dQw4w9WgXcQ',
            'thumbnail_path' => 'videos/thumbnails/v.jpg',
            'download_path' => 'videos/downloads/v.mp4', 'download_size' => 4096,
        ]);
        $this->attach($video, $u, 'videos/files/docs/v.pdf', 512);

        $song = Song::create(['user_id' => $u->id, 'title' => 's', 'url' => 'https://youtu.be/dQw4w9WgXcQ', 'thumbnail_path' => 'songs/thumbnails/s.jpg']);
        $song->files()->create(['user_id' => $u->id, 'kind' => 'doc', 'path' => 'songs/files/docs/s.pdf', 'size' => 64]);

        Bookmark::create([
            'user_id' => $u->id, 'title' => 'b', 'url' => 'https://example.com',
            'thumbnail_path' => 'bookmarks/thumbnails/b.jpg',
        ]);

        $book = Book::create(['user_id' => $u->id, 'title_en' => 'b', 'cover_path' => 'books/covers/b.jpg', 'cover_source' => 'upload']);
        $book->files()->create(['user_id' => $u->id, 'kind' => 'book', 'path' => 'books/files/ebooks/b.epub', 'size' => 128]);

        $board = BoardGame::create(['user_id' => $u->id, 'title' => 'bg', 'image_path' => 'boardgames/images/bg.jpg', 'image_source' => 'upload']);
        $board->files()->create(['user_id' => $u->id, 'kind' => 'rules', 'path' => 'boardgames/files/rules/bg.pdf', 'size' => 256]);

        $game = Game::create(['user_id' => $u->id, 'title_en' => 'g', 'cover_path' => 'games/covers/g.jpg', 'cover_source' => 'upload']);
        $game->files()->create(['user_id' => $u->id, 'kind' => 'doc', 'path' => 'games/files/docs/g.pdf', 'size' => 32]);

        $note = NoteEntry::create(['user_id' => $u->id, 'title' => 'n']);
        NoteEntryFile::create([
            'user_id' => $u->id, 'note_entry_id' => $note->id, 'kind' => 'doc',
            'path' => 'notes/files/docs/n.pdf', 'size' => 16,
        ]);

        GalleryImage::create([
            'user_id' => $u->id, 'imageable_type' => 'movie', 'imageable_id' => $movie->id,
            'path' => 'gallery/images/g.jpg', 'size' => 8, 'source' => 'tmdb', 'category' => 'backdrop',
        ]);

        $conversation = DB::table('conversations')->insertGetId(['created_at' => now(), 'updated_at' => now()]);
        Message::create([
            'conversation_id' => $conversation, 'user_id' => $u->id, 'type' => 'doc',
            'attachment_path' => 'chat/files/docs/c.pdf', 'attachment_size' => 2048,
        ]);

        DatabaseBackup::create([
            'user_id' => $u->id, 'path' => 'backups/db.sql.gz', 'name' => 'db.sql.gz',
            'size' => 1024, 'status' => 'ready',
        ]);

        DB::table('video_field_values')->insert([
            'user_id' => $u->id, 'record_id' => $video->id, 'field_key' => 'f', 'sort_order' => 0,
            'value_path' => 'videos/fields/f.pdf', 'value_size' => 4,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $u->refresh();
    }

    /**
     * **მოდულის მინიშნება პასუხს არ ცვლის** (Tasks PERF-03).
     *
     * ⚠️ ეს ტესტი ის ფასია, რომელსაც `files($user, $module)` იხდის. `usedByModule()`
     * განზრახ `files()`-ზე გადის, რომ „რა ითვლება" ერთადერთი განმარტება დარჩეს;
     * მინიშნება ამ წესს მხოლოდ მაშინ არ არღვევს, თუ **ზუსტად** იმავე პასუხს
     * იძლევა. არასწორად გამოტოვებული ბლოკი სხვაგვარად ჩუმი იქნებოდა — ლიმიტი
     * უბრალოდ ცოტა უფრო გვიან ჩაირთვებოდა.
     */
    public function test_the_module_hint_never_changes_the_answer(): void
    {
        $user = $this->inventory();
        $meter = app(StorageMeter::class);

        $full = $meter->files($user);
        $modules = $full->pluck('module')->unique()->values();

        // ⚠️ ცარიელ ინვენტარზე ტესტი უაზროდ გაივლიდა
        $this->assertGreaterThanOrEqual(12, $modules->count());

        foreach ($modules as $module) {
            $this->assertSame(
                $full->where('module', $module)->pluck('path')->sort()->values()->all(),
                $meter->files($user, $module)->where('module', $module)->pluck('path')->sort()->values()->all(),
                "მოდული {$module}: მინიშნებით და მის გარეშე სხვადასხვა პასუხი",
            );
        }

        // მოდული, რომელსაც ფაილი არ აქვს, ორივე გზით ნულია
        $this->assertSame(0, (int) $meter->files($user, 'playlist')->where('module', 'playlist')->sum('size'));
    }

    /**
     * **ატვირთვა სხვა მოდულების ცხრილებს აღარ კითხულობს** (Tasks PERF-03).
     *
     * ⚠️ `guardModule()` → `usedByModule()` → `files()` ყოველ **ფაილზე** გარბოდა,
     * `files()` კი ~20 ცხრილის სრული ინვენტარია. გაზომილი 10-ფაილიან ატვირთვაზე
     * (`POST /notes/{id}/files`): 346 query → 76.
     *
     * ⚠️ **მეხსიერებაში შენახვა აქ არასწორი იქნებოდა და არა უბრალოდ ზედმეტი**:
     * ატვირთვა პაკეტურია და რიგები ციკლის შიგნით ჩნდება, ე.ი. ერთხელ აღებული
     * სურათი მე-2…N-ე ფაილს ძველ ჯამზე შეამოწმებდა — მოდულის ლიმიტი ჩუმად
     * გადაცდებოდა.
     */
    public function test_an_upload_does_not_scan_other_modules(): void
    {
        Storage::fake('public');

        $user = $this->inventory();
        $user->forceFill(['storage_quota_bytes' => 10_000_000])->save();
        $this->actingAs($user->refresh())
            ->putJson('/api/storage/allocations', ['allocations' => ['video' => 1_000_000]])
            ->assertOk();

        DB::flushQueryLog();
        DB::enableQueryLog();
        app(StorageMeter::class)->guardModule($user->refresh(), 10, 'videos/files/docs');
        $log = collect(DB::getQueryLog())->pluck('query');
        DB::disableQueryLog();

        foreach (['gallery_images', 'messages', 'database_backups', 'book_files', 'game_files', 'note_entry_files'] as $foreign) {
            $this->assertFalse(
                $log->contains(fn (string $q) => str_contains($q, $foreign)),
                "ვიდეოს ლიმიტის შემოწმებამ {$foreign} წაიკითხა",
            );
        }

        // ⚠️ საკუთარი ბლოკები კი უნდა წაიკითხოს, თორემ ჯამი მოტყუებული იქნებოდა
        $this->assertTrue($log->contains(fn (string $q) => str_contains($q, 'video_files')));
    }

    /* ================= BUG-13 ================= */

    /**
     * **მორგებული ველის ფაილის წაშლა ან მთლიანად ხდება, ან საერთოდ არა**
     * (Tasks BUG-13).
     *
     * ⚠️ ძველად სამი ცალკე გვერდითი ეფექტი იყო და **ფაილი პირველი იშლებოდა**:
     * `deleteUpload()` → `addFor(-size)` → `DELETE`. შუაში ჩავარდნაზე ფაილი
     * გამქრალია, კვოტა ჩამოკლებული, რიგი კი კვლავ `value_path`/`value_size`-ს
     * აცხადებს — ე.ი. მომდევნო `recalculate()` არარსებული ფაილის ბაიტებს
     * **ხელახლა ამატებს** და მრიცხველი სამუდამოდ იბერება.
     *
     * ⚠️ **ჩავარდნა `addFor()`-ით ინჟექტირდება და ეს არ არის ხელოვნური**: ის
     * ტრანზაქციის შიგნით და `DELETE`-ის **შემდეგ** დგას, ე.ი. ზუსტად იმ
     * მდგომარეობას ქმნის, რომელსაც ტრანზაქცია უნდა დააბრუნოს. სამივე
     * მტკიცება ერთად ამბობს, რომ არაფერი დარჩა ნახევრად გაკეთებული.
     *
     * ⚠️ `fail()` გამონაკლისის გარეშე **სავალდებულოა**: `deleteOwnFile()`
     * უცნობ ბილიკზე უბრალოდ `false`-ს აბრუნებს, ე.ი. ბილიკის შეცდომაზე
     * სამივე მტკიცება უაზროდ გაივლიდა.
     */
    public function test_a_failed_custom_field_delete_leaves_the_file_and_the_counter(): void
    {
        Storage::fake('public');

        $video = Video::create([
            'user_id' => $this->user->id, 'title' => 'v', 'url' => 'https://youtu.be/dQw4w9WgXcQ',
        ]);
        $this->putFile('videos/fields/ticket.pdf', 64);
        DB::table('video_field_values')->insert([
            'user_id' => $this->user->id, 'record_id' => $video->id, 'field_key' => 'ticket',
            'sort_order' => 0, 'value_path' => 'videos/fields/ticket.pdf', 'value_size' => 64,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        app(StorageMeter::class)->recalculate($this->user);
        $before = (int) $this->user->refresh()->storage_used_bytes;
        $this->assertSame(64, $before);

        $meter = $this->getMockBuilder(StorageMeter::class)->onlyMethods(['addFor'])->getMock();
        $meter->method('addFor')->willThrowException(new \RuntimeException('boom'));

        try {
            $meter->deleteOwnFile($this->user->refresh(), 'videos/fields/ticket.pdf');
            $this->fail('ჩავარდნა ვერ მოხდა — ე.ი. წაშლის ბრანჩი საერთოდ არ გაშვებულა');
        } catch (\RuntimeException) {
            // მოსალოდნელია
        }

        $this->assertTrue(
            Storage::disk('public')->exists('videos/fields/ticket.pdf'),
            'ფაილი commit-ამდე წაიშალა',
        );
        $this->assertNotNull(
            DB::table('video_field_values')->where('field_key', 'ticket')->first(),
            'რიგის წაშლა არ დაბრუნებულა',
        );
        $this->assertSame($before, (int) $this->user->refresh()->storage_used_bytes);

        // და წარმატებულ გზაზე სამივე მართლა ქრება — თორემ ზემოთა სამი უაზროა
        $this->assertTrue(app(StorageMeter::class)->deleteOwnFile($this->user->refresh(), 'videos/fields/ticket.pdf'));
        $this->assertFalse(Storage::disk('public')->exists('videos/fields/ticket.pdf'));
        $this->assertNull(DB::table('video_field_values')->where('field_key', 'ticket')->first());
        $this->assertSame(0, (int) $this->user->refresh()->storage_used_bytes);
    }

    /* ================= DEBT-04: `mediary:storage-recalc` ================= */

    /**
     * ინვენტარის ყოველ ბილიკს რეალურ ბაიტებს ვუწერთ დისკზე.
     *
     * ⚠️ უსვეტო ბლოკები (ავატარი, პოსტერები, თამბნეილები, ყდები) ზომას
     * **მხოლოდ დისკიდან** კითხულობენ (`fileSize()`), ე.ი. ფაილის გარეშე
     * ისინი ნულია და გადათვლის ტესტი მათ ჩუმად ვერ შეამოწმებდა.
     */
    private function fillDisk(User $user): void
    {
        foreach (app(StorageMeter::class)->files($user)->pluck('path') as $path) {
            Storage::disk(StorageFolder::diskFor($path))->put($path, str_repeat('x', 10));
        }
    }

    /**
     * ყველა მოდელი, რომელიც `StoredFile`-ს იყენებს — ანუ ატვირთული ფაილის
     * ყოველი ცხრილი. სია **კოდიდან იკითხება და არა ხელით იწერება**, თორემ
     * ხვალინდელი `<module>_files` სწორედ ისე გამოგვრჩებოდა, რაც ამ ტესტს
     * უნდა დაეჭირა.
     *
     * @return list<class-string>
     */
    private function storedFileModels(): array
    {
        $classes = [];

        foreach (glob(app_path('Models/*.php')) as $file) {
            $class = 'App\\Models\\'.basename($file, '.php');

            if (class_exists($class) && in_array(StoredFile::class, class_uses_recursive($class), true)) {
                $classes[] = $class;
            }
        }

        sort($classes);

        return $classes;
    }

    /**
     * **ბრძანება დრიფტირებულ მრიცხველს აღადგენს** (Tasks DEBT-04).
     *
     * ⚠️ ეს ბრძანება ერთადერთი გზაა, რომლითაც `storage_used_bytes` შეიკეთება
     * (მიგრაციის, ბექაპიდან აღდგენის ან ხელით წაშლილი ფაილის შემდეგ) და
     * ტესტი საერთოდ არ ჰქონდა — `grep -rn "storage-recalc" tests` ცარიელი იყო.
     *
     * ⚠️ **„რა ითვლება"-ს ეს ტესტი განზრახ არ ამოწმებს** და შემდეგი ამოწმებს.
     * `recalculate()` ზუსტად `files()->sum('size')`-ია, ე.ი. აქ მასთან შედარება
     * ტავტოლოგია იქნებოდა; ამ ტესტის საგანი **ბრძანებაა** — დრიფტს ასწორებს,
     * `--user=` მართლა ზღუდავს და უცნობი მომხმარებელი ჩავარდნაა. სიის
     * სისრულეს `test_every_stored_file_model_is_counted_by_the_recalculation`
     * იცავს, და სწორედ ის იჭერს „ახალი ცხრილი გამორჩა" შემთხვევას.
     */
    public function test_storage_recalc_rebuilds_a_drifted_counter(): void
    {
        Storage::fake('public');
        Storage::fake('private');

        $user = $this->inventory();
        $this->fillDisk($user);

        $expected = (int) app(StorageMeter::class)->files($user)->sum('size');
        $this->assertGreaterThan(0, $expected);

        // ⚠️ დრიფტი **ორივე მიმართულებით** — გაბერილიც და დაკლებულიც
        $user->forceFill(['storage_used_bytes' => 999_999])->save();
        $this->other->forceFill(['storage_used_bytes' => 4_242])->save();

        $this->artisan('mediary:storage-recalc', ['--user' => $user->id])->assertSuccessful();

        $this->assertSame($expected, (int) $user->refresh()->storage_used_bytes);

        // `--user=` მართლა ზღუდავს — სხვისი (ასევე არასწორი) მრიცხველი ხელუხლებელია
        $this->assertSame(4_242, (int) $this->other->refresh()->storage_used_bytes);

        $user->forceFill(['storage_used_bytes' => 0])->save();
        $this->artisan('mediary:storage-recalc')->assertSuccessful();

        $this->assertSame($expected, (int) $user->refresh()->storage_used_bytes);
        // ⚠️ ყველა მომხმარებელზე გაშვება სხვისსაც ასწორებს — ფაილების გარეშე ნულია
        $this->assertSame(0, (int) $this->other->refresh()->storage_used_bytes);

        $this->artisan('mediary:storage-recalc', ['--user' => 'nobody@example.com'])->assertFailed();
    }

    /**
     * **ყოველი `StoredFile` ცხრილი გადათვლაში ხვდება** (Tasks DEBT-04).
     *
     * ⚠️ ესაა ამ წყვილის ნამდვილი მცველი. თუ ხვალინდელი `<module>_files`
     * `files()`-ში არ ჩაიწერა, გადათვლა **უხმოდ ამცირებს** ჯამს და
     * მომხმარებელს უფასო კვოტას აძლევს — ზუსტად ის, რაც `games.cover_path`-სა
     * და `database_backups`-ს დაემართა. აქედან სია **კოდიდან** იკითხება,
     * ე.ი. ახალი ტრეიტის მომხმარებელი ავტომატურად ხვდება შემოწმებაში.
     *
     * ⚠️ „რიგი საერთოდ არსებობს"-იც მოწმდება: `inventory()`-ში დავიწყებული
     * მოდელი სხვაგვარად ტესტს **უაზროდ გაატარებდა** (ცარიელ სიაზე ციკლი
     * არაფერს ამტკიცებს) — ე.ი. ახალი ცხრილი ორივე ადგილს აახლებინებს.
     */
    public function test_every_stored_file_model_is_counted_by_the_recalculation(): void
    {
        Storage::fake('public');
        Storage::fake('private');

        $user = $this->inventory();
        $this->fillDisk($user);

        $paths = app(StorageMeter::class)->files($user)->pluck('path')->all();
        $models = $this->storedFileModels();

        /* ⚠️ **ჯერ ღუზები** (`RegistryConsistencyTest`-ის წესი): სკანერი კოდს
           კითხულობს, ე.ი. მისი გაფუჭება ქვედა ციკლს **უხმოდ დააცარიელებდა** და
           ტესტი უაზროდ გაივლიდა. სია განზრახ არ იყინება — მხოლოდ სამი ცნობილი
           მოდელი მოწმდება, ხვალინდელი `<module>_files` კი თავისით მოხვდება. */
        foreach ([GalleryImage::class, VideoFile::class, DatabaseBackup::class] as $anchor) {
            $this->assertContains($anchor, $models, "StoredFile-ის სკანერმა {$anchor} ვერ იპოვა");
        }

        foreach ($models as $class) {
            $rows = $class::query()->withoutGlobalScope('owner')->where('user_id', $user->id)->get(['path']);

            $this->assertNotEmpty(
                $rows,
                "{$class} `inventory()`-ში არ იქმნება — დაამატე, თორემ ეს ტესტი მასზე ვერაფერს ამტკიცებს",
            );

            foreach ($rows as $row) {
                $this->assertContains(
                    $row->path,
                    $paths,
                    "{$class} ({$row->path}) `StorageMeter::files()`-ში არ ჩანს — გადათვლა მას გამოტოვებს",
                );
            }
        }
    }

    /**
     * **ანგარიშის წაშლა დისკზე არაფერს ტოვებს** (Tasks BUG-21).
     *
     * ⚠️ აქამდე `destroy()` მხოლოდ ფილმებსა და სერიალებს შლიდა მოდელით —
     * დანარჩენი რვა მოდულის, ჩატის, ბაზის ასლისა და custom-field-ის ფაილები
     * დისკზე ობლად რჩებოდა, კვოტის მრიცხველი კი ანგარიშთან ერთად ქრებოდა,
     * ე.ი. ადგილი სამუდამოდ იკარგებოდა.
     *
     * ⚠️ ტესტი **ინვენტარს** იყენებს და არა ხელით ჩაწერილ სიას: ხვალინდელი
     * მოდული `inventory()`-ში დაემატება და ავტომატურად შემოწმდება.
     */
    public function test_deleting_an_account_leaves_no_file_behind(): void
    {
        Storage::fake('public');
        Storage::fake('private');

        $user = $this->inventory();
        $this->fillDisk($user);

        $paths = app(StorageMeter::class)->files($user)->pluck('path')->all();
        $this->assertGreaterThanOrEqual(15, count($paths));

        $admin = $this->makeUser('root', []);
        $admin->assignRole('super_admin')->save();

        $this->actingAs($admin->refresh())
            ->deleteJson("/api/admin/users/{$user->id}")
            ->assertNoContent();

        foreach ($paths as $path) {
            Storage::disk(StorageFolder::diskFor($path))->assertMissing($path);
        }

        $this->assertDatabaseMissing('users', ['id' => $user->id]);
    }

    /**
     * ⚠️ **სხვისი ფაილი ხელუხლებელია.** წაშლა `StorageMeter::files($user)`-ზე
     * დგას, ე.ი. სკოუპის ერთი შეცდომა მეზობელი ანგარიშის ბიბლიოთეკას
     * წაშლიდა — ზუსტად ის, რასაც ჩუმად ვერავინ შეამჩნევდა.
     */
    public function test_deleting_an_account_keeps_another_users_files(): void
    {
        Storage::fake('public');
        Storage::fake('private');

        $user = $this->inventory();
        $this->fillDisk($user);

        $mine = Movie::create([
            'user_id' => $this->other->id,
            'poster_path' => 'movies/posters/other.jpg',
            'poster_source' => 'upload',
        ]);
        Storage::disk('public')->put($mine->poster_path, 'keep');

        $admin = $this->makeUser('root', []);
        $admin->assignRole('super_admin')->save();

        $this->actingAs($admin->refresh())
            ->deleteJson("/api/admin/users/{$user->id}")
            ->assertNoContent();

        Storage::disk('public')->assertExists('movies/posters/other.jpg');
        $this->assertDatabaseHas('movies', ['id' => $mine->id]);
    }

    /**
     * **მეორე მონაწილეს მოჩვენება საუბარი არ რჩება** (Tasks BUG-21).
     *
     * ⚠️ საუბარი და წერილები **განზრახ არ იშლება** — ისინი მეორე მხარის
     * ისტორიაა; მხოლოდ სია აღარ ხატავს მას, რადგან თანამოსაუბრე აღარ
     * არსებობს და სათაურიც არ იქნებოდა.
     */
    public function test_a_deleted_account_leaves_no_ghost_conversation(): void
    {
        Storage::fake('public');
        Storage::fake('private');

        // ⚠️ ჩატი ორ **საჯარო** პროფილს შორისაა (§16.3-ის კარიბჭე)
        $this->user->forceFill(['profile_visibility' => 'public'])->save();
        $this->other->forceFill(['profile_visibility' => 'public'])->save();

        $conversation = app(ChatService::class)
            ->between($this->user->refresh(), $this->other->refresh());
        Message::create([
            'conversation_id' => $conversation->id,
            'user_id' => $this->other->id,
            'type' => 'text',
            'body' => 'hi',
        ]);

        $admin = $this->makeUser('root', []);
        $admin->assignRole('super_admin')->save();

        $this->actingAs($admin->refresh())
            ->deleteJson("/api/admin/users/{$this->user->id}")
            ->assertNoContent();

        $this->actingAs($this->other->refresh())
            ->getJson('/api/chat')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        // ⚠️ რიგი კი რჩება — მეორე მხარის წერილი მისი ისტორიაა
        $this->assertDatabaseHas('conversations', ['id' => $conversation->id]);
    }
}
