<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use App\Services\Links\LinkResolver;
use App\Services\Video\VideoMetadata;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **ბმულის მეტა-მონაცემი ერთი კარიდან** (Tasks §15).
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
