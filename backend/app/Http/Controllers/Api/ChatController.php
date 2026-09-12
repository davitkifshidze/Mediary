<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Conversation;
use App\Models\Message;
use App\Services\Audit\AuditLogger;
use App\Services\Chat\ChatService;
use App\Services\Profile\PublicProfileService;
use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * **ჩატი (Tasks §16.3)** — პირადი მიმოწერა.
 *
 * ⚠️ **წვდომას მონაწილეობა წყვეტს და არა `owner` scope.** საუბარი ორისაა,
 * ე.ი. `BelongsToUser`-ის მოდელი აქ არ მუშაობს — ყოველ endpoint-ზე ცხადად
 * მოწმდება, არის თუ არა მიმდინარე user მონაწილე. სხვისი საუბარი **404-ია**
 * და არა 403: „ეს საუბარი არსებობს" თვითონაც ინფორმაციაა.
 *
 * ⚠️ **მიწერის წესები `ChatService`-შია** (საჯარო პროფილები + დაბლოკვა) —
 * კონტროლერი მათ არ იმეორებს.
 *
 * **მედია გაკეთდა 2026-09-06-ს** (`DECISIONS.md` §1). სამი წესი:
 *
 * ⚠️ **ფაილი პრივატულ დისკზე ჯდება** (`chat/` — `StorageFolder::PRIVATE_ROOTS`)
 * და გარეთ **ერთადერთი გზით** გადის: `GET /api/chat/files/{message}`,
 * რომელიც მონაწილეობას ცხადად ამოწმებს. `/storage/*`-ით ის არ იხსნება.
 *
 * ⚠️ **კვოტა გამგზავნისაა (§16.4).** ატვირთვა `StorageMeter::storeUpload()`-ზე
 * გადის, ე.ი. ადგილის ამოწურვაზე **413** ბრუნდება — ტექსტი და ემოჯი კი
 * იმავე მდგომარეობაშიც იგზავნება, რადგან ისინი დისკს საერთოდ არ ეხება.
 *
 * ⚠️ **წაშლა ორივესთან შლის** (`DECISIONS.md` §1) — შეტყობინების რიგი რჩება,
 * შიგთავსი კი „ფაილი წაშლილია"-დ იხატება. იხ. `ChatService::deleteAttachment()`.
 */
class ChatController extends Controller
{
    /** ატვირთვის ჭერი კილობაიტებში — ვიდეო ყველაზე მძიმეა */
    private const MAX_IMAGE_KB = 8192;

    private const MAX_VIDEO_KB = 102400;

    private const MAX_FILE_KB = 20480;

    public function __construct(
        private ChatService $chat,
        private PublicProfileService $profiles,
        private StorageMeter $meter,
        private AuditLogger $audit,
    ) {}

    /** ჩემი საუბრები — ბოლო შეტყობინებით და წაუკითხავის რაოდენობით */
    public function index(Request $request)
    {
        $me = $request->user();

        $conversations = Conversation::whereHas('participants', fn ($q) => $q->whereKey($me->id))
            // ⚠️ ბოლო წერილიც **ჩემი ხედიდან** უნდა იყოს (§4.6) — თორემ
            // სიაში ისევ ის იწერებოდა, რაც ახლახან წავშალე
            ->with(['participants', 'messages' => fn ($q) => $q->visibleTo($me->id)->latest('id')->limit(1)])
            ->orderByDesc('last_message_at')
            ->orderByDesc('id')
            ->get();

        $unread = $this->chat->unreadCounts($me);

        return response()->json([
            'data' => $conversations->map(function (Conversation $c) use ($me, $unread) {
                $other = $c->otherThan($me->id);
                $last = $c->messages->first();

                return [
                    'id' => $c->id,
                    'profile' => $other ? $this->profiles->header($other) : null,
                    'blocked_by_me' => $other ? $this->chat->iBlocked($me, $other) : false,
                    'last_message' => $last ? [
                        'body' => $last->body,
                        'type' => $last->type,
                        // სიაში მედია სახელით უნდა ითქვას, თორემ ბოლო
                        // შეტყობინება უბრალოდ ცარიელი გამოჩნდებოდა
                        'attachment_name' => $last->attachment_name,
                        'mine' => $last->user_id === $me->id,
                        'created_at' => $last->created_at?->toIso8601String(),
                    ] : null,
                    'unread' => $unread[$c->id] ?? 0,
                    'last_message_at' => $c->last_message_at?->toIso8601String(),
                ];
            })->all(),
            'unread_total' => array_sum($unread),
        ]);
    }

    /** ჰედერის badge — მხოლოდ რიცხვი, იაფად */
    public function unread(Request $request)
    {
        return response()->json(['unread' => array_sum($this->chat->unreadCounts($request->user()))]);
    }

    /** საუბრის გახსნა username-ით (დამთხვევების გვერდიდანაც) */
    public function open(Request $request, string $username)
    {
        $other = $this->chat->resolve($username);
        abort_unless($other, 404);

        $conversation = $this->chat->between($request->user(), $other);

        return response()->json(['id' => $conversation->id]);
    }

    /** შეტყობინებები — ახლიდან ძველისკენ, გვერდებით */
    public function messages(Request $request, Conversation $conversation)
    {
        $me = $request->user();
        abort_unless($conversation->has($me->id), 404);

        $page = $conversation->messages()
            // §4.6 — წაშლილი რიგი ბაზაში რჩება; ხედი user-ის ჭრილშია
            ->visibleTo($me->id)
            ->with('author:id,name,username,avatar_path')
            ->orderByDesc('id')
            ->paginate(min((int) $request->integer('per_page', 50), 100));

        $other = $conversation->otherThan($me->id);

        // გახსნისთანავე წაკითხულად ინიშნება — ეს არის „ჩატი გავხსენი"
        $this->chat->markRead($conversation, $me);

        return response()->json([
            'data' => $page->getCollection()->map(fn (Message $m) => $this->payload($m, $me->id))->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
            ],
            'profile' => $other ? $this->profiles->header($other) : null,
            'blocked_by_me' => $other ? $this->chat->iBlocked($me, $other) : false,
            // ⚠️ „საერთოდ დაბლოკილია" ≠ „მე დავბლოკე" — UI-ს ორივე სჭირდება
            'blocked' => $other ? $this->chat->blockedBetween($me, $other) : false,
        ]);
    }

    /**
     * გაგზავნა — ტექსტი/ემოჯი/GIF ან **ფაილი** (§16.3).
     *
     * ⚠️ ერთი endpoint-ია და არა ორი: `file`-ის არსებობა წყვეტს, რომელია.
     * ცალკე „upload" route ორივეგან იმეორებდა დაბლოკვის/საჯაროობის კარიბჭეს.
     *
     * ⚠️ **`body` მედიაზე არჩევითია** (წარწერა სურათის ქვეშ), ტექსტზე კი —
     * სავალდებულო, თორემ ცარიელი ბუშტი გაიგზავნებოდა.
     */
    public function send(Request $request, Conversation $conversation)
    {
        $me = $request->user();
        abort_unless($conversation->has($me->id), 404);

        $upload = $request->file('file');

        if (! $upload) {
            $data = $request->validate([
                'type' => ['nullable', Rule::in(['text', 'emoji', 'gif'])],
                'body' => ['required', 'string', 'max:4000'],
            ]);

            $message = $this->chat->send($conversation, $me, $data['type'] ?? 'text', $data['body']);

            return response()->json(['data' => $this->payload($message, $me->id)], 201);
        }

        $type = $request->input('type', 'file');

        $request->validate([
            'type' => ['nullable', Rule::in(Message::MEDIA_TYPES)],
            'body' => ['nullable', 'string', 'max:4000'],
            'file' => match ($type) {
                'image' => ['file', 'image', 'max:'.self::MAX_IMAGE_KB],
                'video' => ['file', 'max:'.self::MAX_VIDEO_KB, 'mimes:mp4,webm,ogg,mov,m4v'],
                default => ['file', 'max:'.self::MAX_FILE_KB],
            },
        ]);

        /* §16.4 — ადგილი **გამგზავნის** კვოტიდან იხარჯება. `storeUpload()`
           თვითონ აგდებს 413-ს, ე.ი. ცალკე შემოწმება აქ ზედმეტია და
           ორ ადგილას განსხვავებულ პასუხს დაბადებდა. */
        $path = $this->meter->storeUpload($me, $upload, StorageFolder::chatFiles($type));

        $message = $this->chat->send($conversation, $me, $type, $request->input('body'), [
            'attachment_path' => $path,
            'attachment_name' => $upload->getClientOriginalName(),
            'attachment_mime' => $upload->getClientMimeType(),
            'attachment_size' => (int) $upload->getSize(),
        ]);

        return response()->json(['data' => $this->payload($message, $me->id)], 201);
    }

    /**
     * **ფაილის გაცემა.** ერთადერთი გზა, რომლითაც ჩატის პრივატული ფაილი
     * გარეთ გადის — მონაწილეობა ცხადად მოწმდება და სხვისი ფაილი **404-ია**
     * (და არა 403: „ეს ფაილი არსებობს" თვითონაც ინფორმაციაა).
     */
    public function file(Request $request, Message $message)
    {
        $conversation = $message->conversation;

        abort_unless($conversation && $conversation->has($request->user()->id), 404);
        abort_unless($message->attachment_path, 404);

        $disk = Storage::disk(StorageFolder::diskFor((string) $message->attachment_path));

        abort_unless($disk->fileExists($message->attachment_path), 404);

        // `inline` — სურათი/ვიდეო ძაფშივე უნდა დაიხატოს
        return $disk->response(
            $message->attachment_path,
            $message->attachment_name,
            array_filter(['Content-Type' => $message->attachment_mime]),
            'inline',
        );
    }

    /**
     * ფაილის წაშლა (`DECISIONS.md` §1) — **ორივესთან** ქრება, შეტყობინება რჩება.
     * ავტორობას `ChatService` ამოწმებს.
     */
    public function deleteFile(Request $request, Message $message)
    {
        $me = $request->user();
        $conversation = $message->conversation;

        abort_unless($conversation && $conversation->has($me->id), 404);

        $message = $this->chat->deleteAttachment($message, $me);

        return response()->json(['data' => $this->payload($message, $me->id)]);
    }

    /**
     * **წერილის წაშლა (Tasks §4.6)** — „მხოლოდ შენთან თუ ორივესთან?".
     *
     * ⚠️ **`scope` სავალდებულოა და ნაგულისხმევი არ აქვს.** კითხვა
     * მომხმარებელს ეკითხება (§4.6), ე.ი. „ვივარაუდოთ `both`" ზუსტად ის
     * ქცევაა, რომლის შეცვლაც დაევალა.
     *
     * ⚠️ **წაშლა ლოგზე დგას (§4.5).** რიგი `messages`-ში რჩება აღდგენისთვის,
     * ხოლო „ვინ, როდის, რა მეთოდით წაშალა" აუდიტ-ლოგში — და ის ჩანაწერი
     * ლოგის გასუფთავებას **არ ექვემდებარება** (`AuditLog::PROTECTED_ACTIONS`).
     */
    public function deleteMessage(Request $request, Message $message)
    {
        $me = $request->user();
        $conversation = $message->conversation;

        abort_unless($conversation && $conversation->has($me->id), 404);

        $data = $request->validate([
            'scope' => ['required', Rule::in(Message::REMOVAL_SCOPES)],
        ]);

        $message = $this->chat->deleteMessage($message, $me, $data['scope']);

        $this->audit->log(AuditLog::ACTION_CHAT_DELETE, [
            'module' => 'chat',
            'subject_type' => 'message',
            'subject_id' => $message->id,
            'subject_label' => $message->body ?? $message->attachment_name,
            // §4.6 — შესანახია **ვინ ვის მისწერა, რა მისწერა, როდის**
            'old_values' => [
                'author_id' => $message->user_id,
                'conversation_id' => $message->conversation_id,
                'type' => $message->type,
                'body' => $message->body,
                'attachment_name' => $message->attachment_name,
                'sent_at' => $message->created_at?->toIso8601String(),
            ],
            'context' => [
                'scope' => $data['scope'],
                'recipient_id' => $conversation->otherThan($me->id)?->id,
            ],
        ]);

        return response()->noContent();
    }

    /**
     * შეტყობინების ერთი ფორმა — სიაშიც და გაგზავნის პასუხშიც.
     *
     * ⚠️ **`attachment_url` აქ ცხადად აიწყობა** და არა გზის გაცემით:
     * ფაილი პრივატულ დისკზეა, ე.ი. `/storage/...` მასზე არ მუშაობს.
     */
    private function payload(Message $message, int $meId): array
    {
        return [
            'id' => $message->id,
            'type' => $message->type,
            'body' => $message->body,
            'mine' => $message->user_id === $meId,
            'attachment' => $message->attachment_path ? [
                'url' => "/chat/files/{$message->id}",
                'name' => $message->attachment_name,
                'mime' => $message->attachment_mime,
                'size' => $message->attachment_size,
            ] : null,
            // ცალკე დროშა სქემაში არ არის — იხ. `Message::attachmentDeleted()`
            'attachment_deleted' => $message->attachmentDeleted(),
            'attachment_name' => $message->attachment_name,
            'created_at' => $message->created_at?->toIso8601String(),
        ];
    }

    /** ⚠️ `PATCH` — POST-ს `permission:` middleware `create`-ად წაიკითხავდა */
    public function read(Request $request, Conversation $conversation)
    {
        abort_unless($conversation->has($request->user()->id), 404);

        $this->chat->markRead($conversation, $request->user());

        return response()->noContent();
    }

    /** დაბლოკვა/განბლოკვა — ადამიანზეა და არა საუბარზე */
    public function block(Request $request, string $username)
    {
        $other = $this->chat->resolve($username);
        abort_unless($other, 404);

        $blocked = $request->boolean('blocked');
        $blocked
            ? $this->chat->block($request->user(), $other)
            : $this->chat->unblock($request->user(), $other);

        return response()->json(['blocked' => $blocked]);
    }
}
