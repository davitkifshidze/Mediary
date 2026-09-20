<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasGallery;
use App\Models\Concerns\HasTrash;
use App\Models\Concerns\TracksCompletion;
use App\Services\Storage\StorageMeter;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * თამაში — მოდული `game` (Tasks §11; ველების სია დამტკიცდა 19.1-ში).
 *
 * ⚠️ **მრავალჟანრიანია** (pivot `game_genre_game`), განსხვავებით წიგნისა და
 * ბორდგეიმისგან, სადაც ერთი `genre_id`-ა — 11.1 „ჟანრებს" მრავლობითში წერს.
 * ლექსიკონი მაინც **per-user** არის (`game_genres`) და არა გლობალური
 * `genres`: RAWG-ის „Shooter"/„RPG" იქ ფილმის ჟანრების არჩევანში გამოჩნდებოდა.
 *
 * ⚠️ **`year` სვეტი არ არსებობს** — `release_date`-ის აქსესორია. ერთსა და
 * იმავე ფაქტს ორ სვეტში არ ვინახავთ.
 */
class Game extends Model
{
    use BelongsToUser, HasGallery;

    /** §6 ფაზა 4b — მორგებულ ველზე ატვირთული ფაილები (წაშლა → დისკი + კვოტა) */
    use HasCustomFields;

    /**
     * ⚠️ **კალათა (FEAT-11)** — `destroy()` `moveToTrash()`-ს იძახის და არა
     * `delete()`-ს; `trash` scope წაშლილს ყველა ჩვეულებრივ query-ს მალავს.
     */
    use HasTrash;

    /** FEAT-21 — „როდის გავიარე" თარიღი; `finished` სტატუსზე ივსება */
    use TracksCompletion;

    /** „ჩემი ქულის" შკალა — ერთი წყარო ვალიდაციისთვისაც და UI-სთვისაც */
    public const MAX_RATING = 10;

    /** გადასაწყვეტი · სათამაშო · ვთამაშობ · გავიარე · მივატოვე */
    public const STATUSES = ['undecided', 'to_play', 'playing', 'finished', 'abandoned'];

    /** 11.1-ის ჩამონათვალი; „ჩემი პლატფორმა" ერთია ამათგან */
    public const PLATFORMS = ['pc', 'ps5', 'ps4', 'xbox_series', 'xbox_one', 'switch', 'mobile'];

    /** 11.1 — სინგლი · მრავალმოთამაშიანი · კოოპი (ლოკალური/ონლაინ) · PvP */
    public const MODES = ['single', 'multiplayer', 'coop_local', 'coop_online', 'pvp'];

    /** მაღაზიები/საიტი — `links[].kind` */
    public const LINK_KINDS = ['official', 'steam', 'epic', 'gog', 'psn', 'xbox', 'other'];

    protected $guarded = ['id'];

    protected $casts = [
        'release_date' => 'date',
        'platforms' => 'array',
        'modes' => 'array',
        'links' => 'array',
        'languages' => 'array',
        'dlcs' => 'array',
        // ⚠️ წუთები და არა საათები (§2.5) — იგივე ერთეული, რაც `movies.runtime`-ს
        'hltb_main' => 'integer',
        'hltb_main_extra' => 'integer',
        'hltb_complete' => 'integer',
        'metacritic' => 'integer',
        'opencritic' => 'integer',
        'users_score' => 'float',
        'rating' => 'integer',
        'size_gb' => 'float',
        'rawg_id' => 'integer',
        'igdb_id' => 'integer',
        'is_favorite' => 'boolean',
        'sort_order' => 'integer',
        'finished_at' => 'date',
    ];

    /** FEAT-21 — თამაშის „გაკეთებული" `finished`-ია */
    public function completionColumn(): string
    {
        return 'finished_at';
    }

    public function completionDomain(): string
    {
        return 'game';
    }

    /**
     * ⚠️ `game_*` ცხრილები SQL-ის cascade-ით იშლება, მაგრამ cascade **მოდელის
     * ივენთს არ აგდებს** — ე.ი. ფაილი დისკზე და კვოტის მრიცხველი უცვლელი
     * დარჩებოდა. ამიტომ ფაილებს სათითაოდ ვშლით (იგივე წესი, რაც `Video`-ზე).
     */
    protected static function booted(): void
    {
        static::deleting(function (Game $game) {
            $game->deleteCover();
            /* ⚠️ **`withoutGlobalScope('owner')` სავალდებულოა** (Tasks BUG-21):
               `<module>_files` `BelongsToUser`-ს იყენებს, ე.ი. `files()`
               მიმდინარე **ავტორიზებულ** მომხმარებელზე იჭრება. `/admin/purge`
               და ანგარიშის წაშლა სხვის ბიბლიოთეკას შლის ადმინის სესიიდან —
               სია ცარიელი ბრუნდებოდა, ფაილები დისკზე რჩებოდა და კვოტაც არ
               თავისუფლდებოდა. `Video::booted()` ამას თავიდანვე სწორად აკეთებდა. */
            $game->files()->withoutGlobalScope('owner')->get()->each->delete();
            $game->deleteGalleryMedia();
        });
    }

    /* ---------- relations ---------- */

    /** per-user ჟანრის ლექსიკონი — **მრავალი** ჟანრი თითო თამაშზე */
    public function genres(): BelongsToMany
    {
        return $this->belongsToMany(GameGenre::class, 'game_genre_game', 'game_id', 'game_genre_id')
            ->orderBy('game_genres.sort_order')
            ->orderBy('game_genres.id');
    }

    /** 11.2 — walkthrough/თრეილერი/მიმოხილვა/გაიდი */
    public function videos(): HasMany
    {
        return $this->hasMany(GameVideo::class)->orderBy('sort_order')->orderBy('id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(GameFile::class)->orderBy('sort_order')->orderBy('id');
    }

    /** ატვირთული სქრინშოტები — იგივე ცხრილი, `kind = 'image'` */
    public function images(): HasMany
    {
        return $this->files()->where('kind', 'image');
    }

    public function notes(): HasMany
    {
        return $this->hasMany(GameNote::class)->orderByDesc('id');
    }

    /* ---------- helpers ---------- */

    /**
     * წელი — **მხოლოდ** `release_date`-იდან. სვეტად რომ გვქონოდა, ორი რიცხვი
     * დროთა განმავლობაში დაშორდებოდა (იგივე ხაფანგი, რასაც წიგნის პროგრესი
     * ებრძვის). `PurgeService`-ის რიგიც ამ აქსესორს კითხულობს.
     */
    public function getYearAttribute(): ?int
    {
        return $this->release_date?->year;
    }

    /**
     * ⚠️ **მხოლოდ ხელით ატვირთული ყდა იშლება.** RAWG-დან ჩამოტვირთულის სახელი
     * მისი `rawg_id`-ია, ე.ი. ერთი ფაილი რამდენიმე ანგარიშს ემსახურება — წაშლა
     * სხვისთვის სურათს გატეხავდა (TMDB პოსტერის, წიგნის ყდისა და BGG ფოტოს წესი).
     * ჩამოტვირთული კვოტაშიც არ ითვლება (19.4/B).
     */
    public function deleteCover(): void
    {
        if ($this->cover_path && $this->cover_source === 'upload') {
            app(StorageMeter::class)->deleteUpload($this->user_id, $this->cover_path);
        }
    }

    /** სათაური ფაილის სახელისთვის — ინგლისური ჯობია (ლათინური slug) */
    public function title(): string
    {
        return (string) ($this->title_en ?: $this->title_ka ?: '');
    }

    /**
     * პლატფორმები/რეჟიმები იმავე წესებით ნორმალიზდება, რაც ტეგები ვიდეოზე —
     * დუბლი და რეგისტრი ერთ ადგილას წყდება.
     *
     * @param  array<int, mixed>  $values
     * @return list<string>
     */
    public static function normalizeKeys(array $values, array $allowed): array
    {
        return array_values(array_intersect($allowed, array_unique(array_map(
            fn ($v) => strtolower(trim((string) $v)),
            $values,
        ))));
    }
}
