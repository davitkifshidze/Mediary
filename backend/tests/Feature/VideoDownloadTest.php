<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use App\Models\Video;
use App\Services\Storage\StorageMeter;
use App\Services\Video\VideoDownloader;
use App\Services\Video\YtDlp;
use App\Support\BackgroundProcess;
use App\Support\StorageFolder;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **Tasks §7.1 — ვიდეოს ლოკალურად ჩამოწერა.**
 *
 * ⚠️ ნამდვილი `yt-dlp` ტესტში **არ ეშვება**: ის ამ მანქანაზე შეიძლება
 * საერთოდ არ იყოს, გარე ქსელს მიმართავს და გიგაბაიტს წერს. ამიტომ კლიენტი
 * იცვლება, სამაგიეროდ **დანარჩენი გზა ნამდვილია** — კვოტა, დისკი, სვეტები
 * და წაშლა ზუსტად ისე მუშაობს, როგორც პროდაქშენში.
 */
class VideoDownloadTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        /* ⚠️ **ორივე დისკი უნდა გაიყალბოს, თორემ ტესტი ნამდვილ საქაღალდეში წერს.**
           `VideoDownloader` ფაილს `videos/downloads`-ში დებს, ის კი **პრივატულ**
           დისკზეა — `Storage::fake()`-ის გარეშე `storage/app/private-uploads/`-ში
           ნამდვილი `.mp4`-ები რჩებოდა. ერთი საათის შემდეგ ისინი
           `StorageManagementTest`-ის ობოლი ფაილების სკანერში ჩნდებოდა და
           სრულიად სხვა ტესტი ვარდებოდა („1-ის ნაცვლად 14 ობოლი"). */
        Storage::fake('public');
        Storage::fake('private');

        $this->seed(ModulesSeeder::class);
        $this->user = $this->makeUser('dara');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::where('key', 'video')->pluck('id')->all());

        return $user->refresh();
    }

    private function makeVideo(User $user): Video
    {
        return Video::create([
            'user_id' => $user->id,
            'title' => 'ტესტური ვიდეო',
            'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'platform' => 'youtube',
            'external_id' => 'dQw4w9WgXcQ',
        ]);
    }

    /** `yt-dlp`-ის იმიტაცია: ნამდვილ ფაილს წერს დროებით საქაღალდეში */
    private function fakeYtDlp(int $bytes = 2048, bool $available = true): void
    {
        $this->app->bind(YtDlp::class, fn () => new class($bytes, $available) extends YtDlp
        {
            public function __construct(private int $bytes, private bool $ok) {}

            public function available(): bool
            {
                return $this->ok;
            }

            public function binary(): ?string
            {
                return $this->ok ? 'yt-dlp' : null;
            }

            public function ffmpeg(): ?string
            {
                return null;
            }

            public function version(): ?string
            {
                return $this->ok ? 'yt-dlp 2026.09.01' : null;
            }

            public function probe(string $url): array
            {
                return ['title' => 'ტესტური ვიდეო', 'duration' => 212, 'filesize' => $this->bytes];
            }

            public function download(string $url, string $targetDir): array
            {
                File::ensureDirectoryExists($targetDir);
                $path = $targetDir.DIRECTORY_SEPARATOR.'dQw4w9WgXcQ.mp4';
                File::put($path, str_repeat('x', $this->bytes));

                return [
                    'path' => $path,
                    'name' => 'dQw4w9WgXcQ.mp4',
                    'size' => $this->bytes,
                    'format' => '1920x1080 · MP4',
                ];
            }
        });
    }

    /* ============================================================
       პროგრამის არქონა — ცალკე მდგომარეობა
       ============================================================ */

    /**
     * ⚠️ **„ინსტრუმენტი არ გვაქვს" ≠ „ვიდეო ვერ ჩამოვიდა".** 503-ია და არა
     * 500/422 — ზუსტად ის განსხვავება, რაც `bgg_unavailable`-ს აქვს.
     */
    public function test_missing_ytdlp_answers_503_instead_of_breaking(): void
    {
        $this->fakeYtDlp(available: false);
        $video = $this->makeVideo($this->user);

        $this->actingAs($this->user)
            ->postJson("/api/videos/{$video->id}/download")
            ->assertStatus(503)
            ->assertJson(['message' => 'ytdlp_unavailable']);

        $this->assertNull($video->fresh()->download_status);
    }

    public function test_status_endpoint_reports_availability(): void
    {
        $this->fakeYtDlp();

        $this->actingAs($this->user)
            ->getJson('/api/videos/download-status')
            ->assertOk()
            ->assertJson(['available' => true, 'ffmpeg' => false]);
    }

    /* ============================================================
       ჩამოწერა — დისკი, კვოტა, სვეტები
       ============================================================ */

    public function test_download_stores_the_file_and_counts_it_against_the_quota(): void
    {
        $this->fakeYtDlp(4096);
        $video = $this->makeVideo($this->user);

        $this->assertTrue(app(VideoDownloader::class)->run($video));

        $video->refresh();
        $this->assertSame(Video::DOWNLOAD_READY, $video->download_status);
        $this->assertSame(4096, $video->download_size);
        $this->assertSame('1920x1080 · MP4', $video->download_format);
        $this->assertStringStartsWith(StorageFolder::VIDEO_DOWNLOADS.'/', $video->download_path);

        // კვოტის მრიცხველი ნამდვილ ზომას დაემატა
        $this->assertSame(4096, (int) $this->user->fresh()->storage_used_bytes);
    }

    /**
     * ⚠️ ჩამოწერილი ვიდეო **პრივატულ დისკზეა**, თუმცა მისი ფესვი (`videos/`)
     * საჯაროა — ე.ი. `/storage/*` მას ვერ ხედავს.
     */
    public function test_the_downloaded_copy_lives_on_the_private_disk(): void
    {
        $this->assertTrue(StorageFolder::isPrivate(StorageFolder::VIDEO_DOWNLOADS.'/a.mp4'));
        $this->assertSame('private', StorageFolder::diskFor(StorageFolder::VIDEO_DOWNLOADS));

        // მეზობელი ქვესაქაღალდე კვლავ საჯაროა — თამბნეილი `<img>`-ად ჩანს
        $this->assertFalse(StorageFolder::isPrivate(StorageFolder::VIDEO_THUMBNAILS.'/a.jpg'));
        // სეგმენტებით შედარება: მსგავსი სახელი ჩუმად პრივატული არ ხდება
        $this->assertFalse(StorageFolder::isPrivate('videos/downloads-old/a.mp4'));
    }

    /** კვოტაზე მეტი — ჩამოწერა ჩავარდება და ფაილიც არ რჩება */
    public function test_a_download_over_the_quota_fails_instead_of_silently_storing(): void
    {
        $this->fakeYtDlp(5000);
        $this->user->forceFill(['storage_quota_bytes' => 1000])->save();
        $video = $this->makeVideo($this->user);

        $this->assertFalse(app(VideoDownloader::class)->run($video));

        $video->refresh();
        $this->assertSame(Video::DOWNLOAD_FAILED, $video->download_status);
        $this->assertNotNull($video->download_error);
        $this->assertNull($video->download_path);
        $this->assertSame(0, (int) $this->user->fresh()->storage_used_bytes);
    }

    /* ============================================================
       ხელახალი ჩამოტვირთვა (BUG-22)
       ============================================================ */

    /**
     * **მთავარი რეგრესია:** კვოტაზე ჩავარდნილი ხელახალი ჩამოტვირთვა ძველ
     * ასლს **არ ანადგურებს**.
     *
     * ⚠️ რეპროდუქცია ჩვეულებრივი იყო: გაქვს ლოკალური ასლი, აჭერ „ხელახლა
     * ჩამოტვირთვას", ადგილი აღარ არის — 413. ძველი კოდი ფაილს **შემოწმებამდე**
     * შლიდა, ე.ი. პასუხი „ადგილი აღარ არის" იყო და ასლიც აღარ გქონდა. უარესი:
     * სვეტები `save()`-მდე ვერ აღწევდა, ამიტომ ჩანაწერი კიდევ `ready`-ს
     * ამბობდა და ღილაკი წაშლილ ფაილს ხსნიდა.
     */
    public function test_a_failed_quota_check_keeps_the_existing_copy(): void
    {
        $this->fakeYtDlp(4096);
        $video = $this->makeVideo($this->user);
        $this->assertTrue(app(VideoDownloader::class)->run($video));

        $path = $video->fresh()->download_path;
        $this->user->forceFill(['storage_quota_bytes' => 5000])->save();

        // ახალი ასლი ძველის გათავისუფლების შემდეგაც არ ეტევა: 9000 - 4096 > 904
        $this->fakeYtDlp(9000);

        $this->actingAs($this->user)
            ->postJson("/api/videos/{$video->id}/download")
            ->assertStatus(413)
            ->assertJson(['message' => 'storage_quota_exceeded']);

        $video->refresh();
        $this->assertSame(Video::DOWNLOAD_READY, $video->download_status);
        $this->assertSame($path, $video->download_path);
        $this->assertSame(4096, $video->download_size);
        Storage::disk('private')->assertExists($path);
        $this->assertSame(4096, (int) $this->user->fresh()->storage_used_bytes);
    }

    /**
     * ⚠️ **და უკუმხარეც:** ძველი ასლის ბაიტები სწორედ ამ ჩამოტვირთვას
     * დაეთმობა, ე.ი. კვოტიდან წინასწარ გამოიკლება. მის გარეშე ჩანაწერი
     * საკუთარ ადგილს დაიკავებდა და თითქმის სავსე კვოტაზე განახლება
     * შეუძლებელი გახდებოდა — შემოწმება „ჯერ კვოტა" ერთ ხარვეზს მეორეთი
     * შეცვლიდა.
     */
    public function test_replacing_a_copy_counts_only_the_difference(): void
    {
        $this->fakeYtDlp(4096);
        $video = $this->makeVideo($this->user);
        $this->assertTrue(app(VideoDownloader::class)->run($video));

        $path = $video->fresh()->download_path;
        $this->user->forceFill(['storage_quota_bytes' => 5000])->save();

        // 4500 მთლიანად არ ეტევა, სხვაობა (404) კი — დიახ
        $this->fakeYtDlp(4500);
        $this->app->bind(BackgroundProcess::class, fn () => new class extends BackgroundProcess
        {
            public function dispatch(array $command): bool
            {
                return true;
            }
        });

        $this->actingAs($this->user)
            ->postJson("/api/videos/{$video->id}/download")
            ->assertStatus(202);

        $video->refresh();
        $this->assertSame(Video::DOWNLOAD_RUNNING, $video->download_status);
        // ძველი ასლი გათავისუფლდა — ერთ ვიდეოზე ორი ფაილი არ არსებობს
        $this->assertNull($video->download_path);
        Storage::disk('private')->assertMissing($path);
        $this->assertSame(0, (int) $this->user->fresh()->storage_used_bytes);
    }

    /* ============================================================
       მიწოდება და წაშლა
       ============================================================ */

    /** ⚠️ სხვისი ფაილი **404-ია და არა 403** — არსებობაც ინფორმაციაა */
    public function test_another_users_download_is_a_404(): void
    {
        $this->fakeYtDlp();
        $owner = $this->makeUser('olga');
        $video = $this->makeVideo($owner);
        app(VideoDownloader::class)->run($video);

        $this->actingAs($this->user)
            ->get("/api/videos/{$video->id}/download")
            ->assertNotFound();
    }

    public function test_deleting_the_copy_releases_the_quota_but_keeps_the_record(): void
    {
        $this->fakeYtDlp(3000);
        $video = $this->makeVideo($this->user);
        app(VideoDownloader::class)->run($video);

        $this->assertSame(3000, (int) $this->user->fresh()->storage_used_bytes);

        $this->actingAs($this->user)
            ->deleteJson("/api/videos/{$video->id}/download")
            ->assertOk();

        $video->refresh();
        $this->assertNotNull($video->id);
        $this->assertNull($video->download_path);
        $this->assertNull($video->download_status);
        $this->assertSame(0, (int) $this->user->fresh()->storage_used_bytes);
    }

    /**
     * ⚠️ **მოდელის დონეზე** — `PurgeService` ჩანაწერს პირდაპირ `delete()`-ით
     * შლის სწორედ იმიტომ, რომ ივენთი გაისროლოს. კონტროლერში დაწერილი
     * გასუფთავება მასობრივ წაშლას გამორჩებოდა.
     */
    public function test_deleting_the_video_releases_the_download_at_model_level(): void
    {
        $this->fakeYtDlp(2500);
        $video = $this->makeVideo($this->user);
        app(VideoDownloader::class)->run($video);

        $path = $video->fresh()->download_path;
        $this->assertTrue(app(StorageMeter::class)->sizeOf($path) > 0);

        $video->fresh()->delete();

        $this->assertSame(0, (int) $this->user->fresh()->storage_used_bytes);
        $this->assertSame(0, app(StorageMeter::class)->sizeOf($path));
    }

    /* ============================================================
       სია და ორმაგი გაშვება
       ============================================================ */

    public function test_the_downloaded_section_lists_only_local_copies(): void
    {
        $this->fakeYtDlp();
        $local = $this->makeVideo($this->user);
        $plain = $this->makeVideo($this->user);
        app(VideoDownloader::class)->run($local);

        $ids = collect($this->actingAs($this->user)
            ->getJson('/api/videos?downloaded=1')
            ->assertOk()
            ->json('data'))->pluck('id')->all();

        $this->assertSame([$local->id], $ids);
        $this->assertNotContains($plain->id, $ids);
    }

    /** ⚠️ ორი პარალელური ჩამოწერა ერთსა და იმავე ვიდეოზე კვოტას ორჯერ დახარჯავდა */
    public function test_a_second_start_while_running_is_refused(): void
    {
        $this->fakeYtDlp();
        $video = $this->makeVideo($this->user);
        // ⚠️ **საწყისი დროც იწერება** — სწორედ ის ასხვავებს ცოცხალ გაშვებას
        // მკვდრისგან (§B1); მის გარეშე ჩანაწერი „გაჭედილად" ითვლება
        $video->forceFill([
            'download_status' => Video::DOWNLOAD_RUNNING,
            'download_started_at' => now(),
        ])->save();

        $this->actingAs($this->user)
            ->postJson("/api/videos/{$video->id}/download")
            ->assertStatus(409)
            ->assertJson(['message' => 'download_already_running']);
    }

    /* ============================================================
       გაჭედილი ჩამოწერა (აუდიტი 2026-09-14, §B1)
       ============================================================ */

    /**
     * **მთავარი რეგრესია:** მკვდარი ფონური პროცესი ვიდეოს სამუდამოდ არ კეტავს.
     *
     * ⚠️ **რეპროდუქცია იყო ჩვეულებრივი:** ჩამოწერა დაიწყე → დახურე
     * `artisan serve`-ის ტერმინალი. სტატუსი `running`-ად რჩებოდა, `POST`
     * სამუდამოდ 409-ს აბრუნებდა, `DELETE` კი ბილიკის არქონის გამო ჩუმად
     * არაფერს აკეთებდა — ე.ი. ამ ვიდეოს ჩამოწერა ხელით SQL-ის გარეშე
     * **ვეღარასდროს გაეშვებოდა**.
     */
    public function test_a_stale_running_download_can_be_restarted(): void
    {
        $this->fakeYtDlp();
        $video = $this->makeVideo($this->user);

        $video->forceFill([
            'download_status' => Video::DOWNLOAD_RUNNING,
            // yt-dlp-ის ლიმიტზე დიდი ხნის წინ — პროცესი ვერ იქნება ცოცხალი
            'download_started_at' => now()->subSeconds((int) config('mediary.ytdlp.timeout') + 3600),
        ])->save();

        $this->actingAs($this->user)
            ->postJson("/api/videos/{$video->id}/download")
            ->assertStatus(202);

        $video->refresh();
        $this->assertSame(Video::DOWNLOAD_RUNNING, $video->download_status);
        // ახალი გაშვების საწყისი დრო ახალია
        $this->assertTrue($video->download_started_at->greaterThan(now()->subMinute()));
    }

    /**
     * ⚠️ **მიგრაციამდელი გაჭედილი რიგი** — `download_started_at` ცარიელია.
     * „არ ვიცი, როდის დაიწყო" სამუდამო 409-ს ვერ გაამართლებს.
     */
    public function test_a_running_download_without_a_start_time_is_treated_as_stale(): void
    {
        $this->fakeYtDlp();
        $video = $this->makeVideo($this->user);
        $video->forceFill(['download_status' => Video::DOWNLOAD_RUNNING])->save();

        $this->assertTrue($video->downloadStale());

        $this->actingAs($this->user)
            ->postJson("/api/videos/{$video->id}/download")
            ->assertStatus(202);
    }

    /**
     * მეორე გამოსავალი: **წაშლა**. ადრე `deleteDownload()` პირველივე ხაზზე
     * ბრუნდებოდა, თუ ბილიკი ცარიელი იყო — ე.ი. გაჭედილ `running`-ს
     * ვერაფერი ასუფთავებდა და ღილაკი უშედეგოდ მუშაობდა.
     */
    public function test_deleting_clears_a_stuck_running_status(): void
    {
        $video = $this->makeVideo($this->user);
        $video->forceFill([
            'download_status' => Video::DOWNLOAD_RUNNING,
            'download_started_at' => now()->subDay(),
        ])->save();

        $this->actingAs($this->user)
            ->deleteJson("/api/videos/{$video->id}/download")
            ->assertOk()
            ->assertJsonPath('data.download_status', null);

        $this->assertNull($video->refresh()->download_status);
        $this->assertNull($video->download_started_at);
    }

    /**
     * ⚠️ **„გაჭედილია" API-ში ცხადად წერია** და SPA-ს თავისი ფორმულა არ
     * სჭირდება: ორი წყარო ერთ დღეს დაშორდებოდა და ღილაკი „მიმდინარეობს"-ს
     * აჩვენებდა მაშინ, როცა სერვერი უკვე უშვებდა ხელახლა გაშვებას.
     */
    public function test_the_resource_states_whether_the_run_is_stale(): void
    {
        $fresh = $this->makeVideo($this->user);
        $fresh->forceFill([
            'download_status' => Video::DOWNLOAD_RUNNING,
            'download_started_at' => now(),
        ])->save();

        $this->actingAs($this->user)
            ->getJson("/api/videos/{$fresh->id}")
            ->assertOk()
            ->assertJsonPath('data.download_stale', false);

        $fresh->forceFill(['download_started_at' => now()->subDay()])->save();

        $this->actingAs($this->user)
            ->getJson("/api/videos/{$fresh->id}")
            ->assertOk()
            ->assertJsonPath('data.download_stale', true);
    }

    /** მზა ან ჩავარდნილი ჩამოწერა „გაჭედილი" არასდროსაა */
    public function test_only_a_running_download_can_be_stale(): void
    {
        $video = $this->makeVideo($this->user);

        foreach ([null, Video::DOWNLOAD_READY, Video::DOWNLOAD_FAILED] as $status) {
            $video->forceFill([
                'download_status' => $status,
                'download_started_at' => now()->subYear(),
            ])->save();

            $this->assertFalse($video->downloadStale(), 'სტატუსი: '.var_export($status, true));
        }
    }

    /**
     * ⚠️ ფონური პროცესი ტესტში **არ ეშვება**, მაგრამ დაწყების გზა მაინც
     * მოწმდება: სტატუსი `running`-ია და პასუხი 202.
     */
    public function test_start_marks_the_video_running_and_launches_the_command(): void
    {
        $this->fakeYtDlp();
        /* ⚠️ `ArrayObject` და არა ჩვეულებრივი მასივი: arrow-function არგუმენტს
           **ასლად** იჭერს, ე.ი. `&$launched` კონტეინერში დარჩენილ ასლს
           მიუთითებდა და ტესტი ცარიელს დაინახავდა. */
        $launched = new \ArrayObject;

        $this->app->bind(BackgroundProcess::class, fn () => new class($launched) extends BackgroundProcess
        {
            public function __construct(private \ArrayObject $seen) {}

            public function dispatch(array $command): bool
            {
                $this->seen->append($command);

                return true;
            }
        });

        $video = $this->makeVideo($this->user);

        $this->actingAs($this->user)
            ->postJson("/api/videos/{$video->id}/download")
            ->assertStatus(202);

        $this->assertSame(Video::DOWNLOAD_RUNNING, $video->fresh()->download_status);
        $this->assertCount(1, $launched);
        $this->assertContains('videos:download', $launched[0]);
    }
}
