<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoFileResource;
use App\Models\Video;
use App\Models\VideoFile;
use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Http\Request;

/**
 * ვიდეოზე მიმაგრებული ფაილები (K3) — ფოტოები და დოკუმენტები.
 *
 * ⚠️ ცხრილი **სექციისაა** (`video_files`) და არა უნივერსალური: სხვა მოდულს
 * ფაილები რომ დასჭირდეს, საკუთარი ცხრილი და კონტროლერი მოაქვს
 * (გადაწყვეტილება 2026-09-03).
 */
class VideoFileController extends Controller
{
    /** დოკუმენტების დაშვებული ტიპები — თვითნებური ფაილი არ აიტვირთება */
    public function __construct(private StorageMeter $meter) {}

    public function index(Video $video)
    {
        return VideoFileResource::collection($video->files()->get());
    }

    public function store(Request $request, Video $video)
    {
        $data = $request->validate([
            'kind' => ['required', 'in:image,doc'],
            'files' => ['required', 'array', 'max:50'],
            'files.*' => $request->input('kind') === 'doc'
                ? UploadLimits::rule('doc')
                : UploadLimits::rule('image'),
        ]);

        // 17.3 — კვოტა **მთელ პაკეტზე** მოწმდება ჩაწერამდე, რომ ატვირთვა
        // ნახევრად არ გავიდეს; `storeUpload()` მერე თითოზეც ამოწმებს
        $files = $request->file('files');
        $this->meter->guard($request->user(), array_sum(array_map(
            fn ($file) => (int) $file->getSize(),
            $files,
        )));

        // დისკზე საქაღალდე მოდულისაა: `videos/files/images` ან `videos/files/docs`
        $folder = StorageFolder::videoFiles($data['kind']);
        $next = (int) $video->files()->max('sort_order');

        $created = [];
        foreach ($files as $file) {
            $created[] = $video->files()->create([
                'user_id' => $request->user()->id,
                'kind' => $data['kind'],
                'path' => $this->meter->storeUpload($request->user(), $file, $folder),
                'original_name' => $file->getClientOriginalName(),
                'mime' => $file->getClientMimeType(),
                'size' => $file->getSize(),
                'sort_order' => ++$next,
            ]);
        }

        return VideoFileResource::collection(collect($created))
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(VideoFile $videoFile)
    {
        // global scope-ის გამო სხვისი ფაილი ისედაც 404-ია
        $videoFile->delete();

        return response()->noContent();
    }
}
