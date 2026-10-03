<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoResource;
use App\Models\Video;
use App\Services\Video\VideoDownloader;
use App\Services\Video\YtDlp;
use App\Support\SafeMime;
use App\Support\StorageFolder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * **ვიდეოს ლოკალური ასლი (Tasks §7.1) — ერთი მისამართი, სამი ზმნა.**
 *
 *  · `POST   /api/videos/{video}/download` — ჩამოწერის დაწყება (202)
 *  · `GET    /api/videos/{video}/download` — ფაილის მიწოდება
 *  · `DELETE /api/videos/{video}/download` — ადგილის გათავისუფლება
 *
 * ⚠️ `POST`-ს **`download` სჭირდება `EnsureModulePermission::UPDATE_ENDPOINTS`-ში**:
 * middleware ზმნიდან `create`-ს გამოიყვანდა და „ვხედავ + ვცვლი" უფლების
 * მქონე მომხმარებელი ცრუ 403-ს მიიღებდა (იგივე ხაფანგი, რაც
 * `visited`/`played`/`watched`-ს აქვს).
 *
 * ⚠️ **ფაილი სერვერიდან მხოლოდ აქედან გადის.** ის პრივატულ დისკზეა
 * (`videos/downloads`), ე.ი. `/storage/*`-ით არ იხსნება; მფლობელობა ცხადად
 * მოწმდება და სხვისი ვიდეო **404-ია და არა 403** — „ეს ვიდეო არსებობს"
 * თვითონაც ინფორმაციაა (იგივე წესი, რაც `note-files/{id}`-ს აქვს).
 */
class VideoDownloadController extends Controller
{
    /** ჩამოწერის დაწყება — მყისიერად ბრუნდება, სამუშაო ფონურად მიდის */
    public function store(Request $request, Video $video, VideoDownloader $downloader)
    {
        $downloader->start($video);

        return (new VideoResource($video->fresh()->load('type')))
            ->response()
            ->setStatusCode(202);
    }

    /**
     * მდგომარეობის შემოწმება — SPA ამას ეკითხება, სანამ `running`-ია.
     *
     * ⚠️ ცალკე „status" მისამართი განზრახ **არ გაკეთდა**: ვიდეოს რესურსი
     * ისედაც შეიცავს ჩამოწერის ველებს, ე.ი. მეორე ფორმა ორ წყაროს გააჩენდა.
     */
    public function show(Request $request, Video $video)
    {
        /* ⚠️ მფლობელობა **ცხადად** მოწმდება, თუმცა `owner` global scope
           ისედაც 404-ს აძლევს სხვისი ჩანაწერის ბმულს. პრივატული ფაილის
           გამტანი მარშრუტი ერთადერთია და ორმაგი ღობე აქ ღირს (იგივე,
           რაც `NoteEntryFileController::show()`-ს აქვს). */
        abort_unless($video->user_id === $request->user()?->id, 404);
        abort_unless($video->hasDownload(), 404);

        $disk = Storage::disk(StorageFolder::diskFor((string) $video->download_path));

        abort_unless($disk->fileExists($video->download_path), 404);

        /* Tasks §6.4 — ⚠️ **`SafeMime`-ით და Range-ით.** აქამდე `$disk->response()` იყო:
           პროექტის წესს („პირადი ფაილი მხოლოდ `SafeMime`-ით") გვერდს უვლიდა და
           `StreamedResponse` Range-ს არ იცნობდა — `<video>`-ში გადახვევა ვერ იმუშავებდა
           (§21-ის ლოკალური ფლეერის წინაპირობა). */
        return SafeMime::fileResponse(
            $disk,
            $video->download_path,
            $video->download_name ?: basename($video->download_path),
        );
    }

    /** ლოკალური ასლის წაშლა — ჩანაწერი რჩება, ადგილი თავისუფლდება */
    public function destroy(Request $request, Video $video)
    {
        $video->deleteDownload();
        $video->save();

        return new VideoResource($video->fresh()->load('type'));
    }

    /**
     * „შეიძლება თუ არა ჩამოწერა ამ მანქანაზე" — ღილაკის მდგომარეობისთვის.
     *
     * ⚠️ **ცალკე endpoint-ია განზრახ.** მის გარეშე SPA-ს ერთადერთი გზა
     * ჩამოწერის ცდა და 503-ის დაჭერა იქნებოდა, ე.ი. მომხმარებელი მხოლოდ
     * დაწკაპუნების შემდეგ გაიგებდა, რომ `yt-dlp` საერთოდ არ არის. იგივე
     * ლოგიკა, რაც `GET /api/web/status`-ს აქვს.
     */
    public function status(YtDlp $ytdlp)
    {
        /* Tasks §21.3 — „ჩამოტვირთული" სექციის სათაურისთვის: რამდენი ასლია და რამდენი
           ადგილი უკავია. ⚠️ `owner` scope — მხოლოდ ჩემი; მხოლოდ **მზა** ასლები,
           მიმდინარეს ზომა ჯერ არ აქვს. ცალკე endpoint-ი არ გაკეთდა — SPA ამას
           ისედაც კითხულობს ღილაკისთვის. */
        $ready = Video::where('download_status', Video::DOWNLOAD_READY);

        return response()->json([
            'available' => $ytdlp->available(),
            'version' => $ytdlp->version(),
            // ffmpeg-ის არქონა ხარისხს ჭრის და ეს ცხადად უნდა ეწეროს
            'ffmpeg' => $ytdlp->ffmpeg() !== null,
            'downloaded_count' => (clone $ready)->count(),
            'downloaded_size' => (int) (clone $ready)->sum('download_size'),
        ]);
    }
}
