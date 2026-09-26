<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasTags;
use App\Models\Concerns\HasTrash;
use App\Services\Storage\StorageMeter;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * კურსი — მოდული `course` (FEAT-25).
 *
 * ⚠️ **გარე წყარო არ არსებობს** (Udemy/Coursera-ს კატალოგი დახურულია), ე.ი.
 * „კანდიდატები → სქემა" ნაკადი აქ არაა; ბუკმარკის `LinkMetadata` probe
 * სათაურსა და სურათს ავსებს — მეტი არაფერი.
 *
 * ⚠️ **სტატუსი enum-ია** (`STATUSES`) და არა per-user ლექსიკონი: `StatusDomain`-ის
 * როლები სამია (`todo`/`doing`/`done`), ხოლო „მივატოვე" მეოთხე ფაქტია და
 * არცერთს არ უდრის. წიგნის/თამაშის/სამაგიდოს იგივე რიგი.
 *
 * ⚠️ **სტატუსსა და მის თარიღებს ერთი მეთოდი ათანხმებს** (`syncStatusDates()`).
 * გაკვეთილები, ხანგრძლივობა, ლექტორი და შეფასება Tasks §14-მა ამოიღო —
 * ე.ი. პროგრესი აღარ არსებობს და სტატუსი მხოლოდ ხელით იცვლება.
 */
class Course extends Model
{
    use BelongsToUser;

    /** §6 ფაზა 4b — მორგებულ ველზე ატვირთული ფაილები (წაშლა → დისკი + კვოტა) */
    use HasCustomFields;

    /** FEAT-18 — ტეგების ერთი ქცევა (`Video::normalizeTags()`) */
    use HasTags;

    /** FEAT-11 — კალათა: `destroy()` `moveToTrash()`-ს იძახის */
    use HasTrash;

    /** ⚠️ ოთხი და არა სამი: „მივატოვე" ცალკე ფაქტია და არა „დასრულებული" */
    public const STATUSES = ['to_take', 'taking', 'done', 'dropped'];

    /** ფაილის სახეები — სერტიფიკატი სწორედ ისაა, რასაც ტასქი ითხოვს */
    public const FILE_KINDS = ['certificate', 'image', 'doc'];

    protected $guarded = ['id'];

    protected $casts = [
        'tags' => 'array',
        'is_favorite' => 'boolean',
        'started_at' => 'date',
        'finished_at' => 'date',
        'sort_order' => 'integer',
    ];

    /**
     * ⚠️ **ფაილები სათითაოდ იშლება, SQL-ის კასკადის მიუხედავად**: კასკადი
     * მოდელის ივენთს **არ** ისვრის, ე.ი. ფაილი დისკზე და კვოტის მრიცხველი
     * უკან დარჩებოდა (`Video`/`Song`-ის იგივე წესი). `PurgeService` სწორედ
     * `$record->delete()`-ს იძახის, რომ ეს ჩაირთოს.
     */
    protected static function booted(): void
    {
        static::deleting(function (Course $course) {
            $course->deleteThumbnail();

            /* ⚠️ **`withoutGlobalScope('owner')` სავალდებულოა** (BUG-21-ის
               ზუსტი გაკვეთილი): `course_files` `BelongsToUser`-ს იყენებს, ე.ი.
               `files()` **მიმდინარე ავტორიზებულ** მომხმარებელზე იჭრება.
               `/admin/purge` და ანგარიშის წაშლა სხვის ბიბლიოთეკას ადმინის
               სესიიდან შლის — სია ცარიელი დაბრუნდებოდა, ფაილები დისკზე
               დარჩებოდა და კვოტაც არ გათავისუფლდებოდა. */
            $course->files()->withoutGlobalScope('owner')->get()->each->delete();
        });
    }

    /* ---------- relations ---------- */

    public function category(): BelongsTo
    {
        return $this->belongsTo(CourseCategory::class, 'category_id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(CourseFile::class)->orderByDesc('id');
    }

    /* ---------- helpers ---------- */

    /**
     * ბმულის მიბმა — **ერთადერთი ადგილი**, სადაც `platform` იწერება
     * (`Bookmark::applyUrl()`-ის ზუსტი ფორმა: `www.` იჭრება, რომ
     * „udemy.com" და „www.udemy.com" ერთი პლატფორმა იყოს).
     */
    public function applyUrl(?string $url): void
    {
        $this->url = $url ?: null;
        $host = $url ? (parse_url($url, PHP_URL_HOST) ?: null) : null;

        $this->platform = $host ? preg_replace('/^www\./i', '', strtolower($host)) : null;
    }

    /**
     * **სტატუსისა და მისი თარიღების შეთანხმება — ერთადერთი ადგილი.**
     *
     * ⚠️ **`finished_at` მხოლოდ აქ იწერება** — FEAT-08/FEAT-21 სწორედ ამ
     * თარიღით ითვლის „წელს რამდენი დავასრულე"-ს. `??=`: უკვე ჩაწერილი თარიღი
     * არ გადაიწერება, თორემ ყოველი რედაქტირება მას მიმდინარე წელში გადაათრევდა.
     */
    public function syncStatusDates(): void
    {
        if ($this->status === 'done') {
            $this->finished_at ??= now()->toDateString();
        } else {
            // ⚠️ უკან დაბრუნებაზე თარიღი უნდა წავიდეს, თორემ სტატისტიკა
            // დაუსრულებელ კურსს სამუდამოდ ჩათვლიდა
            $this->finished_at = null;
        }

        if ($this->status !== 'to_take') {
            $this->started_at ??= now()->toDateString();
        }
    }

    public function deleteThumbnail(): void
    {
        app(StorageMeter::class)->deleteUpload($this->user_id, $this->thumbnail_path);
    }
}
