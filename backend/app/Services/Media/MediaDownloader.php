<?php

namespace App\Services\Media;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

class MediaDownloader
{
    private string $img = 'https://image.tmdb.org/t/p';

    /** პოსტერი → posters/<slug>.jpg (ლოკალური გზა ან null) */
    public function poster(?string $tmdbPath, string $slug): ?string
    {
        return $this->download($tmdbPath, 'w500', "posters/{$slug}.jpg");
    }

    /** მსახიობის ფოტო → actors/<personId>.jpg */
    public function profile(?string $tmdbPath, int $personId): ?string
    {
        return $this->download($tmdbPath, 'w185', "actors/{$personId}.jpg");
    }

    private function download(?string $tmdbPath, string $size, string $dest): ?string
    {
        if (! $tmdbPath) {
            return null;
        }

        $res = Http::timeout(20)
            ->withOptions(['verify' => storage_path('cacert.pem')])
            ->get("{$this->img}/{$size}{$tmdbPath}");
        if (! $res->successful()) {
            return null;
        }

        Storage::disk('public')->put($dest, $res->body());

        return $dest;
    }
}
