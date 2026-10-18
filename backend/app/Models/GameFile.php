<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use App\Models\Concerns\StoredFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * თამაშზე მიმაგრებული ფაილი: `image` = **ატვირთული** სქრინშოტი/artwork,
 * `doc` = სხვა დოკუმენტი (გაიდი, სეივი, კონფიგი).
 *
 * ⚠️ RAWG-იდან **ჩამოტვირთული** კადრები აქ არ ხვდება — ისინი
 * `gallery_images`-შია. იგივე გაყოფაა ვიდეოსა და
 * ბორდგეიმზე. წაშლა დისკიდან და კვოტიდან `StoredFile`-ზეა.
 */
class GameFile extends Model
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

    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class);
    }
}
