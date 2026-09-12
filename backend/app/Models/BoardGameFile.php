<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\StoredFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ბორდგეიმზე მიმაგრებული ფაილი: `rules` = წესების PDF, `image` = გალერეის
 * ფოტო, `doc` = სხვა დოკუმენტი.
 *
 * ცხრილი **სექციისაა** (2026-09-03-ის წესი). წაშლა დისკიდან და კვოტიდან
 * `StoredFile`-ზეა.
 */
class BoardGameFile extends Model
{
    use BelongsToUser, StoredFile;

    protected $guarded = ['id'];

    protected $casts = [
        'size' => 'integer',
        'sort_order' => 'integer',
    ];

    public function boardGame(): BelongsTo
    {
        return $this->belongsTo(BoardGame::class);
    }
}
