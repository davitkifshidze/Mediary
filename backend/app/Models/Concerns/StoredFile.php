<?php

namespace App\Models\Concerns;

use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
use Illuminate\Support\Facades\Storage;

/**
 * ერთი ატვირთული ფაილის ჩანაწერი — საერთო ქცევა ყველა სექციის ცხრილისთვის
 * (`gallery_images`, `video_files`, ხვალ `book_files`…).
 *
 * ორი გარანტია, რომელიც აქ ერთხელაა ჩაწერილი და ყველგან მოქმედებს:
 *  · ჩანაწერის წაშლა **დისკიდანაც** შლის ფაილს;
 *  · წაშლილი ბაიტები **კვოტიდან** თავისუფლდება (17.1) — ცალკე წაშლაზეც და
 *    მშობლის კასკადზეც, რადგან კასკადი თითოეულ ჩანაწერს ცალკე შლის.
 *
 * ⚠️ მოდელს უნდა ჰქონდეს `path`, `size` და `user_id`.
 */
trait StoredFile
{
    protected static function bootStoredFile(): void
    {
        static::deleting(fn ($model) => $model->deleteFile());

        static::deleted(function ($model) {
            if ($model->user_id && $model->size) {
                app(StorageMeter::class)->addFor((int) $model->user_id, -(int) $model->size);
            }
        });
    }

    public function deleteFile(): void
    {
        try {
            // ⚠️ დისკი გზიდან გამომდინარეობს (§17.5): `notes/` პრივატულზეა.
            // ჩაწერილი `'public'` პრივატულ ფაილს დისკზე დატოვებდა — ჩანაწერი
            // გაქრებოდა, ფაილი კი სამუდამოდ ობოლი გახდებოდა.
            Storage::disk(StorageFolder::diskFor((string) $this->path))->delete($this->path);
        } catch (\Throwable) {
            // ფაილი უკვე აღარაა — ჩანაწერის წაშლას ეს არ უნდა შეაჩეროს
        }
    }
}
