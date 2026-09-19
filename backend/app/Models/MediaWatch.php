<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * **ერთი ნახვა (FEAT-14).**
 *
 * ⚠️ **„ნანახია" რიგის არსებობაა** — `is_watched`-ის ტიპის დროშა აქ
 * მეორე წყარო იქნებოდა იმავე ფაქტისა (FEAT-09-ის `episode_watches`-ის
 * იგივე წესი).
 *
 * ⚠️ **`note` არჩევითია და განზრახ მოკლეა** — „ვის ვუყურე", „რომელ
 * კინოში": ეს ჟურნალია და არა ჩანიშვნა; გრძელი ტექსტისთვის მოდულს
 * საკუთარი `*_notes` აქვს.
 */
class MediaWatch extends Model
{
    use BelongsToUser;

    protected $guarded = ['id'];

    protected $casts = [
        'watched_at' => 'datetime',
    ];

    public function watchable(): MorphTo
    {
        return $this->morphTo();
    }
}
