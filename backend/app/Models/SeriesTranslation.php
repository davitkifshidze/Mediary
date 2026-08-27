<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SeriesTranslation extends Model
{
    protected $fillable = ['locale', 'title', 'description', 'source'];

    public function series(): BelongsTo
    {
        return $this->belongsTo(Series::class);
    }
}
