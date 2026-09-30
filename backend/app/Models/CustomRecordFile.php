<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use App\Models\Concerns\StoredFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **პირადი მოდულის ჩანაწერზე მიმაგრებული ფაილი (Tasks §37.5)**:
 * `image` = ჩემი ფოტო (ვიტრინა), `doc` = თანმხლები დოკუმენტი.
 *
 * ⚠️ **ვებიდან მოტანილი ფოტო აქ არ ჯდება** — ის `gallery_images`-შია
 * (`CustomRecord` `HasGallery`-ს იყენებს). ჩემი ატვირთვა სექციის ცხრილში,
 * მოტანილი — გალერეაში.
 *
 * ⚠️ **ურნა (Tasks §29)** — `destroy()` `moveToTrash()`-ს იძახის: რიგი,
 * ფაილი და კვოტა ადგილზე რჩება; მშობლის საბოლოო წაშლა მას `trash` scope-ის
 * გარეშე პოულობს (`CustomRecord::booted()`).
 */
class CustomRecordFile extends Model
{
    use BelongsToUser, HasTrash, StoredFile;

    public const KINDS = ['image', 'doc'];

    protected $guarded = ['id'];

    protected $casts = [
        'size' => 'integer',
    ];

    public function record(): BelongsTo
    {
        return $this->belongsTo(CustomRecord::class, 'custom_record_id');
    }

    /** აუდიტის მოდული — რიგისაა (`CustomRecord::auditModule()`-ის წესი) */
    public function auditModule(): string
    {
        return (string) $this->module;
    }
}
