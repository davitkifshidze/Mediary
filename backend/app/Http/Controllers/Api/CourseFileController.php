<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CourseFileResource;
use App\Models\Course;
use App\Models\CourseFile;
use App\Services\Storage\StorageMeter;
use App\Support\SafeMime;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Http\Request;

/**
 * კურსის ფაილები (FEAT-25) — `certificate` = დამთავრების სერტიფიკატი,
 * `image`/`doc` = თანმხლები.
 *
 * ⚠️ **სერტიფიკატი ცალკე `kind`-ია და არა უბრალოდ „დოკუმენტი"**: სწორედ
 * ის არის, რასაც ტასქი ითხოვს, და ინტერფეისში ის ცალკე ბლოკია — ერთ
 * გროვაში ჩაყრილი კონსპექტებიდან მისი გამორჩევა შეუძლებელი იქნებოდა.
 *
 * ⚠️ **MIME სერვერის მხრიდან იკითხება** (`SafeMime::ofUpload()`) და არა
 * კლიენტის განაცხადიდან — SEC-04-ის გაკვეთილი: ატვირთვის header-ი
 * მომხმარებლის სათქმელია და არა ფაქტი.
 */
class CourseFileController extends Controller
{
    public function __construct(private StorageMeter $meter) {}

    public function index(Course $course)
    {
        return CourseFileResource::collection($course->files()->get());
    }

    public function store(Request $request, Course $course)
    {
        $kind = $request->input('kind', 'doc');

        $data = $request->validate([
            'kind' => ['required', 'in:certificate,image,doc'],
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

        $folder = StorageFolder::courseFiles($data['kind']);

        $created = [];

        foreach ($files as $file) {
            $created[] = $course->files()->create([
                'user_id' => $request->user()->id,
                'kind' => $data['kind'],
                'path' => $this->meter->storeUpload($request->user(), $file, $folder),
                'original_name' => $file->getClientOriginalName(),
                'mime' => SafeMime::ofUpload($file),
                'size' => $file->getSize(),
            ]);
        }

        return CourseFileResource::collection(collect($created))
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(CourseFile $courseFile)
    {
        // global scope-ის გამო სხვისი ფაილი ისედაც 404-ია;
        // დისკიდან წაშლასა და კვოტის დაბრუნებას `StoredFile` აკეთებს
        $courseFile->delete();

        return response()->noContent();
    }
}
