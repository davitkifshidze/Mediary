<?php

namespace App\Services\Enrichment;

use App\Models\Series;

/**
 * სერიალების გამამდიდრებელი.
 *
 * ⚠️ **მთელი ლოგიკა `TvEnricher`-შია** (§7.1): TMDB-ის `/tv/*`-ზე ორი დომენი
 * ზის — `series` და `anime` — და მათი საუბარი წყაროსთან იდენტურია. აქ მხოლოდ
 * ის რჩება, რაც მართლა სერიალისაა: morph alias (პოსტერის საქაღალდე) და
 * დომენური სახელით მეთოდები, რომ არსებული გამომძახებლები არ შეიცვალოს.
 */
class SeriesEnricher extends TvEnricher
{
    protected function morphAlias(): string
    {
        return 'series';
    }

    public function enrichSeries(Series $series): bool
    {
        return $this->enrich($series);
    }

    /**
     * მხოლოდ მედია — პოსტერი + მსახიობთა ფოტოები TMDB-დან ხელახლა ჩამოტვირთვა.
     * გამოიყენება „მედიის ხელახლა ჩამოტვირთვის" ღილაკიდან.
     */
    public function redownloadMedia(Series $series): bool
    {
        return $this->redownload($series);
    }
}
