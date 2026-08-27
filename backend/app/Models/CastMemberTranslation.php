<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CastMemberTranslation extends Model
{
    protected $fillable = ['locale', 'name'];

    public function castMember(): BelongsTo
    {
        return $this->belongsTo(CastMember::class);
    }
}
