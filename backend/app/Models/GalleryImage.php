<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\StoredFile;
use App\Support\AlbumLock;
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
