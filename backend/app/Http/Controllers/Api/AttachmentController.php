<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AttachmentResource;
use App\Models\Attachment;
use App\Models\Video;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * მიმაგრებული ფაილები (K3) — ფოტოები და დოკუმენტები.
 *
 * მშობელი polymorphic-ია, ამიტომ იგივე კონტროლერი მომავალ მოდულებსაც
 * გამოადგება (მაგ. შემსრულებლის გალერეა — K5).
 */
class AttachmentController extends Controller
{
    /** დოკუმენტების დაშვებული ტიპები — თვითნებური ფაილი არ აიტვირთება */
    private const DOC_MIMES = 'pdf,doc,docx,txt,rtf,odt,xls,xlsx,csv,ppt,pptx';

    public function index(Request $request, Video $video)
    {
        $this->assertVisible($request, $video);

        return AttachmentResource::collection($video->attachments()->get());
    }

    public function store(Request $request, Video $video)
    {
        $this->assertVisible($request, $video);

        $data = $request->validate([
            'kind' => ['required', 'in:image,doc'],
            'files' => ['required', 'array', 'max:50'],
            'files.*' => $request->input('kind') === 'doc'
                ? ['file', 'max:20480', 'mimes:'.self::DOC_MIMES]
                : ['file', 'image', 'max:8192'],
        ]);

        // 18+ ჩანაწერის ფაილები private დისკზე — `/storage/*` ავტორიზაციას არ ამოწმებს
        $disk = $video->is_adult ? 'local' : 'public';
        $folder = $data['kind'] === 'doc' ? 'documents' : 'gallery';
        $next = (int) $video->attachments()->max('sort_order');

        $created = [];
        foreach ($request->file('files') as $file) {
            $created[] = $video->attachments()->create([
                'user_id' => $request->user()->id,
                'kind' => $data['kind'],
                'disk' => $disk,
                'path' => $file->store($folder, $disk),
                'original_name' => $file->getClientOriginalName(),
                'mime' => $file->getClientMimeType(),
                'size' => $file->getSize(),
                'sort_order' => ++$next,
            ]);
        }

        return AttachmentResource::collection(collect($created))
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(Attachment $attachment)
    {
        // global scope-ის გამო სხვისი ფაილი ისედაც 404-ია
        $attachment->delete();

        return response()->noContent();
    }

    /** private ფაილის გაცემა (18+) — მხოლოდ მფლობელს */
    public function file(Attachment $attachment)
    {
        $disk = Storage::disk($attachment->disk);
        abort_unless($disk->exists($attachment->path), 404);

        return $disk->response($attachment->path, $attachment->original_name);
    }

    private function assertVisible(Request $request, Video $video): void
    {
        abort_if($video->is_adult && ! $request->user()->hasModule('video_adult'), 404);
    }
}
