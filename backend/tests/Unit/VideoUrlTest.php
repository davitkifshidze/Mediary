<?php

namespace Tests\Unit;

use App\Support\VideoUrl;
use PHPUnit\Framework\TestCase;

/**
 * Tasks §55.1 — **YouTube-ის ფლეილისტის ამოცნობა** (`list=`).
 */
class VideoUrlTest extends TestCase
{
    private const LIST = 'PLillGF-RfqbbiTGgA77tGO426V3hRF9iE';

    public function test_a_playlist_page_is_youtube_without_a_video(): void
    {
        $parsed = VideoUrl::parse('https://www.youtube.com/playlist?list='.self::LIST);

        $this->assertSame('youtube', $parsed['platform']);
        $this->assertNull($parsed['external_id']);
        $this->assertSame(self::LIST, $parsed['playlist_id']);
        $this->assertSame('https://www.youtube-nocookie.com/embed/videoseries?list='.self::LIST, $parsed['embed_url']);
        $this->assertNull($parsed['thumbnail_url']);
    }

    public function test_a_video_inside_a_playlist_keeps_both(): void
    {
        $parsed = VideoUrl::parse('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list='.self::LIST.'&index=3');

        $this->assertSame('youtube', $parsed['platform']);
        $this->assertSame('dQw4w9WgXcQ', $parsed['external_id']);
        $this->assertSame(self::LIST, $parsed['playlist_id']);
        $this->assertSame('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', $parsed['embed_url']);

        // მოკლე ბმული და მობილური ჰოსტიც
        $this->assertSame(self::LIST, VideoUrl::parse('https://youtu.be/dQw4w9WgXcQ?list='.self::LIST)['playlist_id']);
        $this->assertSame(self::LIST, VideoUrl::parse('https://m.youtube.com/playlist?list='.self::LIST)['playlist_id']);
    }

    public function test_the_embed_videoseries_link_is_a_playlist_and_not_a_video_called_videoseries(): void
    {
        $parsed = VideoUrl::parse('https://www.youtube-nocookie.com/embed/videoseries?list='.self::LIST);

        $this->assertNull($parsed['external_id']);
        $this->assertSame(self::LIST, $parsed['playlist_id']);
    }

    public function test_private_lists_and_foreign_hosts_are_not_playlists(): void
    {
        // „მოგვიანებით სანახავი" / „მოწონებული" — პირადია და API-ით არ იკითხება
        $this->assertNull(VideoUrl::parse('https://www.youtube.com/playlist?list=WL')['playlist_id']);
        $this->assertNull(VideoUrl::parse('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=LL')['playlist_id']);
        // `list=` სხვა საიტზე არაფერს ნიშნავს
        $this->assertNull(VideoUrl::parse('https://example.com/watch?list='.self::LIST)['playlist_id']);
        $this->assertSame('other', VideoUrl::parse('https://example.com/watch?list='.self::LIST)['platform']);
        // ჩვეულებრივ ვიდეოს ფლეილისტი არ აქვს
        $this->assertNull(VideoUrl::parse('https://www.youtube.com/watch?v=dQw4w9WgXcQ')['playlist_id']);
        $this->assertNull(VideoUrl::parse('https://vimeo.com/76979871')['playlist_id']);
    }
}
