<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** თამაშის ჩანიშვნა (Tasks §11.1) — საკუთარი ცხრილი `game_notes` */
class GameNote extends Model
{
    use BelongsToUser;

    protected $guarded = ['id'];

    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class);
    }
}
