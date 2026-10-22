<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Status;
use App\Models\Video;
use App\Services\Video\YouTubePlaylist;
use App\Support\CredentialProviders;
use App\Support\DuplicateLink;
use App\Support\MissingCredential;
use App\Support\VideoUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
 */
class CoursePlaylistVideoController extends Controller
{
    public function store(Request $request, Course $course, YouTubePlaylist $playlists): JsonResponse
    {
        if ($denied = $this->videoAccess($request)) {
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
        ]);

        $list = $this->playlist($course, $playlists);
        if ($list instanceof JsonResponse) {
            return $list;
        }

        $items = collect($list['items'])->keyBy('video_id');
        $picked = array_values(array_unique($data['video_ids']));
        $urls = array_map(fn (string $id) => self::url($id), $picked);
        $found = DuplicateLink::findMany(Video::class, $urls);

        $result = ['created' => [], 'existing' => [], 'failed' => []];

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
                $result['existing'][] = (int) $duplicate['id'];

                continue;
            }

            $result['created'][] = $this->create($course, $item, $list, $data)->id;
        }

        return response()->json($result + ['course_id' => $course->id]);
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

    /** ვიდეოების მოდული ჩართულია და შექმნა შეგიძლია? — თორემ ცხადი 403 */
    private function videoAccess(Request $request): ?JsonResponse
    {
        $user = $request->user();

        if (! $user->hasModule('video')) {
            return response()->json(['message' => 'module_not_enabled', 'module' => 'video'], 403);
        }
        if (! $user->hasPermission('video', 'create')) {
            return response()->json(['message' => 'forbidden_permission', 'permission' => 'video.create'], 403);
        }

        return null;
    }

    private static function url(string $videoId): string
    {
        return "https://www.youtube.com/watch?v={$videoId}";
    }
}
