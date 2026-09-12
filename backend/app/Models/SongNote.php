<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** სიმღერის ჩანიშვნა — თავისუფალი ტექსტი, საკუთარ ცხრილში (Tasks §7.4) */
class SongNote extends Model
{
    use BelongsToUser;

    protected $guarded = ['id'];

    public function song(): BelongsTo
    {
        return $this->belongsTo(Song::class);
    }
}
