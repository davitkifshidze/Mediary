<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SongFileResource;
use App\Models\Song;
use App\Models\SongFile;
use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
use Illuminate\Http\Request;

/**
 * სიმღერაზე მიმაგრებული ფაილები (Tasks §7.4) — ფოტოები და დოკუმენტები
 * (ტექსტი, ნოტები, ბუკლეტი).
 *
 * ⚠️ ცხრილი **სექციისაა** (`song_files`) და არა უნივერსალური — 2026-09-03-ის
 * წესი. ქცევა ზუსტად `VideoFileController`-ისაა, ე.ი. ატვირთვა
 * `StorageMeter::storeUpload()`-ზე გადის (კვოტა → 413) და წაშლა მოდელით
 * ხდება, რომ `StoredFile`-მა დისკიც გაასუფთაოს და მრიცხველიც დააბრუნოს.
 */
class SongFileController extends Controller
{
    /** დოკუმენტების დაშვებული ტიპები — თვითნებური ფაილი არ აიტვირთება */
    private const DOC_MIMES = 'pdf,doc,docx,txt,rtf,odt,xls,xlsx,csv,ppt,pptx';

    public function __construct(private StorageMeter $meter) {}

    public function index(Request $request, Song $song)
    {
        $query = $song->files();

        if ($kind = $request->string('kind')->toString()) {
            $query->where('kind', $kind);
        }

        return SongFileResource::collection($query->get());
    }

    public function store(Request $request, Song $song)
    {
        $data = $request->validate([
            'kind' => ['required', 'in:image,doc'],
            'files' => ['required', 'array', 'max:50'],
            'files.*' => $request->input('kind') === 'doc'
                ? ['file', 'max:20480', 'mimes:'.self::DOC_MIMES]
                : ['file', 'image', 'max:8192'],
        ]);

        // 17.3 — კვოტა **მთელ პაკეტზე** მოწმდება ჩაწერამდე, რომ ატვირთვა
        // ნახევრად არ გავიდეს; `storeUpload()` მერე თითოზეც ამოწმებს
        $files = $request->file('files');
        $this->meter->guard($request->user(), array_sum(array_map(
            fn ($file) => (int) $file->getSize(),
            $files,
        )));

        $folder = StorageFolder::songFiles($data['kind']);
        $next = (int) $song->files()->max('sort_order');

        $created = [];
        foreach ($files as $file) {
            $created[] = $song->files()->create([
                'user_id' => $request->user()->id,
                'kind' => $data['kind'],
                'path' => $this->meter->storeUpload($request->user(), $file, $folder),
                'original_name' => $file->getClientOriginalName(),
                'mime' => $file->getClientMimeType(),
                'size' => $file->getSize(),
                'sort_order' => ++$next,
            ]);
        }

        return SongFileResource::collection(collect($created))
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(SongFile $songFile)
    {
        // global scope-ის გამო სხვისი ფაილი ისედაც 404-ია
        $songFile->delete();

        return response()->noContent();
    }
}
