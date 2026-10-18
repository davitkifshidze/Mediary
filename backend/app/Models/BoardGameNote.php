<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** ბორდგეიმის ჩანიშვნა — საკუთარი ცხრილი `board_game_notes` */
class BoardGameNote extends Model
{
    /**
     * ⚠️ **ურნა** — `destroy()` `moveToTrash()`-ს იძახის;
     * რიგი ადგილზე რჩება და ურნიდან ბრუნდება.
     */
    use BelongsToUser, HasTrash;

    protected $guarded = ['id'];

    public function boardGame(): BelongsTo
    {
        return $this->belongsTo(BoardGame::class);
    }
}
