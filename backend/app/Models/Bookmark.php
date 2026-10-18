<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasGallery;
use App\Models\Concerns\HasStatus;
use App\Models\Concerns\HasTags;
use App\Models\Concerns\HasTrash;
use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * ბუკმარკი — მოდული `bookmark`.
 *
 * ⚠️ **გარე წყარო არ არსებობს.** TMDB/RAWG/BGG-ის ანალოგი ბმულებზე არ არის;
 * მეტამონაცემი თვითონ გვერდიდან მოდის (`Services\Bookmarks\LinkMetadata`),
 * ე.ი. „lookup კანდიდატების" ნაკადიც არ გვჭირდება — ერთი probe ჰყოფნის.
 *
 * ⚠️ **კატეგორია ერთია** (`category_id`), განსხვავებით სიმღერისა და თამაშისგან:
 * კატეგორია აქ საქაღალდეა, დანარჩენ ჭრილს `tags` ფარავს.
 *
 * ⚠️ **`domain` სვეტია და არა აქსესორი** — მასზე ხდება ფილტრი და დაჯგუფება,
 * რასაც SQL-ში სვეტის გარეშე ვერ მოვახერხებდით. ერთადერთი ადგილი, სადაც
 * ივსება, `applyUrl()`-ია (იგივე წესი, რაც `GameVideo::applyUrl()`-ზე).
 *
 * ⚠️ **გალერეის მშობელია** (`HasGallery` + `GalleryParent`):
 * ვებიდან მოტანილი ფოტო `gallery_images`-შია, ჩემი ატვირთული („შოპინგის"
 * სკრინშოტი) — `bookmark_files`-ში, დამატებითი ბმულები კი `links` სვეტში.
 * მთავარი ფოტოს წყაროს სვეტი განზრახ არ არსებობს (ადგილის წესი): გალერეიდან
 * არჩეული ფოტოს გზაც `thumbnail_path`-შია და მას `StorageFolder::inGallery()`
 * არჩევს — ერთი ფაილი კვოტაში ორჯერ არ იხდის.
 */
class Bookmark extends Model
{
    use BelongsToUser;

    /** მორგებულ ველზე ატვირთული ფაილები (წაშლა → დისკი + კვოტა) */
    use HasCustomFields;

    /** `gallery_images` + `gallery_videos` ამ ჩანაწერზე */
    use HasGallery;

    /** სტატუსი per-user ლექსიკონია (`statuses`), enum-ი აღარაა */
    use HasStatus;

    /** ტეგების ერთი ქცევა (`Video::normalizeTags()`) */
    use HasTags;

    /**
     * ⚠️ **კალათა** — `destroy()` `moveToTrash()`-ს იძახის და არა
     * `delete()`-ს; `trash` scope წაშლილს ყველა ჩვეულებრივ query-ს მალავს.
     */
    use HasTrash;

    /**
     * **დამატებითი ბმულის „რა არის"** — `links[].kind`.
     * ⚠️ SPA-ს `BOOKMARK_LINK_KINDS` ამის სარკეა (`RegistryConsistencyTest`).
     */
    public const LINK_KINDS = ['shop', 'price', 'review', 'video', 'docs', 'other'];

    /**
     * ფასი მხოლოდ ამ ტიპებზე ინახება — მაღაზიისა და ფასის ბმულზე.
     * ⚠️ სხვაზე ჩაწერილი ფასი ჩუმად იჭრება: მიმოხილვის „ფასი" აზრს მოკლებულია.
     */
    public const PRICED_LINK_KINDS = ['shop', 'price'];

    /** ერთ ბუკმარკზე მაქსიმუმ რამდენი დამატებითი ბმული */
    public const MAX_LINKS = 20;

    /** მიმაგრებული ფაილის სახეები — ჯერ მხოლოდ ფოტო */
    public const FILE_KINDS = ['image'];

    protected $guarded = ['id'];

    /* ⚠️ სტატუსი ყოველთვის იტვირთოს: სიაში ბეჯი, ფილტრი და როლი
       ყველგან სჭირდება, ცალკე `with()` კი ოცამდე ადგილას დაგვავიწყდებოდა. */
    protected $with = ['status'];

    protected $casts = [
        'tags' => 'array',
        // `[{label, url, kind, price, favicon_url}]` (`normalizeLinks()`)
        'links' => 'array',
        'is_favorite' => 'boolean',
        'visit_count' => 'integer',
        'visited_at' => 'datetime',
        'sort_order' => 'integer',
    ];

    /**
     * ⚠️ **თამბნეილი აქ იშლება და არა კონტროლერში**: `PurgeService`
     * პირდაპირ `$record->delete()`-ს აკეთებს, ე.ი. მასობრივი წაშლა ფაილს
     * დისკზე დატოვებდა და კვოტას სამუდამოდ დაკავებულს (იგივე წესი, რაც `Song`-ზე).
     */
    protected static function booted(): void
    {
        static::deleting(function (Bookmark $bookmark) {
            $bookmark->deleteThumbnail();

            /* ⚠️ **ფაილები სათითაოდ და `trash` scope-ის გარეშე**:
               SQL-ის კასკადი მოდელის ივენთს არ ისვრის,
               ე.ი. ფაილი დისკზე და კვოტა მრიცხველში დარჩებოდა; ურნაში მყოფი
               ფაილი კი scope-ით ვერც მოიძებნებოდა. */
            $bookmark->files()->withoutGlobalScopes(['owner', 'trash'])->get()->each->delete();

            $bookmark->deleteGalleryMedia();
        });
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

    /** ჩემი ატვირთული ფოტოები */
    public function files(): HasMany
    {
        return $this->hasMany(BookmarkFile::class)->orderByDesc('id');
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
     * **დამატებითი ბმულების ნორმალიზება — ერთადერთი ადგილი**.
     *
     * ცარიელი წარწერა `null`-ია, უცნობი ტიპი — `other`, ფასი მხოლოდ
     * `PRICED_LINK_KINDS`-ზე რჩება, ცარიელმისამართიანი რიგი ქრება.
     *
     * @param  array<int, array<string, mixed>>  $links
     * @return list<array{label: ?string, url: string, kind: string, price: ?string, favicon_url: ?string}>
     */
    public static function normalizeLinks(array $links): array
    {
        $out = [];

        foreach ($links as $link) {
            $url = trim((string) ($link['url'] ?? ''));

            if ($url === '') {
                continue;
            }

            $kind = in_array($link['kind'] ?? null, self::LINK_KINDS, true) ? $link['kind'] : 'other';
            $label = trim((string) ($link['label'] ?? ''));
            $price = trim((string) ($link['price'] ?? ''));

            $out[] = [
                'label' => $label !== '' ? $label : null,
                'url' => $url,
                'kind' => $kind,
                'price' => $price !== '' && in_array($kind, self::PRICED_LINK_KINDS, true) ? $price : null,
                'favicon_url' => self::faviconOrNull($link['favicon_url'] ?? null),
            ];
        }

        return array_slice($out, 0, self::MAX_LINKS);
    }

    /**
     * ხატულა მხოლოდ `http(s)`-ის ნამდვილი მისამართია, 500 სიმბოლომდე —
     * დანარჩენი (`data:`, `javascript:`, ზედმეტად გრძელი) ჩუმად ქრება.
     */
    private static function faviconOrNull(mixed $value): ?string
    {
        $favicon = trim((string) $value);

        return $favicon !== ''
            && mb_strlen($favicon) <= 500
            && preg_match('#^https?://#i', $favicon)
            && filter_var($favicon, FILTER_VALIDATE_URL) !== false
                ? $favicon
                : null;
    }

    /**
     * ატვირთული ფოტოს წაშლა დისკიდან — ზომა კვოტიდან აქვე მოიხსნება,
     * ე.ი. ყველა გზა (ჩანაცვლება, „მოშორება", ჩანაწერის წაშლა) მრიცხველს
     * სწორად ტოვებს.
     *
     * ⚠️ **გალერეის ფოტო აქ არ იშლება** (ადგილის წესი) —
     * „მთავარად დაყენებული" გალერეის ფოტოს გზაც ამავე სვეტშია. მისი წაშლა
     * გალერეის რიგს გატეხილ ფოტოდ დატოვებდა და კვოტას ორჯერ დააბრუნებდა;
     * ფაილი გალერეის რიგთან ერთად იშლება (`deleteGalleryMedia()`).
     */
    public function deleteThumbnail(): void
    {
        if ($this->thumbnail_path && ! StorageFolder::inGallery($this->thumbnail_path)) {
            app(StorageMeter::class)->deleteUpload($this->user_id, $this->thumbnail_path);
        }
    }
}
