<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AnimeTranslation extends Model
{
    protected $fillable = ['locale', 'title', 'description', 'source'];

    public function anime(): BelongsTo
    {
        return $this->belongsTo(Anime::class);
    }
}
