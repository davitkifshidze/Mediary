<?php

namespace App\Support;

/**
 * ვიდეოს ბმულის ამოცნობა (I5).
 *
 * ⚠️ უსაფრთხოება: **თვითნებური HTML/embed კოდი არასდროს ინახება**. ვიღებთ მხოლოდ URL-ს,
 * ვცნობთ პლატფორმას allowlist-ით და embed-ს ჩვენ ვაწყობთ. უცნობი წყარო embed-ის გარეშე
 * რჩება (მხოლოდ გარე ბმული) — ე.ი. iframe-ში მხოლოდ ნდობის სიაში მყოფი ჰოსტი ხვდება.
 */
class VideoUrl
{
    /** დაშვებული embed-ჰოსტები (iframe src) */
    public const EMBED_HOSTS = [
        'www.youtube-nocookie.com',
        'player.vimeo.com',
        'geo.dailymotion.com',
    ];

    /**
     * @return array{platform: string, external_id: ?string, embed_url: ?string, thumbnail_url: ?string}
     */
    public static function parse(string $url): array
    {
        $url = trim($url);
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $host = preg_replace('/^www\./', '', $host) ?: '';

        if ($id = self::youtubeId($url, $host)) {
            return [
                'platform' => 'youtube',
                'external_id' => $id,
                // nocookie დომენი — ნაკლები ტრეკინგი, იგივე ფუნქციონალი
                'embed_url' => "https://www.youtube-nocookie.com/embed/{$id}",
                'thumbnail_url' => "https://i.ytimg.com/vi/{$id}/hqdefault.jpg",
            ];
        }

        if ($host === 'vimeo.com' || $host === 'player.vimeo.com') {
            if (preg_match('~/(?:video/)?(\d+)~', (string) parse_url($url, PHP_URL_PATH), $m)) {
                return [
                    'platform' => 'vimeo',
                    'external_id' => $m[1],
                    'embed_url' => "https://player.vimeo.com/video/{$m[1]}",
                    'thumbnail_url' => null,
                ];
            }
        }

        if ($host === 'dailymotion.com' || $host === 'dai.ly') {
            $path = (string) parse_url($url, PHP_URL_PATH);
            if (preg_match('~(?:/video/|^/)([a-zA-Z0-9]+)~', $path, $m)) {
                return [
                    'platform' => 'dailymotion',
                    'external_id' => $m[1],
                    'embed_url' => "https://geo.dailymotion.com/player.html?video={$m[1]}",
                    'thumbnail_url' => "https://www.dailymotion.com/thumbnail/video/{$m[1]}",
                ];
            }
        }

        // პირდაპირი ფაილი — <video> ტეგით ჩაირთვება, iframe არ სჭირდება
        if (preg_match('~\.(mp4|webm|ogg|ogv|m4v)(\?|$)~i', $url)) {
            return ['platform' => 'file', 'external_id' => null, 'embed_url' => null, 'thumbnail_url' => null];
        }

        return ['platform' => 'other', 'external_id' => null, 'embed_url' => null, 'thumbnail_url' => null];
    }

    private static function youtubeId(string $url, string $host): ?string
    {
        if (! in_array($host, ['youtube.com', 'youtube-nocookie.com', 'youtu.be', 'm.youtube.com'], true)) {
            return null;
        }

        $path = (string) parse_url($url, PHP_URL_PATH);
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        $id = match (true) {
            $host === 'youtu.be' => ltrim($path, '/'),
            str_starts_with($path, '/embed/') => substr($path, 7),
            str_starts_with($path, '/shorts/') => substr($path, 8),
            str_starts_with($path, '/live/') => substr($path, 6),
            default => $query['v'] ?? null,
        };

        $id = is_string($id) ? trim($id, '/') : null;

        return $id && preg_match('/^[A-Za-z0-9_-]{6,20}$/', $id) ? $id : null;
    }
}
