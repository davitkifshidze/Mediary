<?php

namespace App\Models\Concerns;

use App\Models\GalleryImage;
use App\Models\GalleryVideo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * გალერეის შიგთავსი ნებისმიერ ჩანაწერზე (Tasks 10 → §8) — ფილმი, სერიალი,
 * ანიმე, მსახიობი, სიმღერა, წიგნი, თამაში.
 *
 * ორი სახეა და ორი ცხრილი:
 *  · **ფოტო** (`gallery_images`) — ფაილია დისკზე, კვოტაში ითვლება;
 *  · **ვიდეო** (`gallery_videos`, §8.1) — მხოლოდ ბმულია, კვოტას არ ეხება.
 *
 * ⚠️ `morphs()` FK-cascade-ს არ ქმნის, ამიტომ მშობლის წაშლისას შიგთავსი
 * ხელით უნდა მოიხსნას — გამოიძახე **`deleteGalleryMedia()`** მოდელის
 * `deleting` ივენთში (იხ. `Movie::booted()`).
 *
 * ⚠️ **მეთოდს განზრახ აღარ ჰქვია `deleteGalleryImages()`.** ვიდეოს
 * დამატების შემდეგ ის სახელი იტყუებოდა — და სწორედ ასეთი სახელი ტოვებს
 * ორფან რიგებს: ვინც კოდს კითხულობს, „images" ხედავს და დარწმუნებულია,
 * რომ ვიდეოსთვის სხვა გამოძახება სადღაც არის.
 */
trait HasGallery
{
    public function galleryImages(): MorphMany
    {
        return $this->morphMany(GalleryImage::class, 'imageable')
            ->orderBy('sort_order')
            ->orderBy('id');
    }

    /** §8.1 — ამ ჩანაწერზე შენახული ვიდეო-ბმულები */
    public function galleryVideos(): MorphMany
    {
        return $this->morphMany(GalleryVideo::class, 'videoable')
            ->orderBy('sort_order')
            ->orderBy('id');
    }

    /**
     * ფოტოებიც და ვიდეოებიც — მშობლის წაშლისას.
     *
     * ⚠️ ფოტოები **სათითაოდ** იშლება: `GalleryImage::deleting` ფაილსაც შლის
     * და კვოტასაც ათავისუფლებს, მასობრივი `delete()` კი ივენთს არ ისვრის.
     * ვიდეოს ფაილი არ აქვს, ე.ი. მისი წაშლა ერთი მოთხოვნაა.
     */
    public function deleteGalleryMedia(): void
    {
        foreach ($this->galleryImages()->withoutGlobalScope('owner')->cursor() as $image) {
            $image->delete();
        }

        $this->galleryVideos()->withoutGlobalScope('owner')->delete();
    }
}
