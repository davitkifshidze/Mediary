<?php

namespace App\Services\Links;

use App\Services\Bookmarks\LinkMetadata;
use App\Services\Video\VideoMetadata;
use App\Support\VideoUrl;
use Illuminate\Support\Facades\Cache;

/**
 * **ბმულის მეტა-მონაცემი — ერთი კარი ყველა ფორმისთვის** (Tasks §15.1).
 *
 * შენი სიტყვები: „სადაც ვიდეო ან რამე ბმული ისმება, მეტა-ტეგებით შეეძლოს
 * წამოიღოს ფოტო, სათაური და ასე შემდეგ და ჩასვას შესაბამის ადგილას, ან
 * შემოგთავაზოს მაინც". აქამდე ორი მექანიზმი არათანაბრად იყო მიერთებული:
 * `VideoMetadata` (oEmbed — ვიდეო, სიმღერა) და `LinkMetadata` (Open Graph —
 * ბუკმარკი, კურსი, პირადი მოდული). ეს კლასი ორივეს ერთ პასუხად აბრუნებს:
 * ჯერ `VideoUrl::parse` — YouTube/Vimeo/Dailymotion oEmbed-ით (სათაური, არხი,
 * ესკიზი, ხანგრძლივობა), სხვა შემთხვევაში გვერდის `<head>` (სათაური, აღწერა,
 * სურათი, favicon). ვიდეოზე oEmbed-ის ჩავარდნისას გვერდის OG მაინც იკითხება.
 *
 * ⚠️ **ქეში 24 საათი** — ფორმაში ბმულის ხელახალი blur/paste იმავე გვერდს
 * მეორედ არ ჩამოტვირთავს; გასაღები URL-ის ჰეშია.
 * ⚠️ **ჩავარდნა ცარიელი 200-ია** — არსებული წესი (`LinkMetadata`): გვერდი
 * შეიძლება დახურული იყოს, ხელით შევსება მაინც რჩება.
 * ⚠️ **HTML არასდროს გამოდის** — მხოლოდ ტექსტური ველები და მისამართები.
 */
class LinkResolver
{
    public const CACHE_MINUTES = 24 * 60;

    public const VIDEO_PLATFORMS = ['youtube', 'vimeo', 'dailymotion'];

    public function __construct(
        private readonly VideoMetadata $videos,
        private readonly LinkMetadata $pages,
    ) {}

    /**
     * @return array{kind: string, url: string, platform: string, external_id: ?string, embed_url: ?string,
     *               title: ?string, description: ?string, image_url: ?string, favicon_url: ?string,
     *               site_name: ?string, domain: ?string, author: ?string, duration: ?int}
     */
    public function resolve(string $url): array
    {
        $url = trim($url);

        return Cache::remember('link-meta:'.sha1($url), now()->addMinutes(self::CACHE_MINUTES), fn () => $this->lookup($url));
    }

    private function lookup(string $url): array
    {
        $parsed = VideoUrl::parse($url);
        $isVideo = in_array($parsed['platform'], self::VIDEO_PLATFORMS, true);

        $out = [
            'kind' => $isVideo ? 'video' : 'page',
            'url' => $url,
            'platform' => $parsed['platform'],
            'external_id' => $parsed['external_id'],
            'embed_url' => $parsed['embed_url'],
            'title' => null,
            'description' => null,
            'image_url' => $parsed['thumbnail_url'],
            'favicon_url' => null,
            'site_name' => null,
            'domain' => $this->domain($url),
            'author' => null,
            'duration' => null,
        ];

        if ($isVideo) {
            $meta = $this->videos->fetch($url);
            $out['title'] = $meta['title'];
            $out['description'] = $meta['description'];
            $out['image_url'] = $meta['thumbnail_url'] ?? $out['image_url'];
            $out['author'] = $meta['author'];
            $out['duration'] = $meta['duration'];

            // oEmbed-მა უპასუხა — გვერდის წაკითხვა აღარ სჭირდება
            if ($out['title'] !== null) {
                return $out;
            }
        }

        // პირდაპირი ფაილი (`.mp4`) — წასაკითხი `<head>` არ აქვს
        if ($parsed['platform'] === 'file') {
            return $out;
        }

        $page = $this->pages->fetch($url);

        return [
            ...$out,
            'title' => $out['title'] ?? $page['title'],
            'description' => $out['description'] ?? $page['description'],
            'image_url' => $out['image_url'] ?? $page['image_url'],
            'favicon_url' => $page['favicon_url'],
            'site_name' => $page['site_name'],
            'domain' => $page['domain'] ?? $out['domain'],
        ];
    }

    private function domain(string $url): ?string
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        return $host !== '' ? (preg_replace('/^www\./', '', $host) ?: $host) : null;
    }
}
