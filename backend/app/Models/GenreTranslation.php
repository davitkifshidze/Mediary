<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GenreTranslation extends Model
{
    protected $fillable = ['locale', 'name'];

    public function genre(): BelongsTo
    {
        return $this->belongsTo(Genre::class);
    }
}
