<?php

namespace App\Services\Media;

use App\Support\SourceLog;
use App\Support\StorageFolder;
use App\Support\UserSettings;
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

        $res = SourceLog::request(20)->get("{$this->img}/{$size}{$tmdbPath}");

        /* ⚠️ **პოსტერის ჩამოუსვლელობა ჩუმი იყო** (აუდიტი §D): ჩანაწერი
           ისედაც იქმნება, ე.ი. „რატომ არ ჩამოვიდა სურათი" პასუხგაუცემელი
           რჩებოდა — არადა მიზეზი ხშირად ტრივიალურია (404 ან rate limit). */
        return $res->successful()
            ? $res->body()
            : SourceLog::status('tmdb', $res->status(), '', ['image' => $tmdbPath, 'size' => $size]);
    }

    private function download(?string $tmdbPath, string $size, string $dest): ?string
    {
        $body = $this->contents($tmdbPath, $size);

        if ($body === null) {
            return null;
        }

        Storage::disk(StorageFolder::diskFor($dest))->put($dest, $body);

        return $dest;
    }
}
