<?php

namespace App\Services\Video;

use App\Support\VideoUrl;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * ვიდეოს მეტამონაცემის წამოღება ბმულიდან (Tasks K2).
 *
 * ყველაფერი, რაც **გასაღების გარეშე** მოდის, oEmbed-ით მოდის:
 *   · YouTube oEmbed  → სათაური, thumbnail, არხი (ხანგრძლივობა/ტეგები **არა**)
 *   · Vimeo oEmbed    → სათაური, thumbnail, აღწერა, **ხანგრძლივობა**
 *   · Dailymotion     → სათაური, thumbnail, **ხანგრძლივობა**
 *
 * `YOUTUBE_API_KEY`-ის დამატებისთანავე YouTube-ზეც ჩაირთვება ხანგრძლივობა და ტეგები
 * (Data API v3) — კოდის შეცვლა აღარ სჭირდება.
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
                default => $meta,
            };
        } catch (\Throwable $e) {
            // მეტამონაცემი არასავალდებულოა — ბმული მაინც ინახება
            Log::warning('video metadata failed', ['url' => $url, 'error' => $e->getMessage()]);
        }

        return $meta;
    }

    public function hasYoutubeKey(): bool
    {
        return (bool) config('services.youtube.key');
    }

    /* ---------- პლატფორმები ---------- */

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

        $res = $this->http()->get('https://www.googleapis.com/youtube/v3/videos', [
            'id' => $id,
            'part' => 'snippet,contentDetails',
            'key' => config('services.youtube.key'),
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
        return Http::timeout(10)
            ->withOptions(['verify' => storage_path('cacert.pem')])
            ->acceptJson();
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
