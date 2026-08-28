<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasAttachments;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

/**
 * ვიდეო (I5) — ნებისმიერი წყაროდან შენახული ბმული.
 * adult ჩანაწერი ცალკე მოდულით (`video_adult`) იფარება — იხ. scopeVisibleTo().
 */
class Video extends Model
{
    use BelongsToUser, HasAttachments;

    protected $guarded = ['id'];

    protected $casts = [
        'tags' => 'array',
        'duration' => 'integer',
        'is_adult' => 'boolean',
        'is_favorite' => 'boolean',
        'watch_count' => 'integer',
        'watched_at' => 'datetime',
        'sort_order' => 'integer',
    ];

    /** morphs() cascade-ს არ ქმნის — მიმაგრებული ფაილები/ჩანიშვნები ხელით იშლება (K3) */
    protected static function booted(): void
    {
        static::deleting(fn (Video $video) => $video->deleteAttachmentsAndNotes());
    }

    /** adult ჩანაწერები მხოლოდ იმას უჩანს, ვისაც `video_adult` მოდული აქვს */
    public function scopeVisibleTo(Builder $q, ?User $user): Builder
    {
        return $user && $user->hasModule('video_adult') ? $q : $q->where('is_adult', false);
    }

    /** ატვირთული thumbnail-ის დისკი — adult → private */
    public function thumbnailDisk(): string
    {
        return $this->thumbnail_disk ?: 'public';
    }

    public function deleteThumbnail(): void
    {
        if ($this->thumbnail_path) {
            Storage::disk($this->thumbnailDisk())->delete($this->thumbnail_path);
        }
    }
}
