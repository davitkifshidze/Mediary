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
 * ⚠️ **პროგრესს და სტატუსს ერთი მეთოდი ათანხმებს** (`syncProgress()`) —
 * `Book::syncProgress()`-ის ზუსტი მიზეზი: ორი წყარო ერთი ფაქტისთვის
 * ერთმანეთს დაშორდებოდა („დასრულებული", რომელსაც გაკვეთილები აკლია).
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
        'lessons_total' => 'integer',
        'lessons_done' => 'integer',
        'minutes' => 'integer',
        'rating' => 'decimal:1',
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
     * **პროგრესისა და სტატუსის შეთანხმება — ერთადერთი ადგილი.**
     *
     * ⚠️ `Book::syncProgress()`-ის ზუსტი მიზეზი: „დასრულებული, რომელსაც
     * გაკვეთილები აკლია" და „ყველა გაკვეთილი გავიარე, სტატუსი კი
     * *გასავლელია*" ორივე ის მდგომარეობაა, რომელსაც ორი დამოუკიდებელი
     * მწერალი ერთ დღეს შექმნის.
     *
     * ⚠️ **`finished_at` მხოლოდ აქ იწერება** — FEAT-08/FEAT-21 სწორედ ამ
     * თარიღით ითვლის „წელს რამდენი დავასრულე"-ს.
     */
    public function syncProgress(): void
    {
        $total = (int) $this->lessons_total;
        $done = max(0, (int) $this->lessons_done);

        if ($total > 0) {
            $done = min($done, $total);

            /* ⚠️ **ავტომატური დაწინაურება მხოლოდ მაშინ, როცა *პროგრესი*
               შეიცვალა.** უამისოდ „გავიარე"-დან „გავდივარ"-ზე ცხადი დაბრუნება
               მყისვე უკან ბრუნდებოდა (ყველა გაკვეთილი ხომ გავლილია) —
               ე.ი. მომხმარებლის ცხადი არჩევანი ვერ სრულდებოდა.
               `isDirty()` ზუსტად ამას ამბობს: `setStatus()` `lessons_done`-ს
               არ ეხება, `setProgress()` — ეხება. */
            if ($this->isDirty('lessons_done') || $this->wasRecentlyCreated || ! $this->exists) {
                if ($done === $total && $this->status === 'taking') {
                    $this->status = 'done';
                }

                // დაწყებულია, მაგრამ ჯერ „გასავლელად" ითვლება
                if ($done > 0 && $done < $total && $this->status === 'to_take') {
                    $this->status = 'taking';
                }
            }
        }

        $this->lessons_done = $done;

        if ($this->status === 'done') {
            $this->finished_at ??= now()->toDateString();

            if ($total > 0) {
                $this->lessons_done = $total;
            }
        } else {
            // ⚠️ უკან დაბრუნებაზე თარიღი უნდა წავიდეს, თორემ სტატისტიკა
            // დაუსრულებელ კურსს სამუდამოდ ჩათვლიდა
            $this->finished_at = null;
        }

        if ($this->status !== 'to_take') {
            $this->started_at ??= now()->toDateString();
        }
    }

    /** პროგრესი პროცენტებში — **გამოთვლადია და არ ინახება** (ორი ერთეული ერთ ფაქტზე) */
    public function percent(): ?int
    {
        $total = (int) $this->lessons_total;

        return $total > 0 ? min(100, (int) round($this->lessons_done / $total * 100)) : null;
    }

    public function deleteThumbnail(): void
    {
        app(StorageMeter::class)->deleteUpload($this->user_id, $this->thumbnail_path);
    }
}
