<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasGallery;
use App\Models\Concerns\HasTags;
use App\Models\Concerns\HasTrash;
use App\Services\Storage\StorageMeter;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * სიმღერა — **საკუთარი მოდული** (`song`, გადაწყვეტილება 2026-09-03).
 *
 * ადრე სიმღერა `videos`-ის რიგი იყო (Tasks §15); ცალკე მოდულმა მას მისცა
 * საიდბარის სექცია, ადმინის გადამრთველი, როლების უფლებები და სრული
 * მუსიკალური ველების ნაკრები (შემსრულებელი · ალბომი · წელი · ჟანრი ·
 * ხანგრძლივობა · ტეგები · ჩემი ქულა).
 *
 * გალერეა სიმღერასაც ეკიდება (`HasGallery` → `gallery_images`), ე.ი. ალბომის
 * ყდები/ფოტოები იმავე მექანიზმზე გადის, რაც ფილმებზე.
 *
 * ⚠️ **მრავალჟანრიანია** (pivot `song_genre_song`) — `DECISIONS.md` §5-ის
 * პასუხი 2026-09-06-ს. ერთი `genre_id` აღარ არსებობს, ე.ი. ფილტრი `whereHas`-ია
 * და ჟანრის წაშლა pivot-ზე **ამატებს** და არა სვეტს ცვლის (`Game`-ის წესი).
 */
class Song extends Model
{
    use BelongsToUser, HasGallery;

    /** §6 ფაზა 4b — მორგებულ ველზე ატვირთული ფაილები (წაშლა → დისკი + კვოტა) */
    use HasCustomFields;

    /** FEAT-18 — ტეგების ერთი ქცევა (`Video::normalizeTags()`) */
    use HasTags;

    /**
     * ⚠️ **კალათა (FEAT-11)** — `destroy()` `moveToTrash()`-ს იძახის და არა
     * `delete()`-ს; `trash` scope წაშლილს ყველა ჩვეულებრივ query-ს მალავს.
     */
    use HasTrash;

    /** „ჩემი ქულის" შკალა — ერთი წყარო ვალიდაციისთვისაც და UI-სთვისაც */
    public const MAX_RATING = 10;

    protected $guarded = ['id'];

    protected $casts = [
        'year' => 'integer',
        'duration' => 'integer',
        'rating' => 'integer',
        'tags' => 'array',
        'is_favorite' => 'boolean',
        'play_count' => 'integer',
        'played_at' => 'datetime',
        'sort_order' => 'integer',
    ];

    /**
     * `morphs()` cascade-ს არ ქმნის — გალერეის ფოტოები ხელით იშლება.
     *
     * ⚠️ **თამბნეილიც აქ იშლება და არა კონტროლერში**: `PurgeService` (Tasks 20)
     * პირდაპირ `$record->delete()`-ს აკეთებს, ე.ი. მასობრივი წაშლა თამბნეილს
     * დისკზე ტოვებდა და კვოტას არ ათავისუფლებდა.
     */
    protected static function booted(): void
    {
        static::deleting(function (Song $song) {
            $song->deleteGalleryMedia();
            $song->deleteThumbnail();
            /* §7.4 — ⚠️ **ფაილები სათითაოდ, cascade-ის მიუხედავად.** SQL-ის
               cascade რიგებს წაიღებს, ფაილს დისკზე კი არავინ: კასკადი
               მოდელის ივენთს არ ისვრის, ე.ი. `StoredFile`-ის `deleting`
               არასდროს გაისროლებოდა და კვოტაც სამუდამოდ დაკავებული
               დარჩებოდა (`Video::booted()`-ის ზუსტი პრეცედენტი). */
            /* ⚠️ **`withoutGlobalScope('owner')` სავალდებულოა** (Tasks BUG-21):
               `<module>_files` `BelongsToUser`-ს იყენებს, ე.ი. `files()`
               მიმდინარე **ავტორიზებულ** მომხმარებელზე იჭრება. `/admin/purge`
               და ანგარიშის წაშლა სხვის ბიბლიოთეკას შლის ადმინის სესიიდან —
               სია ცარიელი ბრუნდებოდა, ფაილები დისკზე რჩებოდა და კვოტაც არ
               თავისუფლდებოდა. `Video::booted()` ამას თავიდანვე სწორად აკეთებდა. */
            $song->files()->withoutGlobalScope('owner')->get()->each->delete();
        });
    }

    /* ---------- relations ---------- */

    /**
     * per-user ჟანრის ლექსიკონი — **მრავალი** ჟანრი თითო სიმღერაზე
     * (`DECISIONS.md` §5, პასუხი 2026-09-06; `Game::genres()`-ის ნიმუში).
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

    /** მიმაგრებული ფაილები — ფოტოები და დოკუმენტები (§7.4) */
    public function files(): HasMany
    {
        return $this->hasMany(SongFile::class)->orderBy('sort_order')->orderBy('id');
    }

    /** ფოტოები — იგივე ცხრილი, `kind = 'image'` (ვიდეოს წესი) */
    public function images(): HasMany
    {
        return $this->files()->where('kind', 'image');
    }

    /** დოკუმენტები — ტექსტი, ნოტები, ბუკლეტი */
    public function documents(): HasMany
    {
        return $this->files()->where('kind', 'doc');
    }

    /** ჩანიშვნები — უახლესი ზემოთ (§7.4) */
    public function notes(): HasMany
    {
        return $this->hasMany(SongNote::class)->orderByDesc('id');
    }

    /* ---------- helpers ---------- */

    /**
     * ატვირთული ფოტოს წაშლა დისკიდან. 17.1 — ზომა კვოტიდან აქვე მოიხსნება,
     * ე.ი. ყველა გზა (ჩანაცვლება, „მოშორება", სიმღერის წაშლა) მრიცხველს
     * სწორად ტოვებს.
     */
    public function deleteThumbnail(): void
    {
        app(StorageMeter::class)->deleteUpload($this->user_id, $this->thumbnail_path);
    }
}
