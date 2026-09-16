<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\StoredFile;
use App\Support\AlbumLock;
use App\Support\StorageFolder;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * გალერეის ფოტო (Tasks 10) — საკუთარი ცხრილი `gallery_images`.
 *
 * **polymorphic განზრახაა**: ერთი და იგივე ფოტო-ლოგიკა ჰკიდია ფილმს,
 * სერიალს, **მსახიობს** და სიმღერას. `collection` სვეტი აღარ არსებობს —
 * ცხრილი თვითონ არის კოლექცია.
 */
class GalleryImage extends Model
{
    use BelongsToUser, StoredFile;

    protected $guarded = ['id'];

    protected $casts = [
        'size' => 'integer',
        'sort_order' => 'integer',
        'width' => 'integer',
        'height' => 'integer',
    ];

    /**
     * **ჩაკეტილი ალბომის ფოტო არსაიდან არ ჩანს (2026-09-16).**
     *
     * ⚠️ **global scope და არა `where` გალერეის კონტროლერში.** ფოტოს
     * კითხულობს ათზე მეტი ადგილი — სია, ჯგუფები, ესკიზები, შეჯამება,
     * დეშბორდის მთვლელი, ჩამოტვირთვის გეგმა — და ერთი დავიწყებული query
     * ლოკს **ჩუმად** გააუქმებდა. სწორედ ის მიზეზი, რის გამოც მფლობელობა
     * `owner` scope-ია და არა ხელით დაწერილი პირობა.
     *
     * ⚠️ **`whereNotIn` მარტო არ გამოდგება**: SQL-ში `NULL NOT IN (…)`
     * არის `NULL`, ე.ი. **უალბომო ფოტო ყველა სიიდან ამოვარდებოდა** —
     * ერთი ჩაკეტილი ალბომი მთელ „უკატეგორიოს" გააქრობდა.
     *
     * ⚠️ **წაშლა/კვოტა scope-ს ცხადად იხსნის** (`HasGallery::deleteGalleryMedia()`,
     * `PurgeService`, `GalleryFetcher`-ის დედუპლიკაცია): დამალული ფოტო
     * ჩანაწერთან ერთად რომ არ წაშლილიყო, დისკზე დარჩებოდა ობლად და
     * კვოტას სამუდამოდ დაიკავებდა.
     */
    protected static function booted(): void
    {
        static::addGlobalScope('album_lock', function (Builder $q) {
            $hidden = AlbumLock::hiddenIds();
            if (! $hidden) {
                return;
            }

            $table = $q->getModel()->getTable();
            $q->where(fn (Builder $w) => $w
                ->whereNull($table.'.album_id')
                ->orWhereNotIn($table.'.album_id', $hidden));
        });
    }

    public function imageable(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * **ფაილი პირად დისკზეა?** (Tasks §7.9 — ჩაკეტილი ალბომის `gallery/locked`).
     *
     * ⚠️ დისკს `StorageFolder` წყვეტს და არა აქაური `str_starts_with`: ერთი
     * წესი, ერთი ადგილი (`StorageMeter::disk()`-ის იგივე მიზეზი).
     */
    public function isPrivate(): bool
    {
        return StorageFolder::isPrivate((string) $this->path);
    }

    /**
     * **მისამართი, რომლითაც SPA ამ ფოტოს ხატავს (2026-09-17).**
     *
     * საჯარო დისკზე — storage-ის გზა (ფრონტი `storageUrl()`-ით აწყობს);
     * პირად დისკზე — **API-ის მარშრუტი** `GET /gallery/images/{id}/file`
     * (`ModulePhoto`-ს იგივე ფორმა: „საჯაროზე გზა, პრივატულზე მისამართი").
     *
     * ⚠️ **ეს იყო ცოცხალი ხარვეზი**: `AlbumVault` ჩაკეტილი ალბომის ფაილებს
     * პირად დისკზე გადაიტანს, resource-ი კი შიშველ `path`-ს აბრუნებდა — ე.ი.
     * პაროლის შეყვანის შემდეგ SPA `/storage/gallery/locked/…`-ს აწყობდა,
     * რომელიც პირად დისკზე **არ არსებობს**, და გახსნილი ალბომი გატეხილ
     * `<img>`-ებად იხატებოდა („პაროლი შევიყვანე და ფოტოები არ ჩანს").
     * მისამართს backend ამბობს (§17.5-ის წესი) — `PRIVATE_FOLDERS`-ის ასლი
     * SPA-ში ერთ დღეს დაშორდებოდა.
     */
    public function servedUrl(): string
    {
        return $this->isPrivate() ? '/gallery/images/'.$this->getKey().'/file' : (string) $this->path;
    }

    /**
     * ერთი ესკიზი დასტისთვის (`previews`).
     *
     * ⚠️ **საჯაროზე უბრალო სტრიქონია, პრივატულზე ობიექტი** `{url, private}`:
     * `PhotoStack`-ს პრივატული ფაილი blob-ად უნდა წაიკითხოს, სტრიქონი კი ამას
     * ვერ ეტყოდა. ჩვეულებრივი გზა ხელუხლებელი რჩება (ტესტები და მოხმარებლები
     * იმავე სტრიქონს ხედავენ), განსხვავება მხოლოდ იქ ჩნდება, სადაც მართლა
     * არის.
     *
     * @return string|array{url: string, private: true}
     */
    public function preview(): string|array
    {
        return $this->isPrivate() ? ['url' => $this->servedUrl(), 'private' => true] : (string) $this->path;
    }

    /**
     * ალბომი (Tasks §26) — user-ის თავისი დახარისხება.
     *
     * ⚠️ **მშობლისგან დამოუკიდებელია**: ფოტოს შეიძლება ჰქონდეს ორივე,
     * ერთი ან არცერთი. უმშობლო ფოტო „უკატეგორიოა" და სწორედ იქ აქვს
     * ალბომს აზრი, თუმცა ცალკე შეზღუდვას არ ვწერთ — ალბომში ჩაგდებული
     * ფილმის კადრიც კანონიერია.
     */
    public function album(): BelongsTo
    {
        return $this->belongsTo(GalleryAlbum::class, 'album_id');
    }
}
