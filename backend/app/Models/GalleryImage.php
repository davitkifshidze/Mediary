<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\StoredFile;
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
