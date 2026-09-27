<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** თამაშის ჩანიშვნა (Tasks §11.1) — საკუთარი ცხრილი `game_notes` */
class GameNote extends Model
{
    /**
     * ⚠️ **ურნა (Tasks §29, ეტაპი 2)** — `destroy()` `moveToTrash()`-ს იძახის;
     * რიგი ადგილზე რჩება და ურნიდან ბრუნდება.
     */
    use BelongsToUser, HasTrash;

    protected $guarded = ['id'];

    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class);
    }
}
