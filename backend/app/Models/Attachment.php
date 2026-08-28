<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Facades\Storage;

/**
 * მიმაგრებული ფაილი (K3) — ფოტო ან დოკუმენტი, ნებისმიერ მოდელზე.
 */
class Attachment extends Model
{
    use BelongsToUser;

    protected $guarded = ['id'];

    protected $casts = [
        'size' => 'integer',
        'sort_order' => 'integer',
    ];

    protected static function booted(): void
    {
        // ფაილი დისკზე ჩანაწერთან ერთად წაიშალოს
        static::deleting(fn (Attachment $a) => $a->deleteFile());
    }

    public function attachable(): MorphTo
    {
        return $this->morphTo();
    }

    public function isPrivate(): bool
    {
        return $this->disk !== 'public';
    }

    public function deleteFile(): void
    {
        try {
            Storage::disk($this->disk)->delete($this->path);
        } catch (\Throwable) {
            // ფაილი უკვე აღარაა — ჩანაწერის წაშლას ეს არ უნდა შეაჩეროს
        }
    }
}
