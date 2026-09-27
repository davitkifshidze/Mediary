<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * წიგნის ჩანიშვნა ან **ციტატა** (Tasks §12).
 *
 * ციტატა ჩვეულებრივი ჩანიშვნისგან მხოლოდ ორი ველით განსხვავდება
 * (`is_quote` + `page`), ე.ი. ცალკე ცხრილს არ იმსახურებს.
 */
class BookNote extends Model
{
    /**
     * ⚠️ **ურნა (Tasks §29, ეტაპი 2)** — `destroy()` `moveToTrash()`-ს იძახის;
     * რიგი ადგილზე რჩება და ურნიდან ბრუნდება.
     */
    use BelongsToUser, HasTrash;

    protected $guarded = ['id'];

    protected $casts = [
        'is_quote' => 'boolean',
        'page' => 'integer',
    ];

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }
}
