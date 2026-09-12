<?php

namespace App\Services\Enrichment;

use App\Models\Anime;

/**
 * ანიმეების გამამდიდრებელი (Tasks §7.1).
 *
 * ⚠️ **წყარო TMDB-ია** (გადაწყვეტილება 2026-09-07): ანიმე იქ ჩვეულებრივი `tv`
 * ჩანაწერია, ე.ი. ქართული ტექსტი, პოსტერი, ტრეილერი და გალერეა უცვლელად
 * მუშაობს — ცალკე წყარო (AniList/MAL) მეორე კლიენტს, მეორე ლექსიკონსა და
 * მეორე თარგმანის გზას მოითხოვდა.
 *
 * ⚠️ **განსხვავება სერიალისგან ერთია — morph alias**: პოსტერი `anime/posters`-ში
 * ჯდება, თორემ ერთნაირი slug-ის ორი ჩანაწერი ერთმანეთს გადააწერდა.
 */
class AnimeEnricher extends TvEnricher
{
    protected function morphAlias(): string
    {
        return 'anime';
    }

    public function enrichAnime(Anime $anime): bool
    {
        return $this->enrich($anime);
    }

    public function redownloadMedia(Anime $anime): bool
    {
        return $this->redownload($anime);
    }
}
