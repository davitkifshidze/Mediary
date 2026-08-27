<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Support\Str;

class Series extends Model
{
    protected $table = 'series';

    protected $guarded = ['id'];

    protected $with = ['translations'];

    protected $casts = [
        'year' => 'integer',
        'tmdb_id' => 'integer',
        'ge_id' => 'integer',
        'rating' => 'decimal:1',
        'runtime' => 'integer',
        'seasons' => 'integer',
        'episodes' => 'integer',
        'is_favorite' => 'boolean',
        'watched_at' => 'datetime',
        'sort_order' => 'integer',
    ];

    /** morphs() FK-cascade-ს არ ქმნის — polymorphic pivot-ები ხელით უნდა მოიხსნას წაშლისას */
    protected static function booted(): void
    {
        static::deleting(function (Series $series) {
            $series->genres()->detach();
            $series->cast()->detach();
        });
    }

    /* ---------- relations ---------- */

    public function translations(): HasMany
    {
        return $this->hasMany(SeriesTranslation::class);
    }

    public function genres(): MorphToMany
    {
        return $this->morphToMany(Genre::class, 'genreable');
    }

    public function cast(): MorphToMany
    {
        return $this->morphToMany(CastMember::class, 'castable')
            ->withPivot('character', 'billing_order')
            ->orderByPivot('billing_order');
    }

    /* ---------- translation accessors (API-ს ფორმა movies-ის იდენტური) ---------- */

    private function tr(string $locale): ?SeriesTranslation
    {
        return $this->translations->firstWhere('locale', $locale);
    }

    public function getTitleKaAttribute(): ?string
    {
        return $this->tr('ka')?->title;
    }

    public function getTitleEnAttribute(): ?string
    {
        return $this->tr('en')?->title;
    }

    public function getDescriptionKaAttribute(): ?string
    {
        return $this->tr('ka')?->description;
    }

    public function getDescriptionEnAttribute(): ?string
    {
        return $this->tr('en')?->description;
    }

    public function getDescriptionKaSourceAttribute(): ?string
    {
        return $this->tr('ka')?->source;
    }

    public function getDescriptionEnSourceAttribute(): ?string
    {
        return $this->tr('en')?->source;
    }

    /** თარგმანის ჩაწერა/განახლება — მხოლოდ გადმოცემული ველები. */
    public function setTranslation(string $locale, array $attrs): void
    {
        $attrs = array_filter($attrs, fn ($v) => $v !== null);
        if (! $attrs) {
            return;
        }
        $this->translations()->updateOrCreate(['locale' => $locale], $attrs);
        $this->load('translations');
    }

    /* ---------- helpers ---------- */

    /** ფაილის სახელისთვის უსაფრთხო slug */
    public function slugForFile(): string
    {
        return Str::slug($this->title_en ?: $this->title_ka ?: '') ?: 'series-'.$this->id;
    }

    /** რომელი ველები აკლია (ბარათის გამაფრთხილებელი ნიშნისთვის) */
    public function missingFields(): array
    {
        $missing = [];
        $noGenres = $this->relationLoaded('genres') ? $this->genres->isEmpty() : ! $this->genres()->exists();
        if ($noGenres) {
            $missing[] = 'genre';
        }
        if (! $this->year) {
            $missing[] = 'year';
        }
        if (! $this->poster_path) {
            $missing[] = 'poster';
        }
        if (! $this->description_ka && ! $this->description_en) {
            $missing[] = 'description';
        }
        if (! $this->imdb_id) {
            $missing[] = 'imdb';
        }
        if (! $this->ge_url) {
            $missing[] = 'watch';
        }

        return $missing;
    }
}
