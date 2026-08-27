<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Support\Str;

class Movie extends Model
{
    protected $guarded = ['id'];

    protected $with = ['translations'];

    protected $casts = [
        'year' => 'integer',
        'tmdb_id' => 'integer',
        'tmdb_collection_id' => 'integer',
        'ge_id' => 'integer',
        'rating' => 'decimal:1',
        'runtime' => 'integer',
        'is_favorite' => 'boolean',
        'watched_at' => 'datetime',
        'sort_order' => 'integer',
    ];

    /**
     * „გააგრძელე ფრანჩაიზი“ badge — ერთ query-ში მონიშვნა (N+1-ის გარეშე).
     * true, თუ ნაწილი ჯერ არ დაწყებულა (undecided/to_watch), მაგრამ ფრანჩაიზის
     * სხვა ნაწილი უკვე watching/watched-ია.
     */
    public static function annotateFranchise(iterable $movies): void
    {
        $colIds = collect($movies)->pluck('tmdb_collection_id')->filter()->unique();
        $active = $colIds->isEmpty()
            ? collect()
            : static::whereIn('tmdb_collection_id', $colIds)
                ->whereIn('status', ['watching', 'watched'])
                ->pluck('tmdb_collection_id')
                ->unique()
                ->flip();

        foreach ($movies as $m) {
            $m->franchise_next = $m->tmdb_collection_id
                && isset($active[$m->tmdb_collection_id])
                && in_array($m->status, ['undecided', 'to_watch'], true);
        }
    }

    /** morphs() FK-cascade-ს არ ქმნის — polymorphic pivot-ები ხელით უნდა მოიხსნას წაშლისას */
    protected static function booted(): void
    {
        static::deleting(function (Movie $movie) {
            $movie->genres()->detach();
            $movie->cast()->detach();
        });
    }

    /* ---------- relations ---------- */

    public function translations(): HasMany
    {
        return $this->hasMany(MovieTranslation::class);
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

    /* ---------- translation accessors (API-ს ფორმა უცვლელი) ---------- */

    private function tr(string $locale): ?MovieTranslation
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
        return Str::slug($this->title_en ?: $this->title_ka ?: '') ?: 'movie-'.$this->id;
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
