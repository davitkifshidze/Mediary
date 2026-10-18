<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use App\Models\Concerns\StoredFile;
use App\Services\Storage\StorageMeter;
use App\Support\RecordLocks;
use App\Support\StorageFolder;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * **ფოტო ან ვიდეო პირად გალერეაში** — მოწყობილობიდან ატვირთული.
 *
 * ⚠️ **ფაილი პირად დისკზეა** (`personal/…`, `StorageFolder::PRIVATE_ROOTS`) და
 * სერვერიდან მხოლოდ მფლობელობაშემოწმებული მარშრუტით გამოდის
 * (`GET /personal/media/{id}/file` — Range-ით, ვიდეოსთვის); `/storage/*` მას ვერ
 * ხედავს.
 *
 * ⚠️ **ორი ფაილი, ორი ზომა**: თვითონ ფაილი (`path`/`size`, `StoredFile`) და
 * ესკიზი (`thumb_path`/`thumb_size`) — ორივე შენი ატვირთვაა და კვოტაში ითვლება;
 * საბოლოო წაშლა ორივეს ათავისუფლებს.
 *
 * ⚠️ **ადამიანისა და ალბომის ნაწილია**: ურნაში მყოფი ადამიანის ან ალბომის
 * ფოტო არსად ჩანს (`personal_parent`), თვითონ კი ურნის ცალკე ელემენტია
 * (`TrashDomain::ITEMS['personal_media']`, მშობელი — ადამიანი).
 *
 * ⚠️ **ჩაკეტილი ადამიანის ან ალბომის ფოტოც არსად ჩანს** (`personal_lock`),
 * სანამ ის ამ სესიაში არ გაიხსნა — სია, ჯგუფები, ძებნა, ჯამები, ფაილის
 * მარშრუტი (მიბმა 404-ს აძლევს).
 */
class PersonalMedia extends Model
{
    use BelongsToUser, HasTrash, StoredFile;

    public const KINDS = ['photo', 'video'];

    protected $table = 'personal_media';

    protected $guarded = ['id'];

    protected $casts = [
        'person_id' => 'integer',
        'album_id' => 'integer',
        'size' => 'integer',
        'thumb_size' => 'integer',
        'width' => 'integer',
        'height' => 'integer',
        'duration' => 'integer',
        'taken_at' => 'datetime',
        'is_favorite' => 'boolean',
        'sort_order' => 'integer',
    ];

    protected static function booted(): void
    {
        /* **ურნაში მყოფი ადამიანის ან ალბომის ფოტო არსად ჩანს** — ის მშობელთან
           ერთად ურნაშია. ⚠️ `whereNull` ორივეგან აუცილებელია — `NULL NOT IN (…)`
           SQL-ში `NULL`-ია და უჯგუფო ფოტო ყველა სიიდან ამოვარდებოდა. */
        static::addGlobalScope('personal_parent', function (Builder $q) {
            $table = $q->getModel()->getTable();

            $q->where(fn (Builder $w) => $w
                ->whereNull("{$table}.person_id")
                ->orWhereNotIn("{$table}.person_id", fn ($sub) => $sub->select('id')->from('persons')->whereNotNull('trashed_at')))
                ->where(fn (Builder $w) => $w
                    ->whereNull("{$table}.album_id")
                    ->orWhereNotIn("{$table}.album_id", fn ($sub) => $sub->select('id')->from('personal_albums')->whereNotNull('trashed_at')));
        });

        /* **ჩაკეტილი ადამიანის ან ალბომის ფოტო** — სერვერიდან
           საერთოდ არ გამოდის, სანამ ამ სესიაში არ გაიხსნა (`AlbumLock`-ის წესი:
           რაც პასუხში არ მოვიდა, იმას ინსპექტორი ვერ იპოვის). */
        static::addGlobalScope('personal_lock', fn (Builder $q) => self::lockScope($q));

        /* ⚠️ ესკიზი `StoredFile`-ის გარეთაა (ის მხოლოდ `path`/`size`-ს იცნობს):
           ფაილი აქ იშლება, ბაიტები — `deleted`-ზე. ყდაც აქ თავისუფლდება, რომ
           ადამიანი/ალბომი არარსებულ ფოტოზე არ მიუთითებდეს. */
        static::deleting(function (PersonalMedia $media) {
            if ($media->thumb_path) {
                try {
                    Storage::disk(StorageFolder::diskFor($media->thumb_path))->delete($media->thumb_path);
                } catch (\Throwable) {
                    // ფაილი უკვე აღარაა — წაშლას ეს არ აჩერებს
                }
            }

            Person::withoutGlobalScopes()->where('cover_media_id', $media->id)->update(['cover_media_id' => null]);
            PersonalAlbum::withoutGlobalScopes()->where('cover_media_id', $media->id)->update(['cover_media_id' => null]);
        });

        static::deleted(function (PersonalMedia $media) {
            if ($media->user_id && $media->thumb_size) {
                app(StorageMeter::class)->addFor((int) $media->user_id, -(int) $media->thumb_size);
            }
        });
    }

    /* ---------- relations ---------- */

    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    public function album(): BelongsTo
    {
        return $this->belongsTo(PersonalAlbum::class, 'album_id');
    }

    /**
     * დამალული ადამიანებისა და ალბომების ფოტოების გარიცხვა.
     *
     * `$except` — რომელი მშობლის ლოკი **არ** ითვლება (`person_id`/`album_id`):
     * ჩაკეტილი ბარათის საკუთარი რიცხვი ლოკის მიღმა იზომება (ბარათი „0 ფოტოს"
     * იტყუებოდა — `GalleryAlbumController::imagesCount()`-ის წესი), სხვა ლოკები
     * კი რჩება — „გარე" ალბომში ჩაკეტილი ადამიანის ფოტოც დევს.
     */
    public static function lockScope(Builder $q, ?string $except = null): Builder
    {
        $table = $q->getModel()->getTable();

        foreach (['person_id' => 'personal', 'album_id' => 'personal_album'] as $column => $type) {
            if ($column !== $except) {
                RecordLocks::exclude($q, $type, "{$table}.{$column}");
            }
        }

        return $q;
    }

    /* ---------- helpers ---------- */

    public function isVideo(): bool
    {
        return $this->kind === 'video';
    }

    /** ფაილის მარშრუტი (API-ს გზა — SPA მას blob-ად ან `<video src>`-ად კითხულობს) */
    public function fileUrl(): string
    {
        return '/personal/media/'.$this->getKey().'/file';
    }

    /**
     * ესკიზის მარშრუტი; ⚠️ `?v=` ვერსიაა — ესკიზი ბრაუზერში დიდხანს იქეშება
     * (`Cache-Control`), ფაილის შეცვლა (ხელახალი ესკიზი) კი მისამართს ცვლის.
     */
    public function thumbUrl(): ?string
    {
        return $this->thumb_path
            ? '/personal/media/'.$this->getKey().'/thumb?v='.substr(md5((string) $this->thumb_path), 0, 8)
            : null;
    }

    /**
     * **ერთადერთად აღდგენისას მშობელი ალბომი შეიძლება ჯერ ურნაში იყოს** —
     * მაშინ ფოტო ალბომის გარეშე ბრუნდება (სხვაგვარად `personal_parent` მას
     * ისევ დამალავდა და „აღდგა" ტყუილი იქნებოდა). ადამიანს ურნა თვითონ
     * აბრუნებს (`TrashBin`-ის მშობლის წესი).
     */
    protected function afterTrashChange(bool $trashed): void
    {
        if ($trashed || ! $this->album_id) {
            return;
        }

        $albumTrashed = PersonalAlbum::withoutGlobalScopes()
            ->whereKey($this->album_id)
            ->whereNotNull('trashed_at')
            ->exists();

        if ($albumTrashed) {
            $this->album_id = null;
            $this->saveQuietly();
        }
    }
}
