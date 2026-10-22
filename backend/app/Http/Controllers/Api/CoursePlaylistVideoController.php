<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Status;
use App\Models\Video;
use App\Services\Storage\StorageMeter;
use App\Services\Video\VideoDownloader;
use App\Services\Video\YouTubePlaylist;
use App\Services\Video\YtDlp;
use App\Support\CredentialProviders;
use App\Support\DuplicateLink;
use App\Support\MissingCredential;
use App\Support\StorageFolder;
use App\Support\VideoUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;

/**
 * **კურსის ფლეილისტი → ვიდეოები** („საქაღალდე" = კურსი).
 *
 * შენი სიტყვები: „თუ ერთიანდება რომელიმე კურსში შეგეძლოს კურსი ფოლდერივით
 * გაკეთდეს ვიდეოებში და იქ ჩაყაროს ვიდეოები, შეგეძლოს მინიშნება რომელი
 * ვიდეოები ჩამოიწეროს". არჩეული ელემენტები ვიდეოების მოდულში ჩანაწერებად
 * იქმნება და კურსს მიებმება (`videos.course_id`, რიგი — `sort_order`).
 *
 * ⚠️ ელემენტები **ქეშირებული ფლეილისტიდან** მოდის (`YouTubePlaylist::fetch()`):
 * სათაური, ხანგრძლივობა, თარიღი და არხი უკვე იქაა, ე.ი. N× `LinkResolver`
 * (და N× YouTube-ის კვოტა) არ გვჭირდება.
 * ⚠️ ბმულის დუბლი ახალს არ ქმნის — არსებული ვიდეო გამოიყენება და, თუ
 * საქაღალდე არ აქვს, ამ კურსში გადადის; სხვა კურსის ვიდეოს არ „იპარავს".
 * ⚠️ ვიდეოების მოდული და მისი `create` უფლება აქ ცალკე მოწმდება: მარშრუტი
 * კურსის ჯგუფშია (`module:course`, `permission:course`) და ჩუმი 404-ის
 * ნაცვლად ცხადი კოდი ბრუნდება.
 *
 * `download` — ლოკალური ასლიც: ერთ ფონურ პროცესად, რიგრიგობით
 * (`VideoDownloader::startBatch()`); წინასწარ — გეგმა (`plan()`).
 */
class CoursePlaylistVideoController extends Controller
{
    /** გეგმისთვის რამდენი ვიდეოს ზომა იზომება (`yt-dlp` თითოზე რამდენიმე წამია) */
    private const PLAN_SAMPLES = 3;

    public function store(Request $request, Course $course, YouTubePlaylist $playlists, VideoDownloader $downloader, YtDlp $ytdlp): JsonResponse
    {
        if ($denied = $this->videoAccess($request, $request->boolean('download'))) {
            return $denied;
        }

        $data = $request->validate([
            'video_ids' => ['required', 'array', 'min:1', 'max:'.YouTubePlaylist::MAX_ITEMS],
            'video_ids.*' => ['string', 'max:20'],
            // ტიპი და სტატუსი ვიდეოს სავალდებულო ველებია — ერთხელ, ყველა არჩეულზე
            'type_id' => [
                'required',
                'integer',
                Rule::exists('video_types', 'id')->whereNull('trashed_at')->where('user_id', $request->user()->id),
            ],
            'status' => ['required', 'string', Status::rule('video')],
            // ლოკალური ასლიც — ერთ ფონურ რიგად
            'download' => ['nullable', 'boolean'],
        ]);

        // ⚠️ ჩამოტვირთვის პროგრამა ჯერ — ჩანაწერები ისე არ შეიქმნას, რომ მერე 503 დაბრუნდეს
        if (! empty($data['download']) && ! $ytdlp->available()) {
            return response()->json(['message' => 'ytdlp_unavailable'], 503);
        }

        $list = $this->playlist($course, $playlists);
        if ($list instanceof JsonResponse) {
            return $list;
        }

        $items = collect($list['items'])->keyBy('video_id');
        $picked = array_values(array_unique($data['video_ids']));
        $urls = array_map(fn (string $id) => self::url($id), $picked);
        $found = DuplicateLink::findMany(Video::class, $urls);

        $result = ['created' => [], 'existing' => [], 'failed' => [], 'started' => []];
        /** @var list<Video> $videos ჩამოსატვირთი — ახალიც და არსებულიც */
        $videos = [];

        foreach ($picked as $id) {
            $item = $items->get($id);
            if ($item === null) {
                // ფლეილისტში აღარ არის (განახლდა ან ხელით შეცვლილი მოთხოვნა)
                $result['failed'][] = $id;

                continue;
            }

            $duplicate = $found[self::url($id)] ?? null;

            if ($duplicate !== null) {
                $video = Video::query()->find($duplicate['id']);
                if ($video && $video->course_id === null) {
                    $video->forceFill(['course_id' => $course->id, 'sort_order' => (int) $item['position']])->save();
                }
                if ($video) {
                    $videos[] = $video;
                }
                $result['existing'][] = (int) $duplicate['id'];

                continue;
            }

            $video = $this->create($course, $item, $list, $data);
            $videos[] = $video;
            $result['created'][] = $video->id;
        }

        if (! empty($data['download'])) {
            $result['started'] = $downloader->startBatch($videos);
        }

        return response()->json($result + ['course_id' => $course->id]);
    }

    /**
     * **გეგმა ჩამოტვირთვამდე** — „N ვიდეო · ~X GB · თავისუფალია Y".
     *
     * ⚠️ ზომა **სავარაუდოა**: `yt-dlp` თითო ვიდეოზე რამდენიმე წამს ხარჯავს,
     * ამიტომ პირველი `PLAN_SAMPLES` ხანგრძლივობიანი ვიდეო იზომება (24 სთ ქეშით)
     * და წამის ფასი მთელ ხანგრძლივობაზე ვრცელდება. მის გარეშე ნახევარი კურსი
     * კვოტაზე უჩუმრად `failed` გახდებოდა — აქ ეს დადასტურებამდე ჩანს.
     */
    public function plan(Request $request, Course $course, YouTubePlaylist $playlists, YtDlp $ytdlp, StorageMeter $meter): JsonResponse
    {
        if ($denied = $this->videoAccess($request, true)) {
            return $denied;
        }

        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:'.YouTubePlaylist::MAX_ITEMS],
            'ids.*' => ['string', 'max:20'],
        ]);

        if (! $ytdlp->available()) {
            return response()->json(['message' => 'ytdlp_unavailable'], 503);
        }

        $list = $this->playlist($course, $playlists);
        if ($list instanceof JsonResponse) {
            return $list;
        }

        $items = collect($list['items'])->whereIn('video_id', array_unique($data['ids']))->values();
        $duration = (int) $items->sum(fn (array $item) => (int) ($item['duration'] ?? 0));

        [$bytes, $seconds, $sampled] = [0, 0, 0];
        foreach ($items->filter(fn (array $item) => (int) ($item['duration'] ?? 0) > 0)->take(self::PLAN_SAMPLES) as $item) {
            $size = Cache::remember(
                'course-plan-size:'.$item['video_id'],
                now()->addHours(YouTubePlaylist::CACHE_HOURS),
                fn () => (int) ($ytdlp->probe(self::url((string) $item['video_id']))['filesize'] ?? 0),
            );
            if ($size > 0) {
                $bytes += $size;
                $seconds += (int) $item['duration'];
                $sampled++;
            }
        }

        // ხანგრძლივობის გარეშე ელემენტი — საშუალო ზომით
        $unknown = $items->filter(fn (array $item) => (int) ($item['duration'] ?? 0) === 0)->count();
        $estimate = $seconds > 0
            ? (int) round($bytes / $seconds * $duration + ($unknown > 0 ? $bytes / $sampled * $unknown : 0))
            : null;
        $free = $meter->freeFor($request->user(), StorageFolder::VIDEO_DOWNLOADS);

        return response()->json([
            'count' => $items->count(),
            'duration' => $duration,
            'estimate_bytes' => $estimate,
            'sampled' => $sampled,
            'free_bytes' => $free,
            'fits' => $estimate === null ? null : $estimate <= $free,
        ]);
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * ერთი ელემენტი → ვიდეო. ⚠️ ბმული `list=`-ის გარეშეა: იგივე ვიდეო ხელით
     * ჩასმულიც ასე ინახება და დუბლის ძებნა `external_id`-ით ორივეს ერთად ხედავს.
     *
     * @param  array<string, mixed>  $item
     * @param  array<string, mixed>  $list
     * @param  array<string, mixed>  $data
     */
    private function create(Course $course, array $item, array $list, array $data): Video
    {
        $url = self::url((string) $item['video_id']);
        $parsed = VideoUrl::parse($url);

        $video = new Video;
        $video->forceFill([
            'title' => mb_substr((string) ($item['title'] ?: $url), 0, 255),
            'url' => $url,
            'platform' => $parsed['platform'],
            'external_id' => $parsed['external_id'],
            'embed_url' => $parsed['embed_url'],
            'thumbnail_url' => $parsed['thumbnail_url'],
            'duration' => $item['duration'] ?: null,
            'published_at' => $item['published_at'] ?? null,
            'channel' => isset($list['channel']) ? mb_substr((string) $list['channel'], 0, 255) : null,
            'type_id' => (int) $data['type_id'],
            'course_id' => $course->id,
            // ფლეილისტის რიგი — საქაღალდე ამ რიგით ილაგება
            'sort_order' => (int) $item['position'],
            'tags' => [],
        ]);
        $video->applyStatusKey($data['status']);
        $video->save();

        return $video;
    }

    /**
     * ქეშირებული ფლეილისტი; წყაროს ჩავარდნა — იგივე პასუხები, რაც
     * `CourseController::playlist()`-ს აქვს (409 გასაღები, 503 წყარო, 422 ფლეილისტი არ არის).
     *
     * @return array<string, mixed>|JsonResponse
     */
    private function playlist(Course $course, YouTubePlaylist $playlists): array|JsonResponse
    {
        $id = $course->url ? VideoUrl::parse($course->url)['playlist_id'] : null;

        if ($id === null) {
            return response()->json(['message' => 'playlist_missing'], 422);
        }
        if (! $playlists->available()) {
            return MissingCredential::response(CredentialProviders::YOUTUBE);
        }

        return $playlists->fetch($id) ?? response()->json(['message' => 'youtube_unavailable'], 503);
    }

    /**
     * ვიდეოების მოდული ჩართულია და შექმნა (ჩამოტვირთვისას — რედაქტირებაც)
     * შეგიძლია? — თორემ ცხადი 403. ⚠️ ჩამოტვირთვა ვიდეოს `update`-ია
     * (`POST /videos/{id}/download`-ის იგივე წესი).
     */
    private function videoAccess(Request $request, bool $download = false): ?JsonResponse
    {
        $user = $request->user();

        if (! $user->hasModule('video')) {
            return response()->json(['message' => 'module_not_enabled', 'module' => 'video'], 403);
        }

        foreach ($download ? ['create', 'update'] : ['create'] as $action) {
            if (! $user->hasPermission('video', $action)) {
                return response()->json(['message' => 'forbidden_permission', 'permission' => "video.{$action}"], 403);
            }
        }

        return null;
    }

    private static function url(string $videoId): string
    {
        return "https://www.youtube.com/watch?v={$videoId}";
    }
}
