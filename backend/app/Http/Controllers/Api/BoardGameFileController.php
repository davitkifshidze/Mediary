<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BoardGameFileResource;
use App\Models\BoardGame;
use App\Models\BoardGameFile;
use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Http\Request;

/**
 * ბორდგეიმის ფაილები (Tasks §14) — **წესების PDF**, გალერეის ფოტოები
 * (`kind = 'image'`) და სხვა დოკუმენტები.
 *
 * ⚠️ გალერეა აქაა და არა `gallery_images`-ში: ის ცხრილი TMDB-დან
 * **ჩამოტვირთულ** ფოტოებს ინახავს, user-ის ატვირთული კი სექციის ცხრილშია —
 * იგივე წესი, რაც ვიდეოზეა (`video_files.kind = 'image'`).
 */
class BoardGameFileController extends Controller
{
    /** წესები ხშირად სკანირებული PDF-ია — 30 MB რეალისტური ჭერია */
    public function __construct(private StorageMeter $meter) {}

    public function index(Request $request, BoardGame $boardGame)
    {
        $files = $boardGame->files()
            ->when($request->string('kind')->toString(), fn ($q, $kind) => $q->where('kind', $kind))
            ->get();

        return BoardGameFileResource::collection($files);
    }

    public function store(Request $request, BoardGame $boardGame)
    {
        $kind = $request->input('kind', 'rules');

        $data = $request->validate([
            'kind' => ['required', 'in:rules,image,doc'],
            'files' => ['required', 'array', 'max:20'],
            'files.*' => match ($kind) {
                'image' => UploadLimits::rule('image'),
                'doc' => UploadLimits::rule('doc'),
                default => UploadLimits::rule('rules'),
            },
        ]);

        // 17.3 — კვოტა **მთელ პაკეტზე** ჩაწერამდე
        $files = $request->file('files');
        $this->meter->guard($request->user(), array_sum(array_map(
            fn ($file) => (int) $file->getSize(),
            $files,
        )));

        $folder = StorageFolder::boardGameFiles($data['kind']);
        $next = (int) $boardGame->files()->max('sort_order');

        $created = [];
        foreach ($files as $file) {
            $created[] = $boardGame->files()->create([
                'user_id' => $request->user()->id,
                'kind' => $data['kind'],
                'path' => $this->meter->storeUpload($request->user(), $file, $folder),
                'original_name' => $file->getClientOriginalName(),
                'mime' => $file->getClientMimeType(),
                'size' => $file->getSize(),
                'sort_order' => ++$next,
            ]);
        }

        return BoardGameFileResource::collection(collect($created))
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(BoardGameFile $boardGameFile)
    {
        // global scope-ის გამო სხვისი ფაილი ისედაც 404-ია
        $boardGameFile->delete();

        return response()->noContent();
    }
}
