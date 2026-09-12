<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasStatus;
use App\Services\Storage\StorageMeter;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * ვიდეო (I5) — ნებისმიერი წყაროდან შენახული ბმული.
 */
class Video extends Model
{
    use BelongsToUser;

    /** §6 ფაზა 4b — მორგებულ ველზე ატვირთული ფაილები (წაშლა → დისკი + კვოტა) */
    use HasCustomFields;

    /** Tasks §6.4 — სტატუსი per-user ლექსიკონია (`statuses`), enum-ი აღარაა */
    use HasStatus;

    protected $guarded = ['id'];

    /* ⚠️ სტატუსი ყოველთვის იტვირთოს: სიაში ბეჯი, ფილტრი და როლი
       ყველგან სჭირდება, ცალკე `with()` კი ოცამდე ადგილას დაგვავიწყდებოდა. */
    protected $with = ['status'];

    /** §7.1 — ჩამოწერის მდგომარეობები (`null` = არასდროს გვიცდია) */
    public const DOWNLOAD_RUNNING = 'running';

    public const DOWNLOAD_READY = 'ready';

    public const DOWNLOAD_FAILED = 'failed';

    protected $casts = [
        'tags' => 'array',
        'duration' => 'integer',
        'is_favorite' => 'boolean',
        'watch_count' => 'integer',
        'watched_at' => 'datetime',
        'sort_order' => 'integer',
        'download_size' => 'integer',
        'downloaded_at' => 'datetime',
    ];

    /**
     * ⚠️ `video_files`/`video_notes` ბაზაზე cascade-ით იშლება, მაგრამ SQL-ის
     * cascade **მოდელის ივენთს არ აგდებს** — ე.ი. ფაილი დისკზე დარჩებოდა და
     * კვოტა არ თავისუფლდებოდა. ამიტომ ფაილებს მაინც სათითაოდ ვშლით.
     *
     * ⚠️ **თამბნეილიც აქ იშლება და არა კონტროლერში.** `DELETE /api/videos/{id}`
     * მას ისედაც იძახებდა, მაგრამ `PurgeService` (Tasks 20) პირდაპირ
     * `$record->delete()`-ს აკეთებს — ე.ი. მასობრივი წაშლა თამბნეილს დისკზე
     * ტოვებდა და კვოტას არ ათავისუფლებდა.
     */
    protected static function booted(): void
    {
        static::deleting(function (Video $video) {
            foreach ($video->files()->withoutGlobalScope('owner')->cursor() as $file) {
                $file->delete();
            }
            $video->deleteThumbnail();
            // §7.1 — ლოკალური ასლიც: ის ყველაზე დიდი ფაილია მთელ კვოტაში
            $video->deleteDownload();
        });
    }

    /** სტატუსი `watched_at`-ს არ ეხება — იხ. `HasStatus::statusDoneColumn()` */
    protected function statusDoneColumn(): ?string
    {
        return null;
    }

    /** მართვადი ტიპი (Tasks 5.1) — ადრე `kind` enum იყო */
    public function type(): BelongsTo
    {
        return $this->belongsTo(VideoType::class, 'type_id');
    }

    /* ---------- მიმაგრებული შიგთავსი — სექციის საკუთარი ცხრილები ---------- */

    public function files(): HasMany
    {
        return $this->hasMany(VideoFile::class)->orderBy('sort_order')->orderBy('id');
    }

    public function images(): HasMany
    {
        return $this->files()->where('kind', 'image');
    }

    public function documents(): HasMany
    {
        return $this->files()->where('kind', 'doc');
    }

    public function notes(): HasMany
    {
        return $this->hasMany(VideoNote::class)->orderByDesc('id');
    }

    /**
     * ატვირთული თამბნეილის წაშლა დისკიდან. 17.1 — ზომა კვოტიდან აქვე
     * მოიხსნება, ე.ი. ყველა გზა (ჩანაცვლება, „მოშორება", ვიდეოს წაშლა)
     * მრიცხველს სწორად ტოვებს.
     */
    public function deleteThumbnail(): void
    {
        app(StorageMeter::class)->deleteUpload($this->user_id, $this->thumbnail_path);
    }

    /**
     * **ლოკალურად ჩამოწერილი ასლის მოშორება (§7.1).**
     *
     * ⚠️ კვოტიდან **ჩაწერილი `download_size`** თავისუფლდება და არა დისკიდან
     * წაკითხული ზომა — იგივე წესი, რაც `StoredFile`-სა და ჩატის მიმაგრებას
     * აქვს: დისკზე ფაილი შეიძლება უკვე აღარ იყოს, მრიცხველში კი ითვლება.
     *
     * ⚠️ სვეტები ერთად სუფთავდება: გზის გარეშე დარჩენილი `ready` სტატუსი
     * UI-ს ეტყოდა, რომ ფაილი აქვს, გახსნა კი 404-ს დააბრუნებდა.
     */
    public function deleteDownload(): void
    {
        if (! $this->download_path) {
            return;
        }

        $meter = app(StorageMeter::class);
        $meter->deleteUpload(null, $this->download_path);
        $meter->addFor((int) $this->user_id, -(int) $this->download_size);

        $this->forceFill([
            'download_path' => null,
            'download_name' => null,
            'download_size' => 0,
            'download_format' => null,
            'download_status' => null,
            'download_error' => null,
            'downloaded_at' => null,
        ]);
    }

    /** ლოკალური ასლი მზადაა? (ბადეზე ხატულა და „ცალკე სექცია" ამაზე დგას) */
    public function hasDownload(): bool
    {
        return $this->download_status === self::DOWNLOAD_READY && (bool) $this->download_path;
    }

    /**
     * ტეგის შედარების გასაღები (Tasks 5.3) — რეგისტრისა და ზედმეტი
     * სივრცის მიუხედავად. ერთი წყარო ფორმისთვისაც და bulk-ისთვისაც (4).
     */
    public static function tagKey(string $tag): string
    {
        return mb_strtolower(trim(preg_replace('/\s+/u', ' ', $tag) ?? ''));
    }

    /**
     * ტეგების დუბლის მოჭრა. **ძველი რჩება, ახალი იშლება**, ე.ი.
     * თანმიმდევრობა არ იცვლება.
     *
     * @param  array<int, mixed>  $tags
     * @return list<string>
     */
    public static function normalizeTags(array $tags): array
    {
        $out = [];
        $seen = [];

        foreach ($tags as $tag) {
            $clean = trim(preg_replace('/\s+/u', ' ', (string) $tag) ?? '');
            if ($clean === '') {
                continue;
            }

            $key = mb_strtolower($clean);
            if (isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
            $out[] = $clean;
        }

        return $out;
    }
}
