<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use App\Models\Concerns\StoredFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ჩანაწერზე მიმაგრებული ფაილი: `image` = სქრინშოტი/ფოტო,
 * `video` = ვიდეო, `doc` = დოკუმენტი.
 *
 * ცხრილი **სექციისაა**. წაშლა დისკიდან და კვოტიდან
 * `StoredFile`-ზეა — ე.ი. წესი „ატვირთვა კვოტაზე გადის" ავტომატურად სრულდება.
 */
class NoteEntryFile extends Model
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
        'sort_order' => 'integer',
    ];

    public function noteEntry(): BelongsTo
    {
        return $this->belongsTo(NoteEntry::class);
    }
}
