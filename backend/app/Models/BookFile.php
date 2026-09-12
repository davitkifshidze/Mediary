<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\StoredFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * წიგნზე მიმაგრებული ფაილი: `book` = თვითონ წიგნი (pdf/epub/mobi/fb2),
 * `image`/`doc` = თანმხლები.
 *
 * ცხრილი **სექციისაა** (2026-09-03-ის წესი) — უნივერსალური `attachments`
 * აღარ არსებობს. წაშლა დისკიდან და კვოტიდან `StoredFile`-ზეა.
 */
class BookFile extends Model
{
    use BelongsToUser, StoredFile;

    protected $guarded = ['id'];

    protected $casts = [
        'size' => 'integer',
        'sort_order' => 'integer',
    ];

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }
}
