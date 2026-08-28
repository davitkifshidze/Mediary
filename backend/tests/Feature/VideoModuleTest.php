<?php

namespace Tests\Feature;

use App\Models\Attachment;
use App\Models\Module;
use App\Models\Note;
use App\Models\User;
use App\Models\Video;
use App\Support\VideoUrl;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * I5 — ვიდეოს მოდული: ბმულის ამოცნობა, მფლობელობა და 18+ ცალკე მოდულით დაფარვა.
 */
class VideoModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        $this->user = $this->makeUser('vera', ['video']);
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

    public function test_url_parser_recognises_platforms(): void
    {
        $yt = VideoUrl::parse('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s');
        $this->assertSame('youtube', $yt['platform']);
        $this->assertSame('dQw4w9WgXcQ', $yt['external_id']);
        $this->assertSame('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', $yt['embed_url']);

        $this->assertSame('dQw4w9WgXcQ', VideoUrl::parse('https://youtu.be/dQw4w9WgXcQ')['external_id']);
        $this->assertSame('dQw4w9WgXcQ', VideoUrl::parse('https://www.youtube.com/shorts/dQw4w9WgXcQ')['external_id']);
        $this->assertSame('vimeo', VideoUrl::parse('https://vimeo.com/76979871')['platform']);
        $this->assertSame('file', VideoUrl::parse('https://cdn.example.com/clip.mp4')['platform']);

        // უცნობი წყარო embed-ის გარეშე რჩება — iframe მხოლოდ allowlist-ზე
        $other = VideoUrl::parse('https://example.com/watch/123');
        $this->assertSame('other', $other['platform']);
        $this->assertNull($other['embed_url']);
    }

    public function test_module_gate_and_crud(): void
    {
        $outsider = $this->makeUser('nomodule', []);
        $this->actingAs($outsider)->getJson('/api/videos')->assertStatus(403);

        $this->actingAs($this->user)
            ->postJson('/api/videos', [
                'title' => 'Rick',
                'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                'tags' => ['music', 'meme'],
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.platform', 'youtube')
            ->assertJsonPath('data.embed_url', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
            ->assertJsonPath('data.tags', ['music', 'meme']);

        $video = Video::withoutGlobalScope('owner')->firstOrFail();
        $this->assertSame($this->user->id, $video->user_id);

        $this->actingAs($this->user)->patchJson("/api/videos/{$video->id}/favorite")
            ->assertOk()->assertJsonPath('data.is_favorite', true);

        $this->actingAs($this->user)->postJson("/api/videos/{$video->id}/watched")
            ->assertOk()->assertJsonPath('data.watch_count', 1);
    }

    public function test_other_users_video_is_not_found(): void
    {
        $other = $this->makeUser('otto', ['video']);
        $video = Video::create([
            'user_id' => $other->id,
            'title' => 'Private',
            'url' => 'https://youtu.be/dQw4w9WgXcQ',
        ]);

        $this->actingAs($this->user)->getJson("/api/videos/{$video->id}")->assertStatus(404);
        $this->actingAs($this->user)->getJson('/api/videos')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_adult_content_requires_its_own_module(): void
    {
        $adultVideo = Video::create([
            'user_id' => $this->user->id,
            'title' => 'Hidden',
            'url' => 'https://example.com/x',
            'is_adult' => true,
        ]);

        // მოდულის გარეშე: არც სიაში ჩანს, არც პირდაპირ იხსნება
        $this->actingAs($this->user)->getJson('/api/videos')->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($this->user)->getJson("/api/videos/{$adultVideo->id}")->assertStatus(404);

        // და ვერც შეიქმნება
        $this->actingAs($this->user)
            ->postJson('/api/videos', ['title' => 'X', 'url' => 'https://example.com/y', 'is_adult' => true])
            ->assertStatus(403);

        // მოდულის ჩართვის შემდეგ ორივე მუშაობს
        $this->user->modules()->syncWithoutDetaching(Module::where('key', 'video_adult')->pluck('id')->all());

        $this->actingAs($this->user->refresh())->getJson('/api/videos')->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($this->user)->getJson("/api/videos/{$adultVideo->id}")->assertOk();
    }

    /** K3 — ფაილები/ჩანიშვნები და მათი გასუფთავება ვიდეოს წაშლისას */
    public function test_attachments_and_notes_lifecycle(): void
    {
        Storage::fake('public');

        $video = Video::create([
            'user_id' => $this->user->id,
            'title' => 'With extras',
            'url' => 'https://youtu.be/dQw4w9WgXcQ',
        ]);

        $this->actingAs($this->user)
            ->postJson("/api/videos/{$video->id}/attachments", [
                'kind' => 'image',
                'files' => [UploadedFile::fake()->image('shot.jpg')],
            ])
            ->assertStatus(201);

        $this->actingAs($this->user)
            ->postJson("/api/videos/{$video->id}/attachments", [
                'kind' => 'doc',
                'files' => [UploadedFile::fake()->create('notes.pdf', 12, 'application/pdf')],
            ])
            ->assertStatus(201);

        $this->actingAs($this->user)
            ->postJson("/api/videos/{$video->id}/notes", ['body' => 'timestamp 3:20'])
            ->assertStatus(201);

        $this->actingAs($this->user)->getJson('/api/videos')
            ->assertOk()
            ->assertJsonPath('data.0.images_count', 1)
            ->assertJsonPath('data.0.documents_count', 1)
            ->assertJsonPath('data.0.notes_count', 1);

        $path = Attachment::where('kind', 'image')->value('path');
        Storage::disk('public')->assertExists($path);

        // ვიდეოს წაშლა → ჩანაწერებიც და ფაილებიც ქრება (morphs cascade-ს არ ქმნის)
        $this->actingAs($this->user)->deleteJson("/api/videos/{$video->id}")->assertNoContent();

        $this->assertSame(0, Attachment::withoutGlobalScope('owner')->count());
        $this->assertSame(0, Note::withoutGlobalScope('owner')->count());
        Storage::disk('public')->assertMissing($path);
    }

    /** სხვისი ფაილი მიუწვდომელია */
    public function test_attachment_of_another_user_is_not_found(): void
    {
        Storage::fake('public');

        $other = $this->makeUser('otto2', ['video']);
        $video = Video::create(['user_id' => $other->id, 'title' => 'X', 'url' => 'https://youtu.be/abc123']);
        $attachment = $video->attachments()->create([
            'user_id' => $other->id,
            'kind' => 'image',
            'disk' => 'public',
            'path' => 'gallery/x.jpg',
        ]);

        $this->actingAs($this->user)->getJson("/api/videos/{$video->id}/attachments")->assertStatus(404);
        $this->actingAs($this->user)->deleteJson("/api/attachments/{$attachment->id}")->assertStatus(404);
    }

    public function test_super_admin_does_not_get_sensitive_modules_automatically(): void
    {
        $admin = $this->makeUser('root', []);
        $admin->forceFill(['role' => 'super_admin'])->save();

        $this->assertTrue($admin->hasModule('video'));
        $this->assertFalse($admin->hasModule('video_adult'));

        $admin->modules()->syncWithoutDetaching(Module::where('key', 'video_adult')->pluck('id')->all());
        $this->assertTrue($admin->refresh()->hasModule('video_adult'));
    }

    public function test_module_settings_store_consent(): void
    {
        $this->user->modules()->syncWithoutDetaching(Module::where('key', 'video_adult')->pluck('id')->all());

        $this->actingAs($this->user->refresh())
            ->putJson('/api/modules/video_adult/settings', ['settings' => ['consent_at' => '2026-08-28']])
            ->assertOk();

        $this->actingAs($this->user)->getJson('/api/modules')
            ->assertOk()
            ->assertJsonFragment(['consent_at' => '2026-08-28']);
    }
}
