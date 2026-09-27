<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** ვიდეოს ჩანიშვნა — თავისუფალი ტექსტი, საკუთარ ცხრილში (`video_notes`) */
class VideoNote extends Model
{
    /**
     * ⚠️ **ურნა (Tasks §29, ეტაპი 2)** — `destroy()` `moveToTrash()`-ს იძახის;
     * რიგი ადგილზე რჩება და ურნიდან ბრუნდება.
     */
    use BelongsToUser, HasTrash;

    protected $guarded = ['id'];

    public function video(): BelongsTo
    {
        return $this->belongsTo(Video::class);
    }
}
