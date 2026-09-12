<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphToMany;

class Genre extends Model
{
    protected $guarded = ['id'];

    protected $with = ['translations'];

    protected $casts = [
        'tmdb_id' => 'integer',
    ];

    /* ---------- relations ---------- */

    public function translations(): HasMany
    {
        return $this->hasMany(GenreTranslation::class);
    }

    public function movies(): MorphToMany
    {
        return $this->morphedByMany(Movie::class, 'genreable');
    }

    public function series(): MorphToMany
    {
        return $this->morphedByMany(Series::class, 'genreable');
    }

    /** §7.1 — ჟანრი გლობალურია, ე.ი. ანიმესაც იმავე pivot-ით ეკიდება */
    public function animes(): MorphToMany
    {
        return $this->morphedByMany(Anime::class, 'genreable');
    }

    /* ---------- translation accessors ---------- */

    private function tr(string $locale): ?GenreTranslation
    {
        return $this->translations->firstWhere('locale', $locale);
    }

    public function getNameEnAttribute(): ?string
    {
        return $this->tr('en')?->name;
    }

    public function getNameKaAttribute(): ?string
    {
        return $this->tr('ka')?->name;
    }

    /** თარგმანის ჩაწერა/განახლება. */
    public function setTranslation(string $locale, ?string $name): void
    {
        if ($name === null || $name === '') {
            return;
        }
        $this->translations()->updateOrCreate(['locale' => $locale], ['name' => $name]);
        $this->load('translations');
    }
}
