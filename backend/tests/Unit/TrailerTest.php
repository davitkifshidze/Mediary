<?php

namespace Tests\Unit;

use App\Support\Trailer;
use PHPUnit\Framework\TestCase;

/**
 * Tasks 9 — ტრეილერის შერჩევა TMDB-ის `/videos` პასუხიდან.
 */
class TrailerTest extends TestCase
{
    public function test_prefers_official_youtube_trailer(): void
    {
        $payload = ['results' => [
            ['site' => 'YouTube', 'type' => 'Teaser', 'official' => true, 'key' => 'teaser1'],
            ['site' => 'YouTube', 'type' => 'Trailer', 'official' => false, 'key' => 'fan1'],
            ['site' => 'YouTube', 'type' => 'Trailer', 'official' => true, 'key' => 'official1'],
            ['site' => 'Vimeo', 'type' => 'Trailer', 'official' => true, 'key' => 'vimeo1'],
        ]];

        $this->assertSame(
            'https://www.youtube.com/watch?v=official1',
            Trailer::pick($payload),
        );
    }

    public function test_falls_back_to_teaser_when_no_trailer(): void
    {
        $payload = ['results' => [
            ['site' => 'YouTube', 'type' => 'Featurette', 'key' => 'extra'],
            ['site' => 'YouTube', 'type' => 'Teaser', 'key' => 'teaser'],
        ]];

        $this->assertSame('https://www.youtube.com/watch?v=teaser', Trailer::pick($payload));
    }

    /** ka→en კასკადი: ცარიელი პირველი პასუხი მეორეს გზას უთმობს */
    public function test_cascades_to_the_next_payload(): void
    {
        $ka = ['results' => []];
        $en = ['results' => [['site' => 'YouTube', 'type' => 'Trailer', 'key' => 'en1']]];

        $this->assertSame('https://www.youtube.com/watch?v=en1', Trailer::pick($ka, $en));
    }

    public function test_ignores_unusable_entries(): void
    {
        $payload = ['results' => [
            ['site' => 'Vimeo', 'type' => 'Trailer', 'key' => 'v'],
            ['site' => 'YouTube', 'type' => 'Bloopers', 'key' => 'b'],
            ['site' => 'YouTube', 'type' => 'Trailer'],
        ]];

        $this->assertNull(Trailer::pick($payload));
        $this->assertNull(Trailer::pick(['results' => []]));
    }
}
