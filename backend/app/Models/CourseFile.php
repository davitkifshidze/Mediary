<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\StoredFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * კურსზე მიმაგრებული ფაილი: `certificate` = დამთავრების სერტიფიკატი,
 * `image`/`doc` = თანმხლები (ეკრანის ასლი, კონსპექტი).
 *
 * ცხრილი **სექციისაა** (2026-09-03-ის წესი) — უნივერსალური `attachments`
 * აღარ არსებობს. წაშლა დისკიდან და კვოტიდან `StoredFile`-ზეა.
 */
class CourseFile extends Model
{
    use BelongsToUser, StoredFile;

    protected $guarded = ['id'];

    protected $casts = [
        'size' => 'integer',
    ];

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }
}
