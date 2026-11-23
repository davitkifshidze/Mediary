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

    /** ჟანრი გლობალურია, ე.ი. ანიმესაც იმავე pivot-ით ეკიდება */
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

    /**
     * **გადარქმევა** — ერთი ადგილი პირდაპირი ცვლილებისა და დამტკიცებული
     * მოთხოვნისთვის (`GenreController::update()`, `AdminRequestController`).
     *
     * `name_en` — მხოლოდ არაცარიელი იწერება (ინგლისური სახელი ყოველთვის არსებობს);
     * `name_ka` — გასაღები რომ მოვიდა და ცარიელია, ქართული თარგმანი იშლება.
     *
     * @param  array<string, mixed>  $names
     */
    public function rename(array $names): void
    {
        if (array_key_exists('name_en', $names) && $names['name_en'] !== null && $names['name_en'] !== '') {
            $this->setTranslation('en', (string) $names['name_en']);
        }

        if (array_key_exists('name_ka', $names)) {
            if ($names['name_ka']) {
                $this->setTranslation('ka', (string) $names['name_ka']);
            } else {
                $this->translations()->where('locale', 'ka')->delete();
                $this->load('translations');
            }
        }
    }
}
