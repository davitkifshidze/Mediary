<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasStatus;
use App\Models\Concerns\HasTags;
use App\Models\Concerns\HasTrash;
use App\Services\Storage\StorageMeter;
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

    /** სტატუსი — `statuses` ლექსიკონი, დომენი = მოდულის გასაღები */
    use HasStatus;

    /** FEAT-18 — ტეგების ერთი ქცევა (`Video::normalizeTags()`) */
    use HasTags;

    /** FEAT-11 → Tasks §29 — წაშლა ურნაშია (`moveToTrash()`) */
    use HasTrash;

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
        static::deleting(fn (CustomRecord $record) => $record->deletePhoto());
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
     */
    public function deletePhoto(): void
    {
        app(StorageMeter::class)->deleteUpload($this->user_id, $this->photo_path);
    }
}
