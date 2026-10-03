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
 * ⚠️ PHP cURL-ს Windows-ზე CA bundle არ აქვს → ყველა გამოძახება `verify`-ით მიდის
 * (იხ. CLAUDE.md gotcha).
 */
class VideoMetadata
{
    /**
     * @return array{
     *   platform: string, external_id: ?string, embed_url: ?string,
     *   title: ?string, description: ?string, duration: ?int,
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
            'tags' => [],
            'thumbnail_url' => $parsed['thumbnail_url'],
            'author' => null,
            'source' => null,   // საიდან წამოვიდა: oembed | youtube_api | null
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

        // 2) Data API v3 — მხოლოდ გასაღებით: ხანგრძლივობა, ტეგები, სრული აღწერა
        if (! $id || ! $this->hasYoutubeKey()) {
            return $meta;
        }

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
        $meta['source'] = 'youtube_api';

        return $meta;
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
