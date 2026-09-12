<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** ბორდგეიმის ჩანიშვნა (Tasks §14) — საკუთარი ცხრილი `board_game_notes` */
class BoardGameNote extends Model
{
    use BelongsToUser;

    protected $guarded = ['id'];

    public function boardGame(): BelongsTo
    {
        return $this->belongsTo(BoardGame::class);
    }
}
