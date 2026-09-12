<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\StoredFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ვიდეოზე მიმაგრებული ფაილი — ფოტო (`image`) ან დოკუმენტი (`doc`).
 *
 * polymorphic აღარაა: `video_id` პირდაპირი FK-ია, ე.ი. ვიდეოს წაშლაზე
 * რიგები **ბაზის cascade-ით** ქრება. ფაილი დისკიდან და კვოტიდან მაინც
 * მოდელის ივენთით უნდა მოიხსნას (`StoredFile`), ამიტომ `Video::booted()`
 * მაინც სათითაოდ შლის — SQL-ის cascade ივენთს არ აგდებს.
 */
class VideoFile extends Model
{
    use BelongsToUser, StoredFile;

    protected $guarded = ['id'];

    protected $casts = [
        'size' => 'integer',
        'sort_order' => 'integer',
    ];

    public function video(): BelongsTo
    {
        return $this->belongsTo(Video::class);
    }
}
