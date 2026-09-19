<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlaceFileResource;
use App\Models\Place;
use App\Models\PlaceFile;
use App\Services\Storage\StorageMeter;
use App\Support\SafeMime;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Http\Request;

/**
 * ადგილის ფაილები (FEAT-26) — `image` = ჩემი გადაღებული ფოტო,
 * `doc` = თანმხლები (ბილეთი, ბროშურა).
 *
 * ⚠️ **ვებიდან მოტანილი ფოტო აქ არ ჯდება** — ის `gallery_images`-შია
 * (`Place` `HasGallery`-ს იყენებს და `GalleryParent`-შია). ვიდეოსა და
 * სამაგიდო თამაშის იგივე განაწილება.
 *
 * ⚠️ **MIME სერვერის მხრიდან იკითხება** (`SafeMime::ofUpload()`) და არა
 * კლიენტის განაცხადიდან — SEC-04-ის გაკვეთილი.
 */
class PlaceFileController extends Controller
{
    public function __construct(private StorageMeter $meter) {}

    public function index(Place $place)
    {
        return PlaceFileResource::collection($place->files()->get());
    }

    public function store(Request $request, Place $place)
    {
        $kind = $request->input('kind', 'image');

        $data = $request->validate([
            'kind' => ['required', 'in:image,doc'],
            'files' => ['required', 'array', 'max:20'],
            'files.*' => $kind === 'image' ? UploadLimits::rule('image') : UploadLimits::rule('doc'),
        ]);

        // 17.3 — კვოტა **მთელ პაკეტზე** ჩაწერამდე: ნახევრად გასული ატვირთვა
        // ყველაზე მტკივნეული შედეგია
        $files = $request->file('files');
        $this->meter->guard($request->user(), array_sum(array_map(
            fn ($file) => (int) $file->getSize(),
            $files,
        )));

        $folder = StorageFolder::placeFiles($data['kind']);

        $created = [];

        foreach ($files as $file) {
            $created[] = $place->files()->create([
                'user_id' => $request->user()->id,
                'kind' => $data['kind'],
                'path' => $this->meter->storeUpload($request->user(), $file, $folder),
                'original_name' => $file->getClientOriginalName(),
                'mime' => SafeMime::ofUpload($file),
                'size' => $file->getSize(),
            ]);
        }

        return PlaceFileResource::collection(collect($created))
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(PlaceFile $placeFile)
    {
        // global scope-ის გამო სხვისი ფაილი ისედაც 404-ია;
        // დისკიდან წაშლასა და კვოტის დაბრუნებას `StoredFile` აკეთებს
        $placeFile->delete();

        return response()->noContent();
    }
}
