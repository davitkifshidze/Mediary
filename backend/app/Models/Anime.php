<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasGallery;
use App\Models\Concerns\HasStatus;
use App\Models\Concerns\HasTrash;
use App\Models\Concerns\HasWatchLog;
use App\Services\Storage\StorageMeter;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Support\Str;

/**
 * ანიმე — მესამე მედია-დომენი (Tasks §7.1).
 *
 * ⚠️ **სერიალის ასლია და არა მისი ქვეტიპი** (შენი მითითება: „ყველაფერი
 * თავისი ჰქონდეს"): საკუთარი ცხრილი, კონტროლერი, რესურსი და გამამდიდრებელი.
 * ერთი `type` სვეტი `series`-ზე ყოველ query-ს ჩუმ განშტოებას მოუტანდა.
 *
 * ⚠️ **ჟანრები/მსახიობები გლობალურია** (`genres`/`cast_members`, morph alias
 * `anime`) — ისინი ლექსიკონებია და მათი დუბლირება პიქერს ორად გაყოფდა.
 */
class Anime extends Model
{
    /** per-user მფლობელობა: global scope + user_id-ის ავტო-შევსება */
    use BelongsToUser;

    /** §6 ფაზა 4b — მორგებულ ველზე ატვირთული ფაილები (წაშლა → დისკი + კვოტა) */
    use HasCustomFields;

    /** §10 — გალერეის ფოტოები (`gallery_images`) */
    use HasGallery;

    /** Tasks §6.4 — სტატუსი per-user ლექსიკონია (`statuses`), enum-ი აღარაა */
    use HasStatus;

    /**
     * ⚠️ **კალათა (FEAT-11)** — `destroy()` `moveToTrash()`-ს იძახის და არა
     * `delete()`-ს; `trash` scope წაშლილს ყველა ჩვეულებრივ query-ს მალავს.
     */
    use HasTrash;

    /**
     * ⚠️ **ხელახლა ნახვის ჟურნალი (FEAT-14)** — `watched_at` „ბოლო ნახვაა"
     * და `media_watches`-იდან იწერება; გამეორება აღარ იკარგება.
     */
    use HasWatchLog;

    protected $guarded = ['id'];

    protected $with = ['translations', 'status'];

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
        // FEAT-10 — შემდეგი ეპიზოდის ეთერი (TMDB-ის `next_episode_to_air`)
        'next_air_at' => 'date',
        'next_season' => 'integer',
        'next_episode' => 'integer',
        'sort_order' => 'integer',
    ];

    /** morphs() FK-cascade-ს არ ქმნის — polymorphic pivot-ები ხელით უნდა მოიხსნას წაშლისას */
    protected static function booted(): void
    {
        static::deleting(function (Anime $anime) {
            $anime->genres()->detach();
            $anime->cast()->detach();
            $anime->deleteGalleryMedia();
            $anime->deletePoster();
        });
    }

    /**
     * **ხელით ატვირთული პოსტერის მოშორება** (§17.1) — იგივე წესი, რაც
     * `Movie::deletePoster()`-ს აქვს: მოდელშია, რომ `PurgeService`-ის
     * `$record->delete()`-მაც გაათავისუფლოს ადგილი, და **მხოლოდ `upload`**
     * იშლება (TMDB-ის პოსტერი საერთო ფაილია და კვოტაშიც არ ითვლება).
     */
    public function deletePoster(): void
    {
        if ($this->poster_path && $this->poster_source === 'upload') {
            app(StorageMeter::class)->deleteUpload($this->user_id, $this->poster_path);
        }
    }

    /* ---------- relations ---------- */

    public function translations(): HasMany
    {
        return $this->hasMany(AnimeTranslation::class);
    }

    public function genres(): MorphToMany
    {
        return $this->morphToMany(Genre::class, 'genreable');
    }

    public function cast(): MorphToMany
    {
        return $this->morphToMany(CastMember::class, 'castable')
            ->withPivot('character', 'billing_order', 'is_manual')
            ->orderByPivot('billing_order');
    }

    /* ---------- translation accessors (API-ს ფორმა movies-ის იდენტური) ---------- */

    private function tr(string $locale): ?AnimeTranslation
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

    /** თარგმანის ჩაწერა/განახლება — მხოლოდ გადმოცემული ველები */
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
        return Str::slug($this->title_en ?: $this->title_ka ?: '') ?: 'anime-'.$this->id;
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
