<?php

namespace Tests\Feature;

use App\Models\Song;
use App\Models\User;
use App\Models\Video;
use App\Models\VideoType;
use App\Support\VideoUrl;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **„ეს ბმული უკვე გაქვს" (FEAT-17).**
 *
 * ⚠️ `Http::fake()` აუცილებელია: `VideoMetadata` oEmbed-ს ეძახის, ე.ი.
 * ტესტი უამისოდ ქსელს მოითხოვდა (პროექტის ტესტები sqlite `:memory:`-ზე
 * ოფლაინ უნდა მუშაობდეს).
 */
class DuplicateLinkTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        Http::fake(['*' => Http::response([], 404)]);

        $this->user = User::factory()->create();
        $this->user->assignRole('super_admin')->save();
        $this->actingAs($this->user);
    }

    /**
     * ⚠️ **`platform`/`external_id` ცხადად იწერება.** ისინი კონტროლერში
     * გამოითვლება (`VideoUrl::parse()`), ე.ი. `Model::create()` მათ არ
     * ავსებს — იგივე წესი, რაც ტეგების ნორმალიზაციას აქვს. ტესტი სწორედ
     * იმ მდგომარეობას უნდა ქმნიდეს, რასაც ფორმა ტოვებს.
     */
    private function record(string $class, string $url, string $title, array $extra = []): object
    {
        $parsed = VideoUrl::parse($url);

        return $class::create([
            'user_id' => $this->user->id,
            'title' => $title,
            'url' => $url,
            'platform' => $parsed['platform'],
            'external_id' => $parsed['external_id'],
            ...$extra,
        ]);
    }

    private function video(string $url, string $title = 'დამატებული'): Video
    {
        VideoType::ensureDefaults($this->user->id);
        $type = VideoType::where('user_id', $this->user->id)->first();

        return $this->record(Video::class, $url, $title, ['type_id' => $type->id]);
    }

    /**
     * **ერთი და იგივე ვიდეო სხვა მისამართით მაინც იპოვება.**
     *
     * ეს ტესტის მთავარი აზრია: სტრიქონული შედარება `youtu.be`-ს და
     * `watch?v=`-ს ვერ დააკავშირებდა — სწორედ იმ შემთხვევაში, რომლისთვისაც
     * გაფრთხილება არსებობს.
     */
    public function test_the_same_video_is_found_through_another_address(): void
    {
        $existing = $this->video('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

        $this->postJson('/api/videos/metadata', ['url' => 'https://youtu.be/dQw4w9WgXcQ?t=42'])
            ->assertOk()
            ->assertJsonPath('existing.id', $existing->id)
            ->assertJsonPath('existing.title', 'დამატებული');
    }

    public function test_a_new_link_reports_nothing(): void
    {
        $this->video('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

        $this->postJson('/api/videos/metadata', ['url' => 'https://www.youtube.com/watch?v=oHg5SJYRHA0'])
            ->assertOk()
            ->assertJsonPath('existing', null);
    }

    /** გაფრთხილებაა და არა აკრძალვა — შენახვა მაინც გადის */
    public function test_saving_a_duplicate_is_still_allowed(): void
    {
        $this->video('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        $type = VideoType::where('user_id', $this->user->id)->first();

        $this->postJson('/api/videos', [
            'title' => 'იგივე, სხვა ტიპით',
            'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'type_id' => $type->id,
            // სტატუსიც და ტიპიც სავალდებულოა (2026-09-16-ის წესი)
            'status' => 'to_watch',
        ])->assertStatus(201);

        $this->assertSame(2, Video::count());
    }

    /** რედაქტირებისას ჩანაწერი საკუთარ თავს ვერ დაემთხვევა */
    public function test_a_record_is_never_its_own_duplicate(): void
    {
        $video = $this->video('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

        $this->postJson('/api/videos/metadata', [
            'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'exclude' => $video->id,
        ])->assertOk()->assertJsonPath('existing', null);
    }

    /** სხვისი ბიბლიოთეკა არაფერ შუაშია (`owner` scope) */
    public function test_another_accounts_video_is_not_a_duplicate(): void
    {
        $other = User::factory()->create();
        VideoType::ensureDefaults($other->id);
        $type = VideoType::withoutGlobalScope('owner')->where('user_id', $other->id)->first();
        Video::withoutGlobalScope('owner')->create([
            'user_id' => $other->id,
            'title' => 'სხვისი',
            'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'platform' => 'youtube',
            'external_id' => 'dQw4w9WgXcQ',
            'type_id' => $type->id,
        ]);

        $this->postJson('/api/videos/metadata', ['url' => 'https://youtu.be/dQw4w9WgXcQ'])
            ->assertOk()
            ->assertJsonPath('existing', null);
    }

    /** კალათაში გადატანილი აღარ ჩანს — მასზე მიმავალი ბმული ცარიელ ადგილს გახსნიდა */
    public function test_a_trashed_video_is_not_reported(): void
    {
        $this->video('https://www.youtube.com/watch?v=dQw4w9WgXcQ')->moveToTrash();

        $this->postJson('/api/videos/metadata', ['url' => 'https://youtu.be/dQw4w9WgXcQ'])
            ->assertOk()
            ->assertJsonPath('existing', null);
    }

    /**
     * **პირდაპირ ფაილზე შედარება მისამართითაა და არა `external_id`-ით.**
     *
     * ⚠️ იქ `platform = 'other'` და `external_id = null`, ე.ი. `null`-ზე
     * შედარება ყველა პირდაპირ ბმულს ერთმანეთის დუბლად აქცევდა — ქვემოთ
     * ორივე მხარეა შემოწმებული.
     */
    public function test_a_direct_file_matches_by_address_only(): void
    {
        $existing = $this->video('https://example.com/clips/one.mp4');
        $this->video('https://example.com/clips/two.mp4', 'მეორე');

        $this->postJson('/api/videos/metadata', ['url' => 'https://example.com/clips/one.mp4'])
            ->assertOk()
            ->assertJsonPath('existing.id', $existing->id);

        $this->postJson('/api/videos/metadata', ['url' => 'https://example.com/clips/three.mp4'])
            ->assertOk()
            ->assertJsonPath('existing', null);
    }

    public function test_songs_answer_the_same_way(): void
    {
        $song = $this->record(Song::class, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'სიმღერა');

        $this->postJson('/api/songs/metadata', ['url' => 'https://youtu.be/dQw4w9WgXcQ'])
            ->assertOk()
            ->assertJsonPath('existing.id', $song->id);
    }

    /** ⚠️ ვიდეოსა და სიმღერის ბიბლიოთეკები ერთმანეთს არ ერევა */
    public function test_a_video_is_not_a_duplicate_of_a_song(): void
    {
        $this->record(Song::class, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'სიმღერა');

        $this->postJson('/api/videos/metadata', ['url' => 'https://youtu.be/dQw4w9WgXcQ'])
            ->assertOk()
            ->assertJsonPath('existing', null);
    }
}
