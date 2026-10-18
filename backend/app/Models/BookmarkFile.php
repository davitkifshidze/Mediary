<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use App\Models\Concerns\StoredFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ბუკმარკზე მიმაგრებული ფოტო — „შოპინგის" სკრინშოტი, ჩემი
 * გადაღებული ფოტო (`kind = image`).
 *
 * ⚠️ **ვებიდან მოტანილი ფოტო აქ არ ჯდება** — ის `gallery_images`-შია
 * (`Bookmark` `HasGallery`-ს იყენებს და `GalleryParent`-შია). ადგილისა და
 * კურსის იგივე განაწილება: ჩემი ატვირთვა სექციის ცხრილში, მოტანილი — გალერეაში.
 */
class BookmarkFile extends Model
{
    /**
     * ⚠️ **ურნა** — `destroy()` `moveToTrash()`-ს იძახის: რიგი,
     * ფაილი და კვოტა ადგილზე რჩება, სანამ ურნიდან საბოლოოდ არ წაიშლება.
     * მშობლის საბოლოო წაშლა მას `trash` scope-ის გარეშე პოულობს.
     */
    use BelongsToUser, HasTrash, StoredFile;

    protected $guarded = ['id'];

    protected $casts = [
        'size' => 'integer',
    ];

    public function bookmark(): BelongsTo
    {
        return $this->belongsTo(Bookmark::class);
    }
}
