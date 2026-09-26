<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasGallery;
use App\Models\Concerns\HasStatus;
use App\Models\Concerns\HasTrash;
use App\Models\Concerns\HasWatchLog;
use App\Services\Storage\StorageMeter;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Support\Str;

class Movie extends Model
{
    /** per-user მფლობელობა: global scope + user_id-ის ავტო-შევსება (I1) */
    use BelongsToUser;

    /** §6 ფაზა 4b — მორგებულ ველზე ატვირთული ფაილები (წაშლა → დისკი + კვოტა) */
    use HasCustomFields;

    /** Tasks 10 — გალერეის ფოტოები (`gallery_images`) */
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
     * true, თუ ნაწილი ჯერ არ დაწყებულა, მაგრამ ფრანჩაიზის სხვა ნაწილი უკვე
     * მიმდინარეობს ან დასრულებულია.
     *
     * ⚠️ **კრიტერიუმი `role`-ია და არა სახელი** (§6.4): სტატუსები ახლა
     * per-user ლექსიკონია, ე.ი. `'watched'` აქ ჩაწერილი მხოლოდ იმ ანგარიშზე
     * იმუშავებდა, რომელსაც ნაგულისხმევი ნაკრები არ შეუცვლია — დანარჩენებზე
     * ბეჯი **ჩუმად ჩაქრებოდა**.
     */
    public static function annotateFranchise(iterable $movies): void
    {
        // სტატუსის კავშირი ერთხელ იტვირთოს — `status_role` თითოზე query იქნებოდა
        $rows = EloquentCollection::make($movies)->loadMissing('status');

        $colIds = $rows->pluck('tmdb_collection_id')->filter()->unique();
        $active = $colIds->isEmpty()
            ? collect()
            : static::whereIn('tmdb_collection_id', $colIds)
                ->statusRole(['doing', 'done'])
                ->pluck('tmdb_collection_id')
                ->unique()
                ->flip();

        foreach ($rows as $m) {
            $m->franchise_next = $m->tmdb_collection_id
                && isset($active[$m->tmdb_collection_id])
                // სტატუსის გარეშე ჩანაწერიც „ჯერ არ დაწყებულია“
                && in_array($m->status_role, ['todo', null], true);
        }
    }

    /** morphs() FK-cascade-ს არ ქმნის — polymorphic pivot-ები ხელით უნდა მოიხსნას წაშლისას */
    protected static function booted(): void
    {
        static::deleting(function (Movie $movie) {
            $movie->genres()->detach();
            $movie->cast()->detach();
            // Tasks 10 — გალერეის ფოტოებიც (ფაილიც და კვოტაც `GalleryImage`-ზეა)
            $movie->deleteGalleryMedia();
            $movie->deletePoster();
        });
    }

    /**
     * **ხელით ატვირთული პოსტერის მოშორება** (17.1).
     *
     * ⚠️ **მოდელშია და არა კონტროლერში.** `DELETE /api/movies/{id}` მას ისედაც
     * იძახებდა, მაგრამ ჩანაწერს კონტროლერის გარეშეც შლიან — `PurgeService`
     * (Tasks 20) პირდაპირ `$record->delete()`-ს აკეთებს **სწორედ იმიტომ, რომ
     * ივენთები გაისროლოს**. ე.ი. აქამდე მასობრივი წაშლა პოსტერს დისკზე ტოვებდა
     * და კვოტას არ ათავისუფლებდა, თანაც `plan()` იმ ბაიტებს „გათავისუფლებულში"
     * ითვლიდა — ციფრი ცრუობდა. წიგნი/თამაში/ბორდგეიმი თავიდანვე ასე იქცეოდა.
     *
     * ⚠️ **მხოლოდ `upload`.** TMDB-ის პოსტერი საერთო ფაილია (იმავე slug-ით სხვა
     * ანგარიშსაც აქვს) და 19.4/B-ით კვოტაშიც არ ითვლება — მისი წაშლა სხვისთვის
     * სურათს გატეხავდა.
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
        return $this->hasMany(MovieTranslation::class);
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
