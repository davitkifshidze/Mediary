<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphToMany;

class CastMember extends Model
{
    protected $guarded = ['id'];

    protected $with = ['translations'];

    protected $casts = [
        'tmdb_person_id' => 'integer',
    ];

    /* ---------- relations ---------- */

    public function translations(): HasMany
    {
        return $this->hasMany(CastMemberTranslation::class);
    }

    public function movies(): MorphToMany
    {
        return $this->morphedByMany(Movie::class, 'castable')
            ->withPivot('character', 'billing_order');
    }

    public function series(): MorphToMany
    {
        return $this->morphedByMany(Series::class, 'castable')
            ->withPivot('character', 'billing_order');
    }

    /* ---------- translation accessor (name = canonical column) ---------- */

    public function getNameKaAttribute(): ?string
    {
        return $this->translations->firstWhere('locale', 'ka')?->name;
    }

    /** ლოკალიზებული სახელის ჩაწერა/განახლება (მაგ. ka ტრანსლიტერაცია). */
    public function setTranslation(string $locale, ?string $name): void
    {
        if ($name === null || $name === '') {
            return;
        }
        $this->translations()->updateOrCreate(['locale' => $locale], ['name' => $name]);
        $this->load('translations');
    }
}
