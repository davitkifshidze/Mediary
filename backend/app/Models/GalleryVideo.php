<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Support\VideoUrl;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * გალერეის **ვიდეო-ბმული** (Tasks §8.1) — `gallery_images`-ის ტყუპი.
 *
 * ერთსა და იმავე მშობლებზე ჰკიდია (ფილმი · სერიალი · ანიმე · **მსახიობი** ·
 * სიმღერა · წიგნი · თამაში), ოღონდ ფაილს არ ინახავს: ვიდეო **ბმულია**,
 * თამბნეილი კი დაშორებული URL.
 *
 * ⚠️ **`applyUrl()` ერთადერთი ადგილია, სადაც `platform`/`external_id`/
 * `embed_url` იწერება** — `GameVideo`-ს ზუსტი წესი. ხელით ჩაწერილი
 * `embed_url` ნიშნავდა, რომ ვიღაც თვითნებურ iframe-ს გამოგვაგზავნიდა.
 *
 * ⚠️ **კვოტას არ ეხება** — `StoredFile` განზრახ არ აქვს: `path` სვეტი არ
 * არსებობს და დისკზე არაფერი წერია.
 */
class GalleryVideo extends Model
{
    use BelongsToUser;

    /** საიდან მოვიდა ბმული — ცხადი სია, რომ „წყაროს" ფილტრს აზრი ჰქონდეს */
    public const SOURCE_MANUAL = 'manual';

    protected $guarded = ['id'];

    protected $casts = [
        'duration' => 'integer',
        'sort_order' => 'integer',
        'published_at' => 'date',
    ];

    public function videoable(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * URL-იდან პლატფორმის ამოცნობა.
     *
     * ⚠️ **უცნობი ჰოსტი შეცდომა არ არის** — `platform = 'other'` და
     * `embed_url = null`, ე.ი. ბმული ინახება, უბრალოდ აპლიკაციაში არ დაიკვრება
     * (ვიდეოს მოდულის იგივე ქცევა). ეს მნიშვნელოვანია: ძებნა ხშირად
     * აბრუნებს გვერდს და არა თვითონ ფაილს — „სადაც ვიდეო დევს იმის ლინკი".
     */
    public function applyUrl(?string $url): void
    {
        $url = trim((string) $url);

        if ($url === '') {
            return;
        }

        $parsed = VideoUrl::parse($url);

        $this->url = $url;
        $this->platform = $parsed['platform'] ?: 'other';
        $this->external_id = $parsed['external_id'];
        $this->embed_url = $parsed['embed_url'];

        // ⚠️ ესკიზი ძებნისგან უპირატესია; მისი უქონლობისას პლატფორმის
        // ნაგულისხმევი (YouTube-ის `hqdefault`) მაინც გვაქვს
        if (! $this->thumbnail_url && $parsed['thumbnail_url']) {
            $this->thumbnail_url = $parsed['thumbnail_url'];
        }
    }
}
