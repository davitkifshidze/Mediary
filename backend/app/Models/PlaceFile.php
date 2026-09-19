<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\StoredFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ადგილზე მიმაგრებული ფაილი: `image` = ჩემი გადაღებული ფოტო,
 * `doc` = თანმხლები (ბილეთი, ბროშურა).
 *
 * ⚠️ **ვებიდან მოტანილი ფოტო აქ არ ჯდება** — ის `gallery_images`-შია
 * (`Place` `HasGallery`-ს იყენებს). ზუსტად ის განაწილება, რაც ვიდეოსა
 * და სამაგიდო თამაშს აქვს: ჩემი ატვირთვა სექციის ცხრილში, მოტანილი —
 * გალერეაში.
 */
class PlaceFile extends Model
{
    use BelongsToUser, StoredFile;

    protected $guarded = ['id'];

    protected $casts = [
        'size' => 'integer',
    ];

    public function place(): BelongsTo
    {
        return $this->belongsTo(Place::class);
    }
}
