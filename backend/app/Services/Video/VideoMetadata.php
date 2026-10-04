<?php

namespace App\Services\Video;

use App\Services\Bookmarks\LinkMetadata;
use App\Services\Credentials\CredentialStore;
use App\Support\CredentialProviders;
use App\Support\Redact;
use App\Support\SourceLog;
use App\Support\VideoUrl;
use Illuminate\Support\Facades\Log;

/**
 * ვიდეოს მეტამონაცემის წამოღება ბმულიდან (Tasks K2).
 *
 * ყველაფერი, რაც **გასაღების გარეშე** მოდის, oEmbed-ით მოდის:
 *   · YouTube oEmbed  → სათაური, thumbnail, არხი (ხანგრძლივობა/ტეგები **არა**)
 *   · Vimeo oEmbed    → სათაური, thumbnail, აღწერა, **ხანგრძლივობა**
 *   · Dailymotion     → სათაური, thumbnail, **ხანგრძლივობა**
 *
 * მომხმარებელი YouTube-ის **საკუთარ** გასაღებს „მონაცემებში" რომ ჩაწერს (Tasks §30 —
 * `.env`-ის `YOUTUBE_API_KEY` აღარ იკითხება), YouTube-ზეც ჩაირთვება ხანგრძლივობა და
 * ტეგები (Data API v3) — კოდის შეცვლა არ სჭირდება.
 *
 * ⚠️ **Tasks §44.3 — YouTube სრულად.** Data API-დან ახლა თარიღიც მოდის (`publishedAt`)
 * და **საუკეთესო** ესკიზი (`maxres` → `standard` → `high`; oEmbed-ის `hqdefault`
 * 480×360-ია); **გასაღების გარეშე** — `yt-dlp -J` (სათაური, სრული აღწერა, თარიღი,
 * ესკიზი, ხანგრძლივობა, ტეგები, არხი). oEmbed-ს აღწერა და თარიღი არ აქვს, ამიტომ
 * ადრე გასაღების გარეშე მხოლოდ სათაური და არხი მოდიოდა.
 *
 * ⚠️ PHP cURL-ს Windows-ზე CA bundle არ აქვს → ყველა გამოძახება `verify`-ით მიდის
 * (იხ. CLAUDE.md gotcha).
 */
class VideoMetadata
{
    public function __construct(private readonly YtDlp $ytdlp) {}

    /**
     * @return array{
     *   platform: string, external_id: ?string, embed_url: ?string,
     *   title: ?string, description: ?string, duration: ?int, published_at: ?string,
     *   tags: array<int, string>, thumbnail_url: ?string, author: ?string, source: ?string
     * }
     */
    public function fetch(string $url): array
    {
        $parsed = VideoUrl::parse($url);

        $meta = [
            'platform' => $parsed['platform'],
            'external_id' => $parsed['external_id'],
            'embed_url' => $parsed['embed_url'],
            'title' => null,
            'description' => null,
            'duration' => null,
            // Tasks §44.3 — `Y-m-d` (Data API-ის `publishedAt`, yt-dlp-ის `upload_date`)
            'published_at' => null,
            'tags' => [],
            'thumbnail_url' => $parsed['thumbnail_url'],
            'author' => null,
            'source' => null,   // საიდან წამოვიდა: oembed | youtube_api | ytdlp | opengraph | null
        ];

        try {
            $meta = match ($parsed['platform']) {
                'youtube' => $this->youtube($url, $parsed['external_id'], $meta),
                'vimeo' => $this->oembed('https://vimeo.com/api/oembed.json?url='.urlencode($url), $meta),
                'dailymotion' => $this->oembed(
                    'https://www.dailymotion.com/services/oembed?format=json&url='.urlencode($url),
                    $meta,
                ),
                // Tasks §15.1 — `other` ბმულზე გვერდის Open Graph იკითხება; `file`-ზე წასაკითხი არაფერია
                default => $this->page($url, $meta),
            };
        } catch (\Throwable $e) {
            // მეტამონაცემი არასავალდებულოა — ბმული მაინც ინახება
            Log::warning('video metadata failed', ['url' => $url, 'error' => Redact::secrets($e->getMessage())]);
        }

        return $meta;
    }

    public function hasYoutubeKey(): bool
    {
        return (bool) CredentialStore::value(CredentialProviders::YOUTUBE);
    }

    /** Tasks §44.3 — გასაღების გარეშეც სრული ინფო მოდის? (`yt-dlp` დაყენებულია) */
    public function hasYtDlp(): bool
    {
        return $this->ytdlp->available();
    }

    /* ---------- პლატფორმები ---------- */

    /**
     * Tasks §15.1 — `other` პლატფორმა (არა YouTube/Vimeo/Dailymotion/ფაილი): სათაური,
     * აღწერა და ესკიზი გვერდის `<head>`-იდან (Open Graph) — აქამდე აქ არაფერი იყო
     * და ვიდეოს/სიმღერის ფორმა ასეთ ბმულზე ცარიელი რჩებოდა.
     */
    private function page(string $url, array $meta): array
    {
        if ($meta['platform'] !== 'other') {
            return $meta;
        }

        $page = app(LinkMetadata::class)->fetch($url);

        $meta['title'] = $page['title'] ?? $meta['title'];
        $meta['description'] = $page['description'] ?? $meta['description'];
        $meta['thumbnail_url'] = $page['image_url'] ?? $meta['thumbnail_url'];

        if ($page['title'] !== null || $page['image_url'] !== null) {
            $meta['source'] = 'opengraph';
        }

        return $meta;
    }

    private function youtube(string $url, ?string $id, array $meta): array
    {
        // 1) oEmbed — გასაღების გარეშე: სათაური + thumbnail + არხი
        $meta = $this->oembed(
            'https://www.youtube.com/oembed?format=json&url='.urlencode($url),
            $meta,
        );

        if (! $id) {
            return $meta;
        }

        // 2ბ) Tasks §44.3 — გასაღების გარეშე: `yt-dlp -J` (აღწერა, თარიღი, ესკიზი, ხანგრძლივობა, ტეგები)
        if (! $this->hasYoutubeKey()) {
            return $this->ytdlp($url, $meta);
        }

        // 2) Data API v3 — მხოლოდ გასაღებით: ხანგრძლივობა, ტეგები, სრული აღწერა, თარიღი, საუკეთესო ესკიზი

        /*
         * ⚠️ **გასაღები ჰედერშია და არა query-ში** (Tasks SEC-14). YouTube Data API
         * `X-goog-api-key`-ს იღებს (Gemini-ს იგივე წესი), query-ში ჩაწერილი
         * გასაღები კი URL-ის ნაწილია, ე.ი. cURL-ის შეცდომის ტექსტში, ექსეპტის
         * კვალში და პროქსის ლოგში ხვდებოდა.
         */
        $res = $this->http()
            ->withHeaders(['X-goog-api-key' => CredentialStore::value(CredentialProviders::YOUTUBE)])
            ->get('https://www.googleapis.com/youtube/v3/videos', [
                'id' => $id,
                'part' => 'snippet,contentDetails',
            ]);

        if (! $res->successful()) {
            Log::warning('youtube api failed', ['status' => $res->status(), 'id' => $id]);

            return $meta;
        }

        $item = $res->json('items.0');
        if (! $item) {
            return $meta;
        }

        $meta['title'] = $item['snippet']['title'] ?? $meta['title'];
        $meta['description'] = $item['snippet']['description'] ?? $meta['description'];
        $meta['author'] = $item['snippet']['channelTitle'] ?? $meta['author'];
        $meta['tags'] = array_slice($item['snippet']['tags'] ?? [], 0, 20);
        $meta['duration'] = $this->isoToSeconds($item['contentDetails']['duration'] ?? null);
        // „2009-10-25T06:57:33Z" → „2009-10-25"
        $published = (string) ($item['snippet']['publishedAt'] ?? '');
        $meta['published_at'] = preg_match('/^\d{4}-\d{2}-\d{2}/', $published) ? substr($published, 0, 10) : null;
        $meta['thumbnail_url'] = $this->bestThumbnail($item['snippet']['thumbnails'] ?? []) ?? $meta['thumbnail_url'];
        $meta['source'] = 'youtube_api';

        return $meta;
    }

    /**
     * Tasks §44.3 — `yt-dlp -J` გასაღების გარეშე; oEmbed-ის სათაური და არხი რჩება,
     * დანარჩენი ივსება. ⚠️ ჩავარდნა (ბინარი არაა, ქსელი) — oEmbed-ის შედეგი უცვლელად.
     */
    private function ytdlp(string $url, array $meta): array
    {
        $info = $this->ytdlp->info($url);
        if ($info === null) {
            return $meta;
        }

        $meta['title'] = $meta['title'] ?? $info['title'];
        $meta['description'] = $info['description'] ?? $meta['description'];
        $meta['author'] = $meta['author'] ?? $info['channel'];
        $meta['duration'] = $info['duration'] ?? $meta['duration'];
        $meta['tags'] = $info['tags'] ?: $meta['tags'];
        $meta['published_at'] = $info['published_at'];
        $meta['thumbnail_url'] = $info['thumbnail'] ?? $meta['thumbnail_url'];
        $meta['source'] = 'ytdlp';

        return $meta;
    }

    /** საუკეთესო ესკიზი: `maxres` → `standard` → `high` → `medium` → `default` */
    private function bestThumbnail(array $thumbnails): ?string
    {
        foreach (['maxres', 'standard', 'high', 'medium', 'default'] as $size) {
            $url = $thumbnails[$size]['url'] ?? null;
            if (is_string($url) && $url !== '') {
                return $url;
            }
        }

        return null;
    }

    /** სტანდარტული oEmbed პასუხის გადმოტანა */
    private function oembed(string $endpoint, array $meta): array
    {
        $res = $this->http()->get($endpoint);

        if (! $res->successful()) {
            SourceLog::status('oembed', $res->status(), '', ['endpoint' => $endpoint]);

            return $meta;
        }

        $data = $res->json();

        $meta['title'] = $data['title'] ?? $meta['title'];
        $meta['author'] = $data['author_name'] ?? $meta['author'];
        $meta['thumbnail_url'] = $data['thumbnail_url'] ?? $meta['thumbnail_url'];
        // Vimeo/Dailymotion აბრუნებენ `duration`-ს წამებში; YouTube — არა
        if (isset($data['duration']) && is_numeric($data['duration'])) {
            $meta['duration'] = (int) $data['duration'];
        }
        if (! empty($data['description'])) {
            $meta['description'] = $data['description'];
        }
        $meta['source'] = 'oembed';

        return $meta;
    }

    /* ---------- დამხმარეები ---------- */

    private function http()
    {
        return SourceLog::request(10)->acceptJson();
    }

    /** ISO-8601 ხანგრძლივობა („PT1H2M3S") → წამები */
    private function isoToSeconds(?string $iso): ?int
    {
        if (! $iso) {
            return null;
        }

        try {
            $i = new \DateInterval($iso);
        } catch (\Exception) {
            return null;
        }

        return ((($i->d * 24) + $i->h) * 60 + $i->i) * 60 + $i->s;
    }
}
