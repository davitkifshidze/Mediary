<?php

namespace App\Models\Concerns;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

/**
 * per-user მფლობელობა (I1, ვარიანტი A).
 *
 * ერთი global scope უზრუნველყოფს, რომ ყველა არსებული query — სია, ფილტრები,
 * `withCount`, route-model-binding, ფრანჩაიზის ანოტაცია — ავტომატურად შემოიფარგლოს
 * ავტორიზებული user-ით. მისაბმელი ველი ჩაწერისას თავისით ივსება.
 *
 * ⚠️ CLI-ზე (artisan) `Auth::id()` ცარიელია → scope გამორთულია და ბრძანება ყველა
 * მომხმარებლის ჩანაწერს ხედავს. იხ. `media:redownload --user=`.
 */
trait BelongsToUser
{
    protected static function bootBelongsToUser(): void
    {
        static::addGlobalScope('owner', function (Builder $q) {
            if ($id = Auth::id()) {
                $q->where($q->getModel()->getTable().'.user_id', $id);
            }
        });

        static::creating(function ($model) {
            if (! $model->user_id && ($id = Auth::id())) {
                $model->user_id = $id;
            }
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
