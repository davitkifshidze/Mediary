<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookFileResource;
use App\Models\Book;
use App\Models\BookFile;
use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Http\Request;

/**
 * წიგნის ფაილები (Tasks §12) — `book` = pdf/epub, `image`/`doc` = თანმხლები.
 *
 * ⚠️ **ერთეულზე ყველაზე მძიმე ატვირთვა მთელ პროექტში** (§12-ის შენიშვნა:
 * 10–50 MB), ამიტომ კვოტა **პაკეტზეც** მოწმდება და თითოზეც — ნახევრად
 * გასული ატვირთვა აქ განსაკუთრებით მტკივნეულია.
 */
class BookFileController extends Controller
{
    /** თვითონ წიგნის ფაილები — მხოლოდ საკითხავი ფორმატები */
    /** 50 MB — §12-ის „ყველაზე მძიმეა ერთეულზე (10–50 MB)" */
    public function __construct(private StorageMeter $meter) {}

    public function index(Book $book)
    {
        return BookFileResource::collection($book->files()->get());
    }

    public function store(Request $request, Book $book)
    {
        $kind = $request->input('kind', 'book');

        $data = $request->validate([
            'kind' => ['required', 'in:book,image,doc'],
            'files' => ['required', 'array', 'max:20'],
            'files.*' => match ($kind) {
                'image' => UploadLimits::rule('image'),
                'doc' => UploadLimits::rule('doc'),
                default => UploadLimits::rule('book'),
            },
        ]);

        // 17.3 — კვოტა **მთელ პაკეტზე** ჩაწერამდე
        $files = $request->file('files');
        $this->meter->guard($request->user(), array_sum(array_map(
            fn ($file) => (int) $file->getSize(),
            $files,
        )));

        $folder = StorageFolder::bookFiles($data['kind']);
        $next = (int) $book->files()->max('sort_order');

        $created = [];
        foreach ($files as $file) {
            $created[] = $book->files()->create([
                'user_id' => $request->user()->id,
                'kind' => $data['kind'],
                'path' => $this->meter->storeUpload($request->user(), $file, $folder),
                'original_name' => $file->getClientOriginalName(),
                'mime' => $file->getClientMimeType(),
                'size' => $file->getSize(),
                'sort_order' => ++$next,
            ]);
        }

        return BookFileResource::collection(collect($created))
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(BookFile $bookFile)
    {
        // global scope-ის გამო სხვისი ფაილი ისედაც 404-ია
        $bookFile->delete();

        return response()->noContent();
    }
}
