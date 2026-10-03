<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookmarkFileResource;
use App\Models\Bookmark;
use App\Models\BookmarkFile;
use App\Services\Storage\StorageMeter;
use App\Support\SafeMime;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * ბუკმარკის ფოტოები (Tasks §36.4) — „შოპინგის" სკრინშოტი, ჩემი გადაღებული ფოტო.
 *
 * ⚠️ **ვებიდან მოტანილი ფოტო აქ არ ჯდება** — ის `gallery_images`-შია
 * (`Bookmark` `HasGallery`-ს იყენებს და `GalleryParent`-შია). ადგილისა და
 * კურსის იგივე განაწილება.
 *
 * ⚠️ **MIME სერვერის მხრიდან იკითხება** (`SafeMime::ofUpload()`) და არა
 * კლიენტის განაცხადიდან — SEC-04-ის გაკვეთილი.
 */
class BookmarkFileController extends Controller
{
    public function __construct(private StorageMeter $meter) {}

    public function index(Bookmark $bookmark)
    {
        return BookmarkFileResource::collection($bookmark->files()->get());
    }

    public function store(Request $request, Bookmark $bookmark)
    {
        $data = $request->validate([
            // სახე ჯერ ერთია — ველი სხვა სექციების ფორმისთვისაა და ნაგულისხმევად `image`
            'kind' => ['nullable', Rule::in(Bookmark::FILE_KINDS)],
            'files' => ['required', 'array', 'max:20'],
            'files.*' => UploadLimits::rule('image', $request->user()),
        ]);

        // 17.3 — კვოტა **მთელ პაკეტზე** ჩაწერამდე: ნახევრად გასული ატვირთვა
        // ყველაზე მტკივნეული შედეგია
        $files = $request->file('files');
        $this->meter->guard($request->user(), array_sum(array_map(
            fn ($file) => (int) $file->getSize(),
            $files,
        )));

        $created = [];

        foreach ($files as $file) {
            $created[] = $bookmark->files()->create([
                'user_id' => $request->user()->id,
                'kind' => $data['kind'] ?? 'image',
                'path' => $this->meter->storeUpload($request->user(), $file, StorageFolder::BOOKMARK_IMAGES),
                'original_name' => $file->getClientOriginalName(),
                'mime' => SafeMime::ofUpload($file),
                'size' => $file->getSize(),
            ]);
        }

        return BookmarkFileResource::collection(collect($created))
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(BookmarkFile $bookmarkFile)
    {
        /* ⚠️ **ურნა (Tasks §29)** — `delete()` კი არა, `moveToTrash()`: ფაილი
           დისკზე და კვოტაში რჩება და ურნიდან ბრუნდება; ადგილი საბოლოო წაშლისას
           ან ვადის ამოწურვისას თავისუფლდება. სხვისი ფაილი global scope-ის
           გამო ისედაც 404-ია. */
        $bookmarkFile->moveToTrash();

        return response()->noContent();
    }
}
