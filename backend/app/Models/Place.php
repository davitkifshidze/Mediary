<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasGallery;
use App\Models\Concerns\HasTags;
use App\Models\Concerns\HasTrash;
use App\Services\Storage\StorageMeter;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * ადგილი — მოდული `place` (FEAT-26).
 *
 * ⚠️ **სტატუსი enum-ია და ორმნიშვნელოვანი** (`to_visit`/`visited`): ადგილს
 * „მიმდინარე" მდგომარეობა არ აქვს — ან ვიყავი, ან არა. წიგნის/თამაშის/
 * კურსის იგივე რიგი (per-user ლექსიკონი აქ ერთ როლს ვერ გამოიყენებდა).
 *
 * ⚠️ **`visited_at`-ს მხოლოდ `applyStatus()` წერს.** FEAT-08-ის თვეების
 * ჭრილი და FEAT-21-ის მიზანი სწორედ ამ თარიღით ითვლიან „წელს რამდენი
 * ვნახე"-ს; ორი მწერალი ერთი ფაქტისთვის ის ხაფანგია, რომელსაც
 * `Book::syncProgress()` ებრძვის.
 *
 * ⚠️ **გალერეის მშობელია** (`HasGallery` + `GalleryParent`): ვებძებნით
 * ან ატვირთვით მოტანილი ფოტო `gallery_images`-ში ჯდება, ხოლო ჩემი
 * გადაღებული — `place_files`-ში. იგივე განაწილება, რაც თამაშსა და
 * სამაგიდო თამაშს აქვს.
 */
class Place extends Model
{
    use BelongsToUser;

    /** §6 ფაზა 4b — მორგებული ველების ფაილები (წაშლა → დისკი + კვოტა) */
    use HasCustomFields;

    /** §10/§8 — `gallery_images` + `gallery_videos` ამ ჩანაწერზე */
    use HasGallery;

    /** FEAT-18 — ტეგების ერთი ქცევა (`Video::normalizeTags()`) */
    use HasTags;

    /** FEAT-11 — კალათა: `destroy()` `moveToTrash()`-ს იძახის */
    use HasTrash;

    /** ⚠️ ორი და არა სამი — ადგილს „მიმდინარე" მდგომარეობა არ აქვს */
    public const STATUSES = ['to_visit', 'visited'];

    public const FILE_KINDS = ['image', 'doc'];

    protected $guarded = ['id'];

    protected $casts = [
        'tags' => 'array',
        /* ⚠️ `decimal` და არა `float`: მცურავი წერტილი იმავე კოორდინატს
           დრაივერის მიხედვით ორ სხვადასხვა მნიშვნელობად აბრუნებს, ე.ი.
           „ეს ორი ერთი ადგილია?" პასუხგაუცემელი ხდებოდა. */
        'lat' => 'decimal:7',
        'lng' => 'decimal:7',
        'rating' => 'decimal:1',
        'is_favorite' => 'boolean',
        'visited_at' => 'date',
        'sort_order' => 'integer',
    ];

    /**
     * ⚠️ **ფაილები სათითაოდ იშლება, SQL-ის კასკადის მიუხედავად**: კასკადი
     * მოდელის ივენთს არ ისვრის, ე.ი. ფაილი დისკზე და კვოტის მრიცხველი
     * უკან დარჩებოდა.
     */
    protected static function booted(): void
    {
        static::deleting(function (Place $place) {
            $place->deletePhoto();

            /* ⚠️ **`withoutGlobalScope('owner')` სავალდებულოა** (BUG-21-ის
               გაკვეთილი): `/admin/purge` და ანგარიშის წაშლა სხვის
               ბიბლიოთეკას ადმინის სესიიდან შლის — გაფილტრული კავშირი
               ცარიელს დააბრუნებდა და ფაილები დისკზე დარჩებოდა. */
            $place->files()->withoutGlobalScope('owner')->get()->each->delete();

            $place->deleteGalleryMedia();
        });
    }

    /* ---------- relations ---------- */

    public function category(): BelongsTo
    {
        return $this->belongsTo(PlaceCategory::class, 'category_id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(PlaceFile::class)->orderByDesc('id');
    }

    /* ---------- helpers ---------- */

    /**
     * **სტატუსის დაწერის ერთადერთი ადგილი** — `HasStatus::applyStatusKey()`-ის
     * იგივე როლი enum-იან დომენზე.
     *
     * ⚠️ „ვიყავი" თარიღს სვამს, უკან დაბრუნება კი — შლის: თორემ
     * სტატისტიკა (FEAT-08/FEAT-21) სამუდამოდ ჩათვლიდა ადგილს, სადაც
     * მომხმარებელმა თქვა, რომ არ ყოფილა.
     */
    public function applyStatus(string $status, ?string $visitedAt = null): void
    {
        $this->status = $status;

        if ($status === 'visited') {
            // ცხადად გადმოცემული თარიღი უპირატესია — ძველი ვიზიტიც ჩაიწერება
            $this->visited_at = $visitedAt ?: ($this->visited_at ?: now()->toDateString());

            return;
        }

        $this->visited_at = null;
    }

    /** გარე რუკის ბმული — ⚠️ რუკა თვითონ არ ემატება (იხ. მიგრაციის დოკბლოკი) */
    public function mapUrl(): ?string
    {
        if ($this->lat === null || $this->lng === null) {
            return null;
        }

        return 'https://www.openstreetmap.org/?mlat='.$this->lat.'&mlon='.$this->lng.'#map=17/'.$this->lat.'/'.$this->lng;
    }

    public function deletePhoto(): void
    {
        app(StorageMeter::class)->deleteUpload($this->user_id, $this->photo_path);
    }
}
