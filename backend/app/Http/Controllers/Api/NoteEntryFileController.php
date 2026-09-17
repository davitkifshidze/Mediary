<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\NoteEntryFileResource;
use App\Models\NoteEntry;
use App\Models\NoteEntryFile;
use App\Services\Storage\StorageMeter;
use App\Support\SafeMime;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * ჩანაწერზე მიმაგრებული ფაილები (Tasks §13.1) — სქრინშოტი/ფოტო (`image`),
 * ვიდეო (`video`) და დოკუმენტი (`doc`).
 *
 * ⚠️ **ატვირთვა კვოტაზე გადის** (§13.1 → 17.1): ჯერ მთელ პაკეტს ვამოწმებთ
 * (`guard`), მერე თითოეულს `storeUpload()`-ით ვწერთ — ე.ი. მრიცხველი
 * ვერასდროს აცდება.
 *
 * ⚠️ **ფაილები პრივატულ დისკზეა (Tasks §17.5, გაკეთდა 2026-09-05).** ეს
 * მოდული პირად დოკუმენტებს ინახავს, ე.ი. `/storage/*`-ით ხელმისაწვდომობა
 * (URL-ის გამოცნობით) მიუღებელი იყო. ფაილი მხოლოდ `show()`-დან გაიცემა,
 * სადაც მფლობელობა ცხადად მოწმდება.
 */
class NoteEntryFileController extends Controller
{
    public function __construct(private StorageMeter $meter) {}

    public function index(Request $request, NoteEntry $note)
    {
        $files = $note->files()
            ->when($request->string('kind')->toString(), fn ($q, $kind) => $q->where('kind', $kind))
            ->get();

        return NoteEntryFileResource::collection($files);
    }

    public function store(Request $request, NoteEntry $note)
    {
        $kind = $request->input('kind', 'doc');

        $data = $request->validate([
            'kind' => ['required', 'in:image,video,doc'],
            'files' => ['required', 'array', 'max:'.UploadLimits::MAX_FILES],
            // ⚠️ ზომა/ფორმატი **ერთი რუკიდან** მოდის (`UploadLimits`) — შვიდი
            // კონტროლერი ერთსა და იმავეს იმეორებდა და ინტერფეისში არსად ეწერა
            'files.*' => UploadLimits::rule($kind === 'image' || $kind === 'video' ? $kind : 'doc'),
        ]);

        // 17.3 — კვოტა **მთელ პაკეტზე** ჩაწერამდე
        $files = $request->file('files');
        $this->meter->guard($request->user(), array_sum(array_map(
            fn ($file) => (int) $file->getSize(),
            $files,
        )));

        $folder = StorageFolder::noteFiles($data['kind']);
        $next = (int) $note->files()->max('sort_order');

        $created = [];
        foreach ($files as $file) {
            $created[] = $note->files()->create([
                'user_id' => $request->user()->id,
                'kind' => $data['kind'],
                'path' => $this->meter->storeUpload($request->user(), $file, $folder),
                'original_name' => $file->getClientOriginalName(),
                // SEC-08 — ⚠️ **სერვერი ადგენს შიგთავსიდან**, და არა `getClientMimeType()`
                'mime' => SafeMime::ofUpload($file),
                'size' => $file->getSize(),
                'sort_order' => ++$next,
            ]);
        }

        return NoteEntryFileResource::collection(collect($created))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * **ფაილის გაცემა (Tasks §17.5).** ერთადერთი გზა, რომლითაც პრივატული
     * დისკის შიგთავსი გარეთ გადის.
     *
     * ⚠️ **მფლობელობა აქ ცხადად მოწმდება** და არა მარტო global scope-ით:
     * `owner` scope `Auth::id()`-ზეა დამოკიდებული და მისი ჩუმად გამორთვა
     * (მაგ. მომავალი ადმინის კონტექსტი) ამ შემოწმებას არ უნდა შლიდეს.
     *
     * ⚠️ **`inline` მხოლოდ იმ ტიპებზე, რომლებიც სკრიპტს არ ასრულებენ**
     * (Tasks SEC-08): სურათი/ვიდეო ჩანაწერშივე უნდა გამოჩნდეს, `.html`-ად
     * ატვირთული ფაილი კი — არა. ამას `SafeMime` წყვეტს.
     *
     * ⚠️ **მფლობელობის შემოწმება აქ არ კმარა და სწორედ ეს არის არსი.**
     * ჩვეულებრივ ეს self-XSS-ია, მაგრამ იგივე რიგი ადმინის `/users/{id}`
     * ფაილ-ბიბლიოთეკაში ჩანს (`StorageMeter::files()`), ე.ი. დაბალი უფლების
     * მომხმარებელი დებს, ადმინი ხსნის — SEC-04-ის იგივე შაბლონი.
     *
     * ⚠️ **შენახული `mime` სვეტიც არ გამოდგება**: ძველი რიგი კლიენტის
     * ნათქვამს ატარებს. `SafeMime` ყოველთვის **ფაილს** ეკითხება.
     */
    public function show(Request $request, NoteEntryFile $noteEntryFile)
    {
        abort_unless($noteEntryFile->user_id === $request->user()->id, 404);

        $disk = Storage::disk(StorageFolder::diskFor((string) $noteEntryFile->path));

        abort_unless($disk->fileExists($noteEntryFile->path), 404);

        return SafeMime::response($disk, $noteEntryFile->path, $noteEntryFile->original_name);
    }

    public function destroy(NoteEntryFile $noteEntryFile)
    {
        // global scope-ის გამო სხვისი ფაილი ისედაც 404-ია
        $noteEntryFile->delete();

        return response()->noContent();
    }
}
