<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use App\Models\UserCredential;
use App\Models\Video;
use App\Services\Credentials\CredentialStore;
use App\Services\Links\LinkResolver;
use App\Services\Video\VideoMetadata;
use App\Services\Video\YtDlp;
use App\Support\CredentialProviders;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **ბმულის მეტა-მონაცემი ერთი კარიდან**.
 *
 * ⚠️ `Http::fake()` **ერთხელ**, ორი შაბლონით (პროექტის წესი: მეორე `fake()`
 * არაფერს ცვლის): oEmbed-ის მისამართი JSON-ს აბრუნებს, ყველა დანარჩენი —
 * Open Graph-იან HTML-ს. მოწმდება: YouTube → ვიდეო oEmbed-ის სათაურით და
 * ესკიზით; ჩვეულებრივი გვერდი → OG; ჩავარდნა → ცარიელი ველები 200-ით; მეორე
 * გამოძახება ქეშიდანაა; `/videos/metadata` `other` ბმულზე OG-ზე გადადის.
 */
class LinkResolverTest extends TestCase
{
    use RefreshDatabase;

    private const PAGE = 'http://203.0.113.10/article';

    private function fake(int $pageStatus = 200): void
    {
        Http::fake([
            'www.youtube.com/oembed*' => Http::response([
                'title' => 'Never Gonna Give You Up',
                'author_name' => 'Rick Astley',
                'thumbnail_url' => 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
            ], 200),
            '*' => Http::response(
                '<html><head><title>Fallback</title><meta property="og:title" content="OG Title"><meta property="og:description" content="OG Desc"><meta property="og:image" content="/cover.jpg"></head><body></body></html>',
                $pageStatus,
                ['Content-Type' => 'text/html; charset=utf-8'],
            ),
        ]);
    }

    public function test_a_youtube_link_resolves_through_oembed(): void
    {
        $this->fake();

        $meta = app(LinkResolver::class)->resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

        $this->assertSame('video', $meta['kind']);
        $this->assertSame('youtube', $meta['platform']);
        $this->assertSame('Never Gonna Give You Up', $meta['title']);
        $this->assertSame('Rick Astley', $meta['author']);
        $this->assertSame('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', $meta['image_url']);
        $this->assertSame('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', $meta['embed_url']);
        $this->assertSame('youtube.com', $meta['domain']);
    }

    public function test_an_ordinary_page_resolves_through_open_graph(): void
    {
        $this->fake();

        $meta = app(LinkResolver::class)->resolve(self::PAGE);

        $this->assertSame('page', $meta['kind']);
        $this->assertSame('OG Title', $meta['title']);
        $this->assertSame('OG Desc', $meta['description']);
        $this->assertSame('http://203.0.113.10/cover.jpg', $meta['image_url']);
        $this->assertSame('203.0.113.10', $meta['domain']);
        $this->assertNull($meta['duration']);
    }

    public function test_a_failing_page_is_an_empty_answer_not_an_error(): void
    {
        $this->fake(503);

        $meta = app(LinkResolver::class)->resolve(self::PAGE);

        $this->assertSame('page', $meta['kind']);
        $this->assertNull($meta['title']);
        $this->assertNull($meta['image_url']);
        $this->assertSame('203.0.113.10', $meta['domain']);
    }

    public function test_the_second_lookup_comes_from_the_cache(): void
    {
        $this->fake();
        Cache::flush();

        app(LinkResolver::class)->resolve(self::PAGE);
        app(LinkResolver::class)->resolve(self::PAGE);

        Http::assertSentCount(1);
    }

    public function test_the_endpoint_needs_a_login_and_a_url(): void
    {
        $this->fake();
        $this->seed(ModulesSeeder::class);

        $this->postJson('/api/links/metadata', ['url' => self::PAGE])->assertStatus(401);

        $user = User::create(['name' => 'lia', 'username' => 'lia', 'email' => 'lia@example.com', 'password' => 'password']);
        $user->modules()->sync(Module::where('key', 'book')->pluck('id')->all());

        $this->actingAs($user)->postJson('/api/links/metadata', ['url' => 'not a url'])->assertStatus(422);

        $this->actingAs($user)->postJson('/api/links/metadata', ['url' => self::PAGE])
            ->assertOk()
            ->assertJsonPath('kind', 'page')
            ->assertJsonPath('title', 'OG Title');
    }

    /* ================= სრული ინფო ბმულიდან ================= */

    private function userWithModules(string $name, array $modules = ['video', 'song', 'bookmark']): User
    {
        $this->seed(ModulesSeeder::class);
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::whereIn('key', $modules)->pluck('id')->all());

        return $user->refresh();
    }

    /** გასაღებით: Data API-ის თარიღი და **საუკეთესო** ესკიზი (`maxres`), ტეგები, სრული აღწერა */
    public function test_youtube_with_a_key_brings_the_date_and_the_best_thumbnail(): void
    {
        Http::fake([
            'www.youtube.com/oembed*' => Http::response(['title' => 'oEmbed title', 'author_name' => 'Rick Astley', 'thumbnail_url' => 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'], 200),
            'www.googleapis.com/youtube/v3/videos*' => Http::response(['items' => [[
                'snippet' => [
                    'title' => 'Never Gonna Give You Up',
                    'description' => str_repeat('ა', 1200),
                    'channelTitle' => 'Rick Astley',
                    'publishedAt' => '2009-10-25T06:57:33Z',
                    'tags' => ['rick', 'astley'],
                    'thumbnails' => [
                        'high' => ['url' => 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'],
                        'maxres' => ['url' => 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'],
                    ],
                ],
                'contentDetails' => ['duration' => 'PT3M33S'],
            ]]], 200),
        ]);

        $user = $this->userWithModules('nino');
        UserCredential::create(['user_id' => $user->id, 'provider' => CredentialProviders::YOUTUBE, 'credentials' => ['key' => 'yt-key']]);
        CredentialStore::forget();
        $this->actingAs($user);

        $meta = app(LinkResolver::class)->resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

        $this->assertSame('Never Gonna Give You Up', $meta['title']);
        $this->assertSame('2009-10-25', $meta['published_at']);
        $this->assertSame('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', $meta['image_url']);
        $this->assertSame(['rick', 'astley'], $meta['tags']);
        $this->assertSame(213, $meta['duration']);
        // აღწერა 500-ზე აღარ იჭრება
        $this->assertSame(1200, mb_strlen($meta['description']));
    }

    /** გასაღების გარეშე: `yt-dlp -J` (ყალბი) — აღწერა, თარიღი, ესკიზი, ხანგრძლივობა, ტეგები */
    public function test_youtube_without_a_key_reads_yt_dlp(): void
    {
        $this->fake();
        $this->app->instance(YtDlp::class, new class extends YtDlp
        {
            public function available(): bool
            {
                return true;
            }

            public function info(string $url): ?array
            {
                return [
                    'title' => 'yt-dlp title',
                    'description' => 'Full description from yt-dlp',
                    'published_at' => '2009-10-25',
                    'thumbnail' => 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.webp',
                    'duration' => 213,
                    'tags' => ['rick'],
                    'channel' => 'Rick Astley',
                ];
            }
        });

        $meta = app(LinkResolver::class)->resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

        // oEmbed-ის სათაური რჩება, დანარჩენი yt-dlp-იდან
        $this->assertSame('Never Gonna Give You Up', $meta['title']);
        $this->assertSame('Full description from yt-dlp', $meta['description']);
        $this->assertSame('2009-10-25', $meta['published_at']);
        $this->assertSame('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.webp', $meta['image_url']);
        $this->assertSame(213, $meta['duration']);
        $this->assertSame(['rick'], $meta['tags']);
    }

    /** ვიდეოს, სიმღერის და ბუკმარკის probe ერთი წყაროდანაა (`LinkResolver`-ის ველებით) */
    public function test_the_module_probes_answer_with_the_resolver_fields(): void
    {
        $this->fake();
        $user = $this->userWithModules('gia');

        $video = $this->actingAs($user)->postJson('/api/videos/metadata', ['url' => self::PAGE])->assertOk()->json();
        $this->assertSame('OG Title', $video['title']);
        $this->assertSame('http://203.0.113.10/cover.jpg', $video['image_url']);
        $this->assertArrayHasKey('ytdlp', $video);
        $this->assertArrayHasKey('existing', $video);

        $this->actingAs($user)->postJson('/api/songs/metadata', ['url' => self::PAGE])
            ->assertOk()->assertJsonPath('description', 'OG Desc');
        $this->actingAs($user)->postJson('/api/bookmarks/metadata', ['url' => self::PAGE])
            ->assertOk()->assertJsonPath('kind', 'page');
    }

    /** შენახვისას ინახება ის ფოტო, რაც ფორმის ჩარჩომ აჩვენა, და თარიღი ბმულიდან */
    public function test_saving_a_video_keeps_the_frame_photo_and_the_date(): void
    {
        $this->fake();
        $this->app->instance(YtDlp::class, new class extends YtDlp
        {
            public function info(string $url): ?array
            {
                return ['title' => null, 'description' => 'd', 'published_at' => '2009-10-25', 'thumbnail' => null, 'duration' => 213, 'tags' => [], 'channel' => null];
            }
        });
        $user = $this->userWithModules('eka');
        $type = $this->actingAs($user)->getJson('/api/video-types')->json('data.0.id');

        $id = $this->actingAs($user)->postJson('/api/videos', [
            'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'title' => 'Rick',
            'type_id' => $type,
            'status' => 'to_watch',
            'thumbnail_url' => 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
        ])->assertCreated()->json('data.id');

        $video = Video::withoutGlobalScopes()->findOrFail($id);
        $this->assertSame('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', $video->thumbnail_url);
        $this->assertSame('2009-10-25', $video->published_at?->format('Y-m-d'));
    }

    /** ვიდეოს/სიმღერის `other` ბმულზე (არა YouTube/Vimeo/Dailymotion) სათაური და ესკიზი გვერდიდან მოდის */
    public function test_video_metadata_falls_back_to_open_graph_for_other_links(): void
    {
        $this->fake();

        $meta = app(VideoMetadata::class)->fetch(self::PAGE);

        $this->assertSame('other', $meta['platform']);
        $this->assertSame('OG Title', $meta['title']);
        $this->assertSame('OG Desc', $meta['description']);
        $this->assertSame('http://203.0.113.10/cover.jpg', $meta['thumbnail_url']);
        $this->assertSame('opengraph', $meta['source']);
    }
}
