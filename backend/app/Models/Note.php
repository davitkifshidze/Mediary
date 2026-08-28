<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/** ჩანიშვნა (K3) — თავისუფალი ტექსტი ნებისმიერ ჩანაწერზე */
class Note extends Model
{
    use BelongsToUser;

    protected $guarded = ['id'];

    public function notable(): MorphTo
    {
        return $this->morphTo();
    }
}
