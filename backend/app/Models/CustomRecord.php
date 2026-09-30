<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasGallery;
use App\Models\Concerns\HasStatus;
use App\Models\Concerns\HasTags;
use App\Models\Concerns\HasTrash;
use App\Services\Storage\StorageMeter;
use App\Support\CustomModules;
use App\Support\StorageFolder;
use App\Support\VideoUrl;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **ინტერფეისიდან შექმნილი მოდულის ჩანაწერი (Tasks §37).**
 *
 * ერთი ცხრილი ყველა პირად მოდულზე — მოდულს `module` სვეტი (გასაღები) ჭრის.
 * ჩაშენებული ველები განზრახ მცირეა (სათაური, აღწერა, ბმული, სტატუსი,
 * კლასიფიკაცია, ტეგები, რჩეული, მთავარი ფოტო); დანარჩენს მფლობელი
 * **დამატებითი ველებით** აწყობს — უკვე არსებული მექანიზმით (§6), ტიპიზებული
 * მნიშვნელობებითა და ფაილის ველით.
 *
 * ⚠️ **ჩანაწერს მოდულის ფარგლებში ყოველთვის `forModule()`-ით ეძებენ.**
 * `owner` scope ანგარიშზე ჭრის და არა მოდულზე — ერთი ანგარიშის ორი
 * პირადი მოდულის ჩანაწერები ერთ ცხრილშია, ე.ი. მოდულის გარეშე query
 * მეორე მოდულის ჩანაწერს დააბრუნებდა.
 */
class CustomRecord extends Model
{
    use BelongsToUser;

    /** §6 ფაზა 4b — დამატებით ველზე ატვირთული ფაილები (წაშლა → დისკი + კვოტა) */
    use HasCustomFields;

    /** §37.4 — გალერეის მშობელი (`GalleryParent`): ვებიდან მოტანილი ფოტო და ვიდეო-ბმული */
    use HasGallery;

    /** სტატუსი — `statuses` ლექსიკონი, დომენი = მოდულის გასაღები */
    use HasStatus;

    /** FEAT-18 — ტეგების ერთი ქცევა (`Video::normalizeTags()`) */
    use HasTags;

    /** FEAT-11 → Tasks §29 — წაშლა ურნაშია (`moveToTrash()`) */
    use HasTrash;

    /** morph alias, როცა მოდული ჯერ არ ვიცით (ცარიელი ინსტანცია) */
    public const MORPH = 'custom_record';

    protected $guarded = ['id'];

    /* ⚠️ სტატუსი ყოველთვის იტვირთოს (`Bookmark`-ის წესი): სიაში ბეჯი,
       ფილტრი და როლი ყველგან სჭირდება. */
    protected $with = ['status'];

    protected $casts = [
        'tags' => 'array',
        'is_favorite' => 'boolean',
        'finished_at' => 'datetime',
    ];

    /**
     * ⚠️ **მთავარი ფოტო მოდელის `deleting`-ში იშლება და არა კონტროლერში**
     * (`Movie::deletePoster()`-ის წესი): ურნიდან საბოლოო წაშლა, მასობრივი
     * წაშლა და ანგარიშის წაშლა `delete()`-ს მოდელზე იძახებს — კონტროლერში
     * დაწერილი გასუფთავება მათ გამოტოვებდა და კვოტა სამუდამოდ დარჩებოდა.
     */
    protected static function booted(): void
    {
        static::deleting(function (CustomRecord $record) {
            $record->deletePhoto();
            // §37.4 — `morphs()` FK-cascade-ს არ ქმნის (`HasGallery`-ის წესი)
            $record->deleteGalleryMedia();
        });
    }

    /**
     * **ჩანაწერის query, რომლის მოდელმაც თავისი მოდული იცის** (Tasks §37.4).
     *
     * ⚠️ `forModule()` აქ არ კმარა. `withCount('galleryImages')`/`whereHas()`
     * კავშირს **builder-ის მოდელზე** აგებს (`getRelationWithoutConstraints()`),
     * ხოლო `CustomRecord::query()`-ის მოდელი ცარიელი ინსტანციაა — მისი
     * `getMorphClass()` `custom_record`-ია და არა მოდულის გასაღები, ე.ი.
     * ქვე-query `imageable_type = 'custom_record'`-ს ეძებდა და ყოველი ჯგუფი
     * „0 ფოტოს" იტყოდა. ინსტანციის `newQuery()` builder-ს **ამ** ინსტანციას
     * უკავშირებს — მოდულიანს.
     */
    public static function queryFor(string $module): Builder
    {
        return (new static)->setAttribute('module', $module)->newQuery()->forModule($module);
    }

    /**
     * **morph alias — მოდულის გასაღები** (Tasks §37.4).
     *
     * ⚠️ `custom_record` ერთადერთი alias რომ ყოფილიყო, „ვისია ეს ფოტო" ყოველ
     * გამოძახებაზე `custom_records`-თან join-ს მოითხოვდა, ხოლო მთელი პროექტი
     * სხვაგვარად ფიქრობს: `imageable_type`, `trashed_files.record_type`,
     * `trash_entries.record_type` — **მოდულის გასაღებია** (საბაზისო მოდულზე
     * alias და key ერთი და იგივეა). ურნა ამ გასაღებით ეძებს უფლებას,
     * საცავი — მოდულს (`StorageMeter::files()`), ჩანაწერის საბოლოო წაშლა —
     * ურნაში მყოფ მთავარ ფოტოს (`CustomFieldService::purgeRecordFiles()`).
     * `custom_record`-ით ეს სამივე ჩუმად ცდებოდა: ჩანაცვლებული ფოტო ურნაში
     * არ ჩანდა და მოდულის ლიმიტში არ ითვლებოდა.
     *
     * ⚠️ **ცარიელ ინსტანციაზე `custom_record`-ია** — მოდული ჯერ უცნობია;
     * ამიტომ არსებობს `queryFor()`. რუკაში გასაღები `CustomModules::registerMorph()`-ით
     * ჯდება, რომ `MorphTo`-მ ის უკან ამოიცნოს.
     */
    public function getMorphClass()
    {
        $module = $this->getAttribute('module');

        if (! CustomModules::isKey($module)) {
            return self::MORPH;
        }

        CustomModules::registerMorph($module);

        return $module;
    }

    /* ---------- რეესტრების კითხვები ---------- */

    /** სტატუსის დომენი — მოდულის გასაღები (`HasStatus`) */
    public function statusDomain(): string
    {
        return (string) $this->module;
    }

    /**
     * „როდის დასრულდა" — FEAT-21-ის წესი: წლის მიზანი და თვეების ჭრილი
     * ნამდვილ თარიღს ითვლის და არა `updated_at`-ს.
     */
    protected function statusDoneColumn(): ?string
    {
        return 'finished_at';
    }

    /** აუდიტის მოდული — რიგისაა და არა კლასის (`Status::auditModule()`-ის წესი) */
    public function auditModule(): string
    {
        return (string) $this->module;
    }

    /* ---------- relations ---------- */

    public function customModule(): BelongsTo
    {
        return $this->belongsTo(Module::class, 'module', 'key');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(CustomCategory::class, 'category_id');
    }

    /* ---------- scopes ---------- */

    public function scopeForModule(Builder $query, string $key): Builder
    {
        return $query->where($query->getModel()->getTable().'.module', $key);
    }

    /* ---------- helpers ---------- */

    /**
     * ბმულის მიბმა — **ერთადერთი ადგილი**, სადაც `platform`/`external_id`/
     * `embed_url` იწერება (`GameVideo::applyUrl()`-ის წესი).
     *
     * ⚠️ ჩასართავი მისამართი მხოლოდ `VideoUrl`-ის ნებადართული სიიდანაა —
     * ნედლი HTML/embed არასდროს ინახება (პროექტის მკაცრი წესი). ბმული,
     * რომელსაც ეს სია არ ცნობს, უბრალო ბმულად რჩება.
     */
    public function applyUrl(?string $url): void
    {
        $url = $url !== null && trim($url) !== '' ? trim($url) : null;
        $this->url = $url;

        /* ⚠️ `file` (პირდაპირი `.mp4`) **დასაკრავია** — `embed_url`-ის გარეშე,
           `<video>`-ით (ფლეერის `PlayerStage`); `other` კი უბრალო ბმულია. */
        $parsed = $url ? VideoUrl::parse($url) : null;
        $playable = $parsed && $parsed['platform'] !== 'other';

        $this->platform = $playable ? $parsed['platform'] : null;
        $this->external_id = $playable ? $parsed['external_id'] : null;
        $this->embed_url = $playable ? $parsed['embed_url'] : null;
    }

    /** ბმულის ჰოსტი — ჯგუფისა და ბარათისთვის (`www.` იჭრება) */
    public function domain(): ?string
    {
        $host = $this->url ? parse_url($this->url, PHP_URL_HOST) : null;

        return $host ? preg_replace('/^www\./i', '', strtolower($host)) : null;
    }

    /**
     * ატვირთული ფოტოს წაშლა დისკიდან — ზომა კვოტიდან აქვე მოიხსნება
     * (`StorageMeter::deleteUpload()`).
     *
     * ⚠️ **გალერეის ფაილი აქ არ იშლება** (§37.4, `Place::deletePhoto()`-ის წესი):
     * „მთავარად დაყენება" სვეტს `gallery_images`-ის ფაილზე მიუთითებს და ის
     * ფოტოს რიგს ეკუთვნის — აქ წაშლა მის ფაილს წაშლიდა, კვოტას კი ორჯერ
     * დააბრუნებდა. წყაროს სვეტი არ არსებობს, ე.ი. ფესვით ვარჩევთ.
     */
    public function deletePhoto(): void
    {
        if ($this->photo_path && ! StorageFolder::inGallery($this->photo_path)) {
            app(StorageMeter::class)->deleteUpload($this->user_id, $this->photo_path);
        }
    }
}
