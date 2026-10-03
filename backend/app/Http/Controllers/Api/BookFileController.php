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
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Validator;

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

    /**
     * Tasks §23.1 — ⚠️ **`kind` არჩევითია: სახეს სერვერი გაფართოებით ხვდება.**
     * ფორმაში ერთი ზონაა („ჩააგდე ან აირჩიე"), სახის ჩიპები აღარ არის — `pdf/epub/
     * mobi/azw3/djvu/txt` → `book`, სურათი → `image`, დანარჩენი → `doc`; ENUM და
     * საქაღალდეები (`StorageFolder::bookFiles`) უცვლელია, ლიმიტი სახეზეა, როგორც იყო
     * (თითო ფაილი თავისი სახის წესით მოწმდება). ცხადი `kind` ძველებურად მოქმედებს.
     */
    public function store(Request $request, Book $book)
    {
        $data = $request->validate([
            'kind' => ['nullable', 'in:book,image,doc'],
            'files' => ['required', 'array', 'max:20'],
            'files.*' => ['file'],
        ]);

        $files = $request->file('files');
        $kinds = [];
        foreach ($files as $i => $file) {
            $kind = $data['kind'] ?? self::inferKind($file);
            Validator::make(['file' => $file], ['file' => UploadLimits::rule($kind, $request->user())], [], ['file' => "files.{$i}"])
                ->validate();
            $kinds[$i] = $kind;
        }

        // 17.3 — კვოტა **მთელ პაკეტზე** ჩაწერამდე
        $this->meter->guard($request->user(), array_sum(array_map(
            fn ($file) => (int) $file->getSize(),
            $files,
        )));

        $next = (int) $book->files()->max('sort_order');

        $created = [];
        foreach ($files as $i => $file) {
            $created[] = $book->files()->create([
                'user_id' => $request->user()->id,
                'kind' => $kinds[$i],
                'path' => $this->meter->storeUpload($request->user(), $file, StorageFolder::bookFiles($kinds[$i])),
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

    /** გაფართოება → სახე: ე-წიგნის ფორმატები (+ pdf/txt) წიგნია, სურათი — ფოტო, დანარჩენი — დოკუმენტი */
    public static function inferKind(UploadedFile $file): string
    {
        $ext = strtolower((string) $file->getClientOriginalExtension());

        if (in_array($ext, [...UploadLimits::CATALOG['ebook'], 'pdf', 'txt'], true)) {
            return 'book';
        }
        if (in_array($ext, [...UploadLimits::CATALOG['image'], 'jpeg'], true)) {
            return 'image';
        }

        return 'doc';
    }

    public function destroy(BookFile $bookFile)
    {
        /* ⚠️ **ურნა (Tasks §29)** — `delete()` კი არა, `moveToTrash()`: ფაილი
           დისკზე და კვოტაში რჩება და ურნიდან ბრუნდება; ადგილი საბოლოო წაშლისას
           ან ვადის ამოწურვისას თავისუფლდება. სხვისი ფაილი global scope-ის
           გამო ისედაც 404-ია. */
        $bookFile->moveToTrash();

        return response()->noContent();
    }
}
