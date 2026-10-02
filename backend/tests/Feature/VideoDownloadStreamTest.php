<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use App\Models\Video;
use App\Support\StorageFolder;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **ლოკალური ასლის მიწოდება — `SafeMime`-ით და Range-ით** (Tasks §6.4).
 *
 * ⚠️ აქამდე `$disk->response()` იყო: `StreamedResponse` `Range`-ს არ იცნობდა, ე.ი.
 * `<video>`-ში გადახვევა მთელ ფაილს თავიდან ითხოვდა. `BinaryFileResponse` 206-ს
 * და `Content-Range`-ს თვითონ აბრუნებს — სწორედ ეს მოწმდება აქ, ფაილის რეალური
 * ბაიტებით.
 */
class VideoDownloadStreamTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        Storage::fake('private');

        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'dara',
            'username' => 'dara',
            'email' => 'dara@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::where('key', 'video')->pluck('id')->all());
        $this->user = $this->user->refresh();
    }

    private function downloadedVideo(string $bytes): Video
    {
        $path = StorageFolder::VIDEO_DOWNLOADS.'/clip.mp4';
        Storage::disk(StorageFolder::diskFor($path))->put($path, $bytes);

        $video = Video::create([
            'user_id' => $this->user->id,
            'title' => 'კლიპი',
            'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'platform' => 'youtube',
            'external_id' => 'dQw4w9WgXcQ',
        ]);

        $video->forceFill([
            'download_path' => $path,
            'download_name' => 'კლიპი.mp4',
            'download_size' => strlen($bytes),
            'download_format' => 'mp4',
            'download_status' => Video::DOWNLOAD_READY,
            'downloaded_at' => now(),
        ])->save();

        return $video;
    }

    public function test_the_whole_file_streams_inline_with_nosniff(): void
    {
        $video = $this->downloadedVideo('0123456789');

        $response = $this->actingAs($this->user)->get("/api/videos/{$video->id}/download");

        $response->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Accept-Ranges', 'bytes');

        $this->assertStringStartsWith('inline', (string) $response->headers->get('Content-Disposition'));
        $this->assertSame('0123456789', $this->bodyOf($response));
    }

    /** ⚠️ გადახვევა — ბრაუზერი ნაწილს ითხოვს და ზუსტად ის ნაწილი უნდა მიიღოს */
    public function test_a_range_request_gets_only_the_requested_bytes(): void
    {
        $video = $this->downloadedVideo('0123456789');

        $response = $this->actingAs($this->user)
            ->get("/api/videos/{$video->id}/download", ['Range' => 'bytes=2-5']);

        $response->assertStatus(206)
            ->assertHeader('Content-Range', 'bytes 2-5/10')
            ->assertHeader('Content-Length', '4');

        $this->assertSame('2345', $this->bodyOf($response));
    }

    /** სხვისი ვიდეო — 404 და არა 403 (ფაილის არსებობაც ინფორმაციაა) */
    public function test_another_user_gets_404(): void
    {
        $video = $this->downloadedVideo('0123456789');

        $other = User::create([
            'name' => 'nino', 'username' => 'nino', 'email' => 'nino@example.com', 'password' => 'password',
        ]);
        $other->modules()->sync(Module::where('key', 'video')->pluck('id')->all());

        $this->actingAs($other->refresh())->get("/api/videos/{$video->id}/download")->assertNotFound();
    }

    /** `BinaryFileResponse` სხეულს `sendContent()`-ით წერს — `getContent()` ცარიელია */
    private function bodyOf($response): string
    {
        ob_start();
        $response->baseResponse->sendContent();

        return (string) ob_get_clean();
    }
}
