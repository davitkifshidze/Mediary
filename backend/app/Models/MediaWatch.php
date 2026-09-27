<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
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
    /**
     * ⚠️ **ურნა (Tasks §29, ეტაპი 2)** — `destroy()` `moveToTrash()`-ს იძახის;
     * რიგი ადგილზე რჩება და ურნიდან ბრუნდება.
     */
    use BelongsToUser, HasTrash;

    protected $guarded = ['id'];

    protected $casts = [
        'watched_at' => 'datetime',
    ];

    public function watchable(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * ⚠️ **„ბოლო ნახვა" ურნასთან ერთად გადაითვლება** (Tasks §29.3) —
     * `syncWatchedAt()` ჟურნალს `trash` scope-ით კითხულობს, ე.ი. ურნაში
     * გადატანილი ნახვა თავისით ქრება, აღდგენილი კი ბრუნდება. უამისოდ
     * ჩანაწერი „ბოლოს ვნახე"-ს იმ დღეს იტყოდა, რომელიც ურნაშია.
     */
    protected function afterTrashChange(bool $trashed): void
    {
        $this->watchable()->first()?->syncWatchedAt();
    }
}
