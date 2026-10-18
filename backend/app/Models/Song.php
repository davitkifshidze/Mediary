<?php

namespace App\Models;

use App\Casts\RatingCast;
use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasTags;
use App\Models\Concerns\HasTrash;
use App\Services\Storage\StorageMeter;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * სიმღერა — **საკუთარი მოდული** (`song`, გადაწყვეტილება 2026-09-03).
 *
 * ადრე სიმღერა `videos`-ის რიგი იყო; ცალკე მოდულმა მას მისცა
 * საიდბარის სექცია, ადმინის გადამრთველი, როლების უფლებები და სრული
 * მუსიკალური ველების ნაკრები (შემსრულებელი · ალბომი · წელი · ჟანრი ·
 * ხანგრძლივობა · ტეგები · ჩემი ქულა).
 *
 * ⚠️ **გალერეა და „მასალა" (ფაილები, ჩანიშვნები) ამოღებულია**: სიმღერას
 * მსგავსი ფუნქციონალი საერთოდ არ სჭირდება. მას მხოლოდ მთავარი ფოტო
 * (`thumbnail_path`) რჩება — ის ბარათის სურათია.
 *
 * ⚠️ **მრავალჟანრიანია** (pivot `song_genre_song`) — ერთი `genre_id` აღარ
 * არსებობს, ე.ი. ფილტრი `whereHas`-ია და ჟანრის წაშლა pivot-ზე **ამატებს**
 * და არა სვეტს ცვლის (`Game`-ის წესი).
 */
class Song extends Model
{
    use BelongsToUser;

    /** მორგებულ ველზე ატვირთული ფაილები (წაშლა → დისკი + კვოტა) */
    use HasCustomFields;

    /** ტეგების ერთი ქცევა (`Video::normalizeTags()`) */
    use HasTags;

    /**
     * ⚠️ **კალათა** — `destroy()` `moveToTrash()`-ს იძახის და არა
     * `delete()`-ს; `trash` scope წაშლილს ყველა ჩვეულებრივ query-ს მალავს.
     */
    use HasTrash;

    protected $guarded = ['id'];

    protected $casts = [
        'year' => 'integer',
        'duration' => 'integer',
        'rating' => RatingCast::class,
        'tags' => 'array',
        'is_favorite' => 'boolean',
        'play_count' => 'integer',
        'played_at' => 'datetime',
        'sort_order' => 'integer',
    ];

    /**
     * ⚠️ **მთავარი ფოტო აქ იშლება და არა კონტროლერში**: `PurgeService`
     * პირდაპირ `$record->delete()`-ს აკეთებს, ე.ი. მასობრივი წაშლა ფოტოს
     * დისკზე ტოვებდა და კვოტას არ ათავისუფლებდა.
     */
    protected static function booted(): void
    {
        static::deleting(function (Song $song) {
            $song->deleteThumbnail();
        });
    }

    /* ---------- relations ---------- */

    /**
     * per-user ჟანრის ლექსიკონი — **მრავალი** ჟანრი თითო სიმღერაზე
     * (`Game::genres()`-ის ნიმუში).
     */
    public function genres(): BelongsToMany
    {
        return $this->belongsToMany(SongGenre::class, 'song_genre_song', 'song_id', 'song_genre_id')
            ->orderBy('song_genres.sort_order')
            ->orderBy('song_genres.id');
    }

    /**
     * პლეილისტები, რომლებშიც ეს სიმღერა შედის.
     * pivot-ის რიგები FK-ის cascade-ით იშლება.
     */
    public function playlists(): BelongsToMany
    {
        return $this->belongsToMany(Playlist::class)->orderBy('playlists.sort_order');
    }

    /* ---------- helpers ---------- */

    /**
     * ატვირთული ფოტოს წაშლა დისკიდან — ზომა კვოტიდან აქვე მოიხსნება,
     * ე.ი. ყველა გზა (ჩანაცვლება, „მოშორება", სიმღერის წაშლა) მრიცხველს
     * სწორად ტოვებს.
     */
    public function deleteThumbnail(): void
    {
        app(StorageMeter::class)->deleteUpload($this->user_id, $this->thumbnail_path);
    }
}
