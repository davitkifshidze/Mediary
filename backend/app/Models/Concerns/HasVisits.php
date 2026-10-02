<?php

namespace App\Models\Concerns;

use App\Models\RecordVisit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * **ჩანაწერს შესვლების ჟურნალი აქვს** (Tasks §10).
 *
 * ⚠️ **ჟურნალი ჩანაწერთან ერთად ქრება** — პროექტის წესით წმენდა მოდელშია
 * (`deleting`), კონტროლერში არა. ურნაში გადატანა (`moveToTrash()`) `delete()`-ს
 * არ იძახებს, ე.ი. აღდგენილ ჩანაწერს ისტორია უჩანს; მხოლოდ საბოლოო წაშლა
 * შლის რიგებსაც.
 *
 * ⚠️ ყველა მოდელი, რომელიც `Visitable::TYPES`-შია, ამ trait-ს იყენებს —
 * `RecordVisitTest` ამას ამოწმებს.
 */
trait HasVisits
{
    protected static function bootHasVisits(): void
    {
        static::deleting(function (Model $model) {
            $model->visits()->delete();
        });
    }

    public function visits(): MorphMany
    {
        return $this->morphMany(RecordVisit::class, 'visitable');
    }
}
