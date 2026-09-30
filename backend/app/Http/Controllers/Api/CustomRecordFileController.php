<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CustomRecordFileResource;
use App\Models\CustomRecord;
use App\Models\CustomRecordFile;
use App\Services\Storage\StorageMeter;
use App\Support\SafeMime;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Http\Request;

/**
 * **პირადი მოდულის ჩანაწერის ფაილები (Tasks §37.5)** — `image` = ჩემი ფოტო,
 * `doc` = თანმხლები დოკუმენტი. ადგილის/თამაშის ფაილების ზუსტი ფორმა.
 *
 * ⚠️ **ჩანაწერი მოდულითაც მოწმდება** — ერთი ცხრილი ყველა პირად მოდულს
 * ემსახურება, ე.ი. `/custom/c5-a/7/files` სხვა მოდულის ჩანაწერს ვერ შეეხება
 * (404). სხვისი ჩანაწერი ისედაც 404-ია (`owner` scope + `EnsureRecordOwnership`).
 *
 * ⚠️ **MIME სერვერის მხრიდან იკითხება** (`SafeMime::ofUpload()`) — SEC-04.
 */
class CustomRecordFileController extends Controller
{
    public function __construct(private StorageMeter $meter) {}

    public function index(Request $request, string $type, CustomRecord $record)
    {
        abort_unless($record->module === $type, 404);

        $kind = $request->query('kind');

        return CustomRecordFileResource::collection(
            $record->files()
                ->when(in_array($kind, CustomRecordFile::KINDS, true), fn ($q) => $q->where('kind', $kind))
                ->get(),
        );
    }

    public function store(Request $request, string $type, CustomRecord $record)
    {
        abort_unless($record->module === $type, 404);

        $kind = $request->input('kind', 'image');

        $data = $request->validate([
            'kind' => ['required', 'in:'.implode(',', CustomRecordFile::KINDS)],
            'files' => ['required', 'array', 'max:20'],
            'files.*' => UploadLimits::rule($kind === 'doc' ? 'doc' : 'image', $request->user()),
        ]);

        // 17.3 — კვოტა **მთელ პაკეტზე** ჩაწერამდე: ნახევრად გასული ატვირთვა
        // ყველაზე მტკივნეული შედეგია
        $files = $request->file('files');
        $this->meter->guard($request->user(), array_sum(array_map(
            fn ($file) => (int) $file->getSize(),
            $files,
        )));

        // ⚠️ საქაღალდე მოდულისაა (`custom/{key}/files/…`) — §17.2-ის ლიმიტი მას კითხულობს
        $folder = StorageFolder::customFiles($type, $data['kind']);

        $created = [];

        foreach ($files as $file) {
            $created[] = $record->files()->create([
                'user_id' => $request->user()->id,
                'module' => $type,
                'kind' => $data['kind'],
                'path' => $this->meter->storeUpload($request->user(), $file, $folder),
                'original_name' => $file->getClientOriginalName(),
                'mime' => SafeMime::ofUpload($file),
                'size' => $file->getSize(),
            ]);
        }

        return CustomRecordFileResource::collection(collect($created))
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(string $type, CustomRecordFile $file)
    {
        abort_unless($file->module === $type, 404);

        /* ⚠️ **ურნა (Tasks §29)** — `moveToTrash()`: ფაილი დისკზე და კვოტაში
           რჩება და ურნიდან ბრუნდება; ადგილი საბოლოო წაშლისას თავისუფლდება. */
        $file->moveToTrash();

        return response()->noContent();
    }
}
