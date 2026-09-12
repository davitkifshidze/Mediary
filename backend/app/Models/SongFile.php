<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\StoredFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * სიმღერაზე მიმაგრებული ფაილი — ფოტო (`image`) ან დოკუმენტი (`doc`),
 * მაგალითად ტექსტი ან ნოტები (Tasks §7.4).
 *
 * ⚠️ `StoredFile` სავალდებულოა: ის შლის ფაილს დისკიდან და აბრუნებს
 * **ჩაწერილ ზომას** კვოტაში. SQL-ის cascade მოდელის ივენთს არ ისვრის,
 * ამიტომ `Song::booted()` მაინც სათითაოდ შლის (`Video`-ს პრეცედენტი).
 */
class SongFile extends Model
{
    use BelongsToUser, StoredFile;

    protected $guarded = ['id'];

    protected $casts = [
        'size' => 'integer',
        'sort_order' => 'integer',
    ];

    public function song(): BelongsTo
    {
        return $this->belongsTo(Song::class);
    }
}
