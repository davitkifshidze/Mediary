<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** ვიდეოს ჩანიშვნა — თავისუფალი ტექსტი, საკუთარ ცხრილში (`video_notes`) */
class VideoNote extends Model
{
    use BelongsToUser;

    protected $guarded = ['id'];

    public function video(): BelongsTo
    {
        return $this->belongsTo(Video::class);
    }
}
