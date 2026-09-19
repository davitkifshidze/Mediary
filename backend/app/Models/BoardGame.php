<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasTrash;
use App\Services\Storage\StorageMeter;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * ბორდგეიმი — მოდული `board_game` (Tasks §14).
 *
 * ⚠️ **გალერეა `board_game_files`-შია** (`kind = 'image'`) და არა
 * `gallery_images`-ში. ეს არსებული წესია და არა გამონაკლისი: `gallery_images`
 * TMDB-დან **ჩამოტვირთულ** ფოტოებს ინახავს, user-ის **ატვირთული** ფოტოები კი
 * სექციის ცხრილშია — ზუსტად ისე, როგორც ვიდეოზე (`video_files.kind = 'image'`).
 */
class BoardGame extends Model
{
    use BelongsToUser;

    /** §6 ფაზა 4b — მორგებულ ველზე ატვირთული ფაილები (წაშლა → დისკი + კვოტა) */
    use HasCustomFields;

    /**
     * ⚠️ **კალათა (FEAT-11)** — `destroy()` `moveToTrash()`-ს იძახის და არა
     * `delete()`-ს; `trash` scope წაშლილს ყველა ჩვეულებრივ query-ს მალავს.
     */
    use HasTrash;

    /** „ჩემი ქულის" შკალა — ერთი წყარო ვალიდაციისთვისაც და UI-სთვისაც */
    public const MAX_RATING = 10;

    /** მაქვს · მინდა · ვთამაშობ · გავყიდე */
    public const STATUSES = ['owned', 'wanted', 'playing', 'sold'];

    protected $guarded = ['id'];

    protected $casts = [
        'year' => 'integer',
        'players_min' => 'integer',
        'players_max' => 'integer',
        'age_min' => 'integer',
        'playtime_min' => 'integer',
        'playtime_max' => 'integer',
        'complexity' => 'float',
        'bgg_id' => 'integer',
        'bgg_rating' => 'float',
        'rating' => 'integer',
        'is_favorite' => 'boolean',
        'links' => 'array',
        'sort_order' => 'integer',
    ];

    /**
     * ⚠️ ფაილები SQL-ის cascade-ით იშლება, მაგრამ cascade **მოდელის ივენთს
     * არ აგდებს** — ე.ი. ფაილი დისკზე და კვოტის მრიცხველი უცვლელი დარჩებოდა.
     */
    protected static function booted(): void
    {
        static::deleting(function (BoardGame $game) {
            $game->deleteImage();
            /* ⚠️ **`withoutGlobalScope('owner')` სავალდებულოა** (Tasks BUG-21):
               `<module>_files` `BelongsToUser`-ს იყენებს, ე.ი. `files()`
               მიმდინარე **ავტორიზებულ** მომხმარებელზე იჭრება. `/admin/purge`
               და ანგარიშის წაშლა სხვის ბიბლიოთეკას შლის ადმინის სესიიდან —
               სია ცარიელი ბრუნდებოდა, ფაილები დისკზე რჩებოდა და კვოტაც არ
               თავისუფლდებოდა. `Video::booted()` ამას თავიდანვე სწორად აკეთებდა. */
            $game->files()->withoutGlobalScope('owner')->get()->each->delete();
        });
    }

    /* ---------- relations ---------- */

    public function genre(): BelongsTo
    {
        return $this->belongsTo(BoardGameGenre::class, 'genre_id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(BoardGameFile::class)->orderBy('sort_order')->orderBy('id');
    }

    /** გალერეის ფოტოები — იგივე ცხრილი, `kind = 'image'` */
    public function images(): HasMany
    {
        return $this->files()->where('kind', 'image');
    }

    public function notes(): HasMany
    {
        return $this->hasMany(BoardGameNote::class)->orderByDesc('id');
    }

    /* ---------- helpers ---------- */

    /**
     * ⚠️ **მხოლოდ ხელით ატვირთული ფოტო იშლება.** BGG-დან ჩამოტვირთულის
     * სახელი მისი `bgg_id`-ია, ე.ი. ერთი ფაილი რამდენიმე ანგარიშს ემსახურება —
     * წაშლა სხვისთვის სურათს გატეხავდა (TMDB პოსტერისა და წიგნის ყდის წესი).
     * ჩამოტვირთული კვოტაშიც არ ითვლება (19.4/B).
     */
    public function deleteImage(): void
    {
        if ($this->image_path && $this->image_source === 'upload') {
            app(StorageMeter::class)->deleteUpload($this->user_id, $this->image_path);
        }
    }
}
