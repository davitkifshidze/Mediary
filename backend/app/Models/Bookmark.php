<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasStatus;
use App\Models\Concerns\HasTags;
use App\Models\Concerns\HasTrash;
use App\Services\Storage\StorageMeter;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ბუკმარკი — მოდული `bookmark` (Tasks §18, `DECISIONS.md` §10).
 *
 * ⚠️ **გარე წყარო არ არსებობს.** TMDB/RAWG/BGG-ის ანალოგი ბმულებზე არ არის;
 * მეტამონაცემი თვითონ გვერდიდან მოდის (`Services\Bookmarks\LinkMetadata`),
 * ე.ი. „lookup კანდიდატების" ნაკადიც არ გვჭირდება — ერთი probe ჰყოფნის.
 *
 * ⚠️ **კატეგორია ერთია** (`category_id`), განსხვავებით სიმღერისა და თამაშისგან:
 * კატეგორია აქ საქაღალდეა, დანარჩენ ჭრილს `tags` ფარავს (§13-ის ჩანაწერის წესი).
 *
 * ⚠️ **`domain` სვეტია და არა აქსესორი** — მასზე ხდება ფილტრი და დაჯგუფება,
 * რასაც SQL-ში სვეტის გარეშე ვერ მოვახერხებდით. ერთადერთი ადგილი, სადაც
 * ივსება, `applyUrl()`-ია (იგივე წესი, რაც `GameVideo::applyUrl()`-ზე).
 */
class Bookmark extends Model
{
    use BelongsToUser;

    /** §6 ფაზა 4b — მორგებულ ველზე ატვირთული ფაილები (წაშლა → დისკი + კვოტა) */
    use HasCustomFields;

    /** Tasks §6.4 — სტატუსი per-user ლექსიკონია (`statuses`), enum-ი აღარაა */
    use HasStatus;

    /** FEAT-18 — ტეგების ერთი ქცევა (`Video::normalizeTags()`) */
    use HasTags;

    /**
     * ⚠️ **კალათა (FEAT-11)** — `destroy()` `moveToTrash()`-ს იძახის და არა
     * `delete()`-ს; `trash` scope წაშლილს ყველა ჩვეულებრივ query-ს მალავს.
     */
    use HasTrash;

    protected $guarded = ['id'];

    /* ⚠️ სტატუსი ყოველთვის იტვირთოს: სიაში ბეჯი, ფილტრი და როლი
       ყველგან სჭირდება, ცალკე `with()` კი ოცამდე ადგილას დაგვავიწყდებოდა. */
    protected $with = ['status'];

    protected $casts = [
        'tags' => 'array',
        'is_favorite' => 'boolean',
        'visit_count' => 'integer',
        'visited_at' => 'datetime',
        'sort_order' => 'integer',
    ];

    /**
     * ⚠️ **თამბნეილი აქ იშლება და არა კონტროლერში**: `PurgeService` (Tasks 20)
     * პირდაპირ `$record->delete()`-ს აკეთებს, ე.ი. მასობრივი წაშლა ფაილს
     * დისკზე დატოვებდა და კვოტას სამუდამოდ დაკავებულს (იგივე წესი, რაც `Song`-ზე).
     */
    protected static function booted(): void
    {
        static::deleting(fn (Bookmark $bookmark) => $bookmark->deleteThumbnail());
    }

    /* ---------- relations ---------- */

    /** სტატუსი `watched_at`-ს არ ეხება — იხ. `HasStatus::statusDoneColumn()` */
    protected function statusDoneColumn(): ?string
    {
        return null;
    }

    /** per-user კატეგორიის ლექსიკონი */
    public function category(): BelongsTo
    {
        return $this->belongsTo(BookmarkCategory::class, 'category_id');
    }

    /* ---------- helpers ---------- */

    /**
     * ბმულის მიბმა — **ერთადერთი ადგილი**, სადაც `domain` იწერება.
     * ჰოსტიდან `www.` იჭრება, რომ „example.com" და „www.example.com"
     * ერთ ჯგუფად წაიკითხოს.
     */
    public function applyUrl(string $url): void
    {
        $this->url = $url;
        $host = parse_url($url, PHP_URL_HOST) ?: null;

        $this->domain = $host ? preg_replace('/^www\./i', '', strtolower($host)) : null;
    }

    /**
     * ატვირთული ფოტოს წაშლა დისკიდან. 17.1 — ზომა კვოტიდან აქვე მოიხსნება,
     * ე.ი. ყველა გზა (ჩანაცვლება, „მოშორება", ჩანაწერის წაშლა) მრიცხველს
     * სწორად ტოვებს.
     */
    public function deleteThumbnail(): void
    {
        app(StorageMeter::class)->deleteUpload($this->user_id, $this->thumbnail_path);
    }
}
