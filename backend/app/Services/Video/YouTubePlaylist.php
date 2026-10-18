<?php

namespace App\Services\Video;

use App\Services\Credentials\CredentialStore;
use App\Support\AppTime;
use App\Support\CredentialProviders;
use App\Support\SourceLog;
use Illuminate\Support\Facades\Cache;

/**
 * **YouTube-ის ფლეილისტი — სია და მისი ვიდეოები**.
 *
 * შენი სიტყვები: „YouTube-ის ფლეილისტი მაქვს დამატებული და მინდა, როგორმე ინფო
 * წამოიღო ქვე-ვიდეოების, ფლეილისტში რაც შედის". 15 კურსიდან 14 ფლეილისტი იყო და
 * მას არაფერი ამუშავებდა.
 *
 * წყარო რიგით: **YouTube Data API** (შენი გასაღებით — `playlists` → სათაური,
 * აღწერა, არხი, ესკიზი; `playlistItems` 50-ობით → ვიდეოები რიგით; `videos`
 * 50-ობით → ხანგრძლივობა) → გასაღების გარეშე ან API-ის ჩავარდნაზე **`yt-dlp
 * --flat-playlist`** (ერთი გაშვება, თითო ვიდეოს გახსნის გარეშე).
 *
 * ⚠️ **ქეში 24 სთ** (ფლეილისტის სიის id-ით — მონაცემი საჯაროა და ყველასთვის
 * ერთია); „განახლება" (`$fresh`) ქეშს გვერდს უვლის. ⚠️ ჩავარდნა არ ქეშირდება —
 * შემდეგი გახსნა თავიდან ცდის.
 *
 * ⚠️ **ვიდეოები ჩანაწერებად არ ინახება** და მონიშვნა/პროგრესი არ აქვთ: „გაკვეთილები"
 * დახურული გადაწყვეტილებაა (`CLAUDE.md`) — ეს მხოლოდ ჩვენებაა.
 *
 * ⚠️ დახურული/წაშლილი ვიდეო („Private video", „Deleted video") გამოტოვდება —
 * დაკვრა მაინც ვერ მოხერხდებოდა, რიცხვს კი გაზრდიდა.
 */
class YouTubePlaylist
{
    public const CACHE_HOURS = 24;

    /** ჭერი — 500 ვიდეო (API-ზე 10 გვერდი); გრძელი არხის „ყველა ვიდეო" სიას არ ვატრიალებთ ბოლომდე */
    public const MAX_ITEMS = 500;

    private const HIDDEN_TITLES = ['Private video', 'Deleted video', '[Private video]', '[Deleted video]'];

    public function __construct(private readonly YtDlp $ytdlp) {}

    /** რომელიმე გზა არსებობს? — გასაღები ან `yt-dlp` */
    public function available(): bool
    {
        return $this->key() !== null || $this->ytdlp->available();
    }

    /**
     * @return array{id: string, title: ?string, description: ?string, channel: ?string, thumbnail: ?string,
     *               count: int, total_duration: int, source: string, fetched_at: string,
     *               items: list<array{position: int, video_id: string, title: ?string, duration: ?int,
     *               thumbnail: string, url: string, embed_url: string, published_at: ?string}>}|null
     */
    public function fetch(string $playlistId, bool $fresh = false): ?array
    {
        $key = 'yt-playlist:v1:'.$playlistId;

        if (! $fresh && is_array($cached = Cache::get($key))) {
            return $cached;
        }

        $list = ($this->key() !== null ? $this->fromApi($playlistId) : null) ?? $this->fromYtDlp($playlistId);

        if ($list !== null) {
            Cache::put($key, $list, now()->addHours(self::CACHE_HOURS));
        }

        return $list;
    }

    private function key(): ?string
    {
        $key = CredentialStore::value(CredentialProviders::YOUTUBE);

        return is_string($key) && $key !== '' ? $key : null;
    }

    /* ---------- YouTube Data API v3 ---------- */

    private function fromApi(string $id): ?array
    {
        // ⚠️ გასაღები ჰედერშია და არა query-ში (`VideoMetadata`-ის წესი)
        $http = fn () => SourceLog::request(15)->acceptJson()->withHeaders(['X-goog-api-key' => (string) $this->key()]);

        $res = $http()->get('https://www.googleapis.com/youtube/v3/playlists', ['id' => $id, 'part' => 'snippet']);
        if (! $res->successful()) {
            return SourceLog::status('youtube', $res->status(), $res->body(), ['playlist' => $id]);
        }
        $snippet = $res->json('items.0.snippet');
        if (! is_array($snippet)) {
            return SourceLog::failed('youtube', 'playlist not found', ['playlist' => $id]);
        }

        $rows = [];
        $token = null;
        do {
            $page = $http()->get('https://www.googleapis.com/youtube/v3/playlistItems', array_filter([
                'playlistId' => $id,
                'part' => 'snippet,contentDetails',
                'maxResults' => 50,
                'pageToken' => $token,
            ]));
            if (! $page->successful()) {
                return SourceLog::status('youtube', $page->status(), $page->body(), ['playlist' => $id]);
            }
            foreach ((array) $page->json('items', []) as $item) {
                $videoId = $item['contentDetails']['videoId'] ?? null;
                $title = $item['snippet']['title'] ?? null;
                if (! is_string($videoId) || in_array($title, self::HIDDEN_TITLES, true)) {
                    continue;
                }
                $published = (string) ($item['contentDetails']['videoPublishedAt'] ?? '');
                $rows[] = [
                    'id' => $videoId,
                    'title' => is_string($title) ? $title : null,
                    'duration' => null,
                    'published_at' => preg_match('/^\d{4}-\d{2}-\d{2}/', $published) ? substr($published, 0, 10) : null,
                ];
            }
            $token = $page->json('nextPageToken');
        } while (is_string($token) && $token !== '' && count($rows) < self::MAX_ITEMS);

        // ხანგრძლივობა — `videos` 50-ობით (`playlistItems`-ს ის არ აქვს)
        foreach (array_chunk(array_slice($rows, 0, self::MAX_ITEMS), 50, true) as $chunk) {
            $res = $http()->get('https://www.googleapis.com/youtube/v3/videos', [
                'id' => implode(',', array_column($chunk, 'id')),
                'part' => 'contentDetails',
            ]);
            if (! $res->successful()) {
                // ხანგრძლივობის გარეშეც სია სრულია — მხოლოდ ჯამი აკლდება
                SourceLog::status('youtube', $res->status(), $res->body(), ['playlist' => $id]);

                continue;
            }
            $durations = [];
            foreach ((array) $res->json('items', []) as $video) {
                $durations[$video['id'] ?? ''] = $this->isoToSeconds($video['contentDetails']['duration'] ?? null);
            }
            foreach ($chunk as $i => $row) {
                $rows[$i]['duration'] = $durations[$row['id']] ?? null;
            }
        }

        return $this->shape($id, [
            'title' => $snippet['title'] ?? null,
            'description' => $snippet['description'] ?? null,
            'channel' => $snippet['channelTitle'] ?? null,
            'thumbnail' => $this->bestThumbnail((array) ($snippet['thumbnails'] ?? [])),
        ], $rows, 'youtube_api');
    }

    /* ---------- yt-dlp (გასაღების გარეშე) ---------- */

    private function fromYtDlp(string $id): ?array
    {
        $data = $this->ytdlp->playlist('https://www.youtube.com/playlist?list='.$id);
        if ($data === null) {
            return $this->ytdlp->available() ? SourceLog::failed('youtube', 'yt-dlp playlist failed', ['playlist' => $id]) : null;
        }

        $rows = [];
        foreach ($data['entries'] as $entry) {
            if (in_array($entry['title'], self::HIDDEN_TITLES, true)) {
                continue;
            }
            $rows[] = [...$entry, 'published_at' => null];
        }

        return $this->shape($id, $data, $rows, 'ytdlp');
    }

    /* ---------- საერთო ფორმა ---------- */

    /**
     * @param  array{title?: ?string, description?: ?string, channel?: ?string, thumbnail?: ?string}  $head
     * @param  list<array{id: string, title: ?string, duration: ?int, published_at: ?string}>  $rows
     */
    private function shape(string $id, array $head, array $rows, string $source): array
    {
        $items = [];
        foreach (array_slice($rows, 0, self::MAX_ITEMS) as $i => $row) {
            $items[] = [
                'position' => $i + 1,
                'video_id' => $row['id'],
                'title' => $row['title'],
                'duration' => $row['duration'],
                // ⚠️ ესკიზი id-იდანაა (16:9, 320×180) — ორივე წყაროზე ერთნაირი და ქსელის გარეშე
                'thumbnail' => "https://i.ytimg.com/vi/{$row['id']}/mqdefault.jpg",
                'url' => "https://www.youtube.com/watch?v={$row['id']}&list={$id}",
                // ⚠️ embed ჩვენ ვაწყობთ (`VideoUrl`-ის allowlist-ის ჰოსტი)
                'embed_url' => "https://www.youtube-nocookie.com/embed/{$row['id']}",
                'published_at' => $row['published_at'],
            ];
        }

        $text = fn (mixed $v) => is_string($v) && trim($v) !== '' ? trim($v) : null;

        return [
            'id' => $id,
            'title' => $text($head['title'] ?? null),
            'description' => $text($head['description'] ?? null),
            'channel' => $text($head['channel'] ?? null),
            'thumbnail' => $text($head['thumbnail'] ?? null) ?? ($items ? "https://i.ytimg.com/vi/{$items[0]['video_id']}/hqdefault.jpg" : null),
            'count' => count($items),
            'total_duration' => array_sum(array_map(fn (array $item) => (int) ($item['duration'] ?? 0), $items)),
            'source' => $source,
            'fetched_at' => AppTime::now()->toIso8601String(),
            'items' => $items,
        ];
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

    /** ISO-8601 ხანგრძლივობა („PT1H2M3S") → წამები */
    private function isoToSeconds(mixed $iso): ?int
    {
        if (! is_string($iso) || $iso === '') {
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
