<?php

namespace Tests\Feature;

use App\Models\Video;
use App\Services\Import\MediarySchema;
use Tests\TestCase;

/**
 * **იმპორტის ბმული მხოლოდ `სქემა://…` ფორმით.**
 *
 * ⚠️ `-`-ით დაწყებული „ბმული" ვიდეოს ჩამოტვირთვისას yt-dlp-ს ოფციად გადაეცემოდა —
 * ფორმა მას `url` წესით არ უშვებს, იმპორტი კი უბრალო ტექსტად წერდა.
 */
class ImportLinkTest extends TestCase
{
    public function test_only_a_scheme_url_survives_the_import(): void
    {
        $video = new Video;
        $column = ['type' => 'varchar', 'length' => 255];

        $this->assertSame('https://youtu.be/abc', MediarySchema::coerce($video, 'url', $column, 'https://youtu.be/abc'));
        $this->assertSame('https://i.ytimg.com/x.jpg', MediarySchema::coerce($video, 'thumbnail_url', $column, 'https://i.ytimg.com/x.jpg'));

        foreach (['--exec calc', '-o /tmp/x', 'C:\\Windows\\win.ini', 'not a link', ''] as $bad) {
            $this->assertNull(MediarySchema::coerce($video, 'url', $column, $bad), $bad);
        }

        // ბმულის არასვეტი ჩვეულებრივ ტექსტად რჩება
        $this->assertSame('-- a title', MediarySchema::coerce($video, 'title', $column, '-- a title'));
    }
}
