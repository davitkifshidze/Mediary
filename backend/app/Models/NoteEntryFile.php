<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\StoredFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ჩანაწერზე მიმაგრებული ფაილი (Tasks §13.1): `image` = სქრინშოტი/ფოტო,
 * `video` = ვიდეო, `doc` = დოკუმენტი.
 *
 * ცხრილი **სექციისაა** (2026-09-03-ის წესი). წაშლა დისკიდან და კვოტიდან
 * `StoredFile`-ზეა — ე.ი. §13.1-ის „ატვირთვა კვოტაზე გადის" ავტომატურად სრულდება.
 */
class NoteEntryFile extends Model
{
    use BelongsToUser, StoredFile;

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
