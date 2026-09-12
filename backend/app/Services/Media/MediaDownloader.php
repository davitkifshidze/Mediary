<?php

namespace App\Services\Media;

use App\Support\StorageFolder;
use App\Support\UserSettings;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

class MediaDownloader
{
    private string $img = 'https://image.tmdb.org/t/p';

    /**
     * პოსტერი → `movies/posters/<slug>.jpg` ან `series/posters/<slug>.jpg`
     * (ლოკალური გზა ან null). ⚠️ `$morphAlias` აუცილებელია: ერთ ბრტყელ
     * `posters/`-ში ერთი და იმავე სახელის ფილმი და სერიალი ერთმანეთს ჭამდა.
     *
     * ხარისხი მომხმარებლის პარამეტრიდან მოდის (Tasks 18); CLI-ზე — ნაგულისხმევი.
     */
    public function poster(?string $tmdbPath, string $slug, string $morphAlias = 'movie'): ?string
    {
        return $this->download(
            $tmdbPath,
            UserSettings::posterQuality(),
            StorageFolder::posters($morphAlias)."/{$slug}.jpg",
        );
    }

    /** მსახიობის ფოტო → cast/photos/<personId>.jpg */
    public function profile(?string $tmdbPath, int $personId): ?string
    {
        return $this->download($tmdbPath, 'w185', StorageFolder::CAST_PHOTOS."/{$personId}.jpg");
    }

    /**
     * ნედლი ბაიტები, დისკზე ჩაწერის გარეშე (Tasks 10) — გალერეა თვითონ
     * წყვეტს, სად და რა სახელით ჩაწეროს, რადგან ჩაწერა კვოტის მრიცხველზე
     * უნდა გავიდეს (`StorageMeter::storeContents()`).
     */
    public function contents(?string $tmdbPath, string $size): ?string
    {
        if (! $tmdbPath) {
            return null;
        }

        $res = Http::timeout(20)
            ->withOptions(['verify' => storage_path('cacert.pem')])
            ->get("{$this->img}/{$size}{$tmdbPath}");

        return $res->successful() ? $res->body() : null;
    }

    private function download(?string $tmdbPath, string $size, string $dest): ?string
    {
        $body = $this->contents($tmdbPath, $size);

        if ($body === null) {
            return null;
        }

        Storage::disk('public')->put($dest, $body);

        return $dest;
    }
}
