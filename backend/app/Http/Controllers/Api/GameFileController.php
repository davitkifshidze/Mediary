<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\GameFileResource;
use App\Models\Game;
use App\Models\GameFile;
use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
use Illuminate\Http\Request;

/**
 * თამაშის ფაილები (Tasks §11.1/§11.3) — **ატვირთული** სქრინშოტი/artwork
 * (`kind = 'image'`) და დოკუმენტები (გაიდი, სეივი, კონფიგი).
 *
 * ⚠️ RAWG-იდან **ჩამოტვირთული** კადრები აქ არ ხვდება — ისინი
 * `gallery_images`-შია (§10-ის მექანიზმი). იგივე გაყოფაა ვიდეოსა და
 * ბორდგეიმზე: ჩამოტვირთული = გალერეა, ატვირთული = სექციის ცხრილი.
 */
class GameFileController extends Controller
{
    private const DOC_MIMES = 'pdf,doc,docx,txt,rtf,odt,xls,xlsx,csv,ppt,pptx,zip';

    public function __construct(private StorageMeter $meter) {}

    public function index(Request $request, Game $game)
    {
        $files = $game->files()
            ->when($request->string('kind')->toString(), fn ($q, $kind) => $q->where('kind', $kind))
            ->get();

        return GameFileResource::collection($files);
    }

    public function store(Request $request, Game $game)
    {
        $kind = $request->input('kind', 'image');

        $data = $request->validate([
            'kind' => ['required', 'in:image,doc'],
            'files' => ['required', 'array', 'max:20'],
            'files.*' => $kind === 'doc'
                ? ['file', 'max:20480', 'mimes:'.self::DOC_MIMES]
                : ['file', 'image', 'max:8192'],
        ]);

        // 17.3 — კვოტა **მთელ პაკეტზე** ჩაწერამდე
        $files = $request->file('files');
        $this->meter->guard($request->user(), array_sum(array_map(
            fn ($file) => (int) $file->getSize(),
            $files,
        )));

        $folder = StorageFolder::gameFiles($data['kind']);
        $next = (int) $game->files()->max('sort_order');

        $created = [];
        foreach ($files as $file) {
            $created[] = $game->files()->create([
                'user_id' => $request->user()->id,
                'kind' => $data['kind'],
                'path' => $this->meter->storeUpload($request->user(), $file, $folder),
                'original_name' => $file->getClientOriginalName(),
                'mime' => $file->getClientMimeType(),
                'size' => $file->getSize(),
                'sort_order' => ++$next,
            ]);
        }

        return GameFileResource::collection(collect($created))
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(GameFile $gameFile)
    {
        // global scope-ის გამო სხვისი ფაილი ისედაც 404-ია
        $gameFile->delete();

        return response()->noContent();
    }
}
