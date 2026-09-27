<?php

namespace App\Support;

use App\Models\TrashedFile;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

/**
 * **სვეტში შენახული ფაილი ურნაში (Tasks §29, ეტაპი 4)** — ჩანაწერის მთავარი
 * ფოტო (პოსტერი, ყდა, ესკიზი) და ავატარი.
 *
 * ასეთ ფაილს საკუთარი რიგი არ აქვს, ე.ი. `trashed_at` ვერ ექნება: ფაილის
 * აღწერა `trashed_files`-ში ინახება (`record_photo` · `avatar`), სვეტს კი
 * გამომძახებელი ასუფთავებს — ზუსტად ისე, როგორც დღემდე. ფაილი დისკზე და
 * კვოტაში რჩება, სანამ ურნიდან საბოლოოდ არ წაიშლება (`StoredFile`).
 *
 * ⚠️ **მხოლოდ შენი ატვირთული** — TMDB-ის, RAWG-ის, BGG-ისა და Open Library-ის
 * საერთო ფაილი (`*_source` ≠ `upload`) ურნაში არ მიდის: ის შენი არ არის და
 * ისედაც არ იშლება. ⚠️ **გალერეის ფოტოც არა** („მთავარად დაყენება" სვეტს
 * გალერეის ფაილზე მიუთითებს): ის `gallery_images`-ის რიგს ეკუთვნის, ე.ი.
 * აქ დაჭერა მის ფაილს ურნიდან წაშლიდა და კვოტას ორჯერ დააბრუნებდა.
 */
final class ColumnTrash
{
    /**
     * ფაილის აღწერა ურნაში. ⚠️ სვეტს **არ** ასუფთავებს — ამას გამომძახებელი
     * აკეთებს (ჩანაცვლებისას ახალი გზით, მოშორებისას `null`-ით).
     */
    public static function capture(Model $record, string $pathColumn, ?string $sourceColumn = null): void
    {
        $path = $record->getAttribute($pathColumn);

        if (! is_string($path) || $path === '' || StorageFolder::inGallery($path)) {
            return;
        }

        if ($sourceColumn !== null && $record->getAttribute($sourceColumn) !== 'upload') {
            return;
        }

        $isUser = $record instanceof User;
        $mime = null;

        try {
            $mime = Storage::disk(StorageFolder::diskFor($path))->mimeType($path) ?: null;
        } catch (\Throwable) {
            // ფაილი დისკზე აღარ არის — აღწერა მაინც იწერება, აღდგენა ცარიელ ფილას აჩვენებს
        }

        TrashedFile::capture(
            (int) ($isUser ? $record->getKey() : $record->getAttribute('user_id')),
            $isUser ? 'avatar' : 'record_photo',
            [
                'path' => $path,
                'name' => basename($path),
                'mime' => $mime,
                // ⚠️ დისკის ზომა — ზუსტად ის, რასაც `deleteUpload()` დააბრუნებდა
                'size' => app(StorageMeter::class)->sizeOf($path),
            ],
            $isUser ? 'user' : $record->getMorphClass(),
            (int) $record->getKey(),
            $pathColumn,
            $sourceColumn ? ['source_column' => $sourceColumn] : [],
        );
    }

    /**
     * **აღდგენა სვეტში** — ცარიელზე პირდაპირ, დაკავებულზე მხოლოდ `$replace`-ით
     * (29.2 — „სხვაგვარად ჯერ იკითხავს"): მაშინ ახლანდელი ფაილი თვითონ გადადის
     * ურნაში, ახალი კი მის ადგილს იკავებს.
     *
     * @return string|null უარის მიზეზი (`slot_taken`) ან `null` — აღდგა
     */
    public static function restore(Model $record, TrashedFile $file, bool $replace): ?string
    {
        $column = (string) $file->slot;
        $source = $file->meta['source_column'] ?? null;

        if ($record->getAttribute($column)) {
            if (! $replace) {
                return 'slot_taken';
            }

            self::capture($record, $column, $source);
        }

        $record->setAttribute($column, $file->path);

        if ($source) {
            $record->setAttribute($source, 'upload');
        }

        $record->save();

        // ⚠️ `deleteQuietly()` — `StoredFile` ფაილს და კვოტას არ უნდა შეეხოს
        $file->deleteQuietly();

        return null;
    }
}
