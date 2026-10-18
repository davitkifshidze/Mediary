<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use App\Models\Concerns\StoredFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * კურსზე მიმაგრებული ფაილი: `image`/`doc` = თანმხლები (ეკრანის ასლი, კონსპექტი).
 * ⚠️ სერტიფიკატი (`certificate`) მოხსნილია — ძველი რიგები `doc`-ად გადავიდა.
 *
 * ცხრილი **სექციისაა** — უნივერსალური `attachments`
 * აღარ არსებობს. წაშლა დისკიდან და კვოტიდან `StoredFile`-ზეა.
 */
class CourseFile extends Model
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

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }
}
