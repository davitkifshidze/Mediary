<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **პირადი მოდულის ჩანაწერის ჩანიშვნა (Tasks §37.5)** — თამაშის/ვიდეოს
 * ჩანიშვნის ფორმა (`body`), ერთი ცხრილი ყველა პირად მოდულზე.
 *
 * ⚠️ **ურნა (Tasks §29, ეტაპი 2)** — `destroy()` `moveToTrash()`-ს იძახის.
 */
class CustomRecordNote extends Model
{
    use BelongsToUser, HasTrash;

    protected $guarded = ['id'];

    public function record(): BelongsTo
    {
        return $this->belongsTo(CustomRecord::class, 'custom_record_id');
    }

    /** აუდიტის მოდული — რიგისაა */
    public function auditModule(): string
    {
        return (string) $this->module;
    }
}
