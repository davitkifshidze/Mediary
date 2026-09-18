<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Conversation;
use App\Models\ConversationNickname;
use App\Models\Message;
use App\Services\Audit\AuditLogger;
use App\Services\Chat\ChatService;
use App\Services\Profile\PublicProfileService;
use App\Services\Storage\StorageMeter;
use App\Support\Like;
use App\Support\SafeMime;
use App\Support\Snippet;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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
            /* ⚠️ **მოჩვენება საუბარი არ იხატება** (Tasks BUG-21): თანამოსაუბრის
               ანგარიშის წაშლისას `conversation_user` კასკადით ქრება, საუბარი კი
               რჩება — და `otherThan()` `null`-ს აბრუნებდა, ე.ი. სიაში
               უსახელო, ვერგახსნადი რიგი ჩნდებოდა. ⚠️ **თვითონ საუბარი და
               მეორე მხარის წერილები განზრახ რჩება**: ისინი მისი ისტორიაა და
               სხვისი ანგარიშის წაშლის გამო არ უნდა გაქრეს. */
            ->whereHas('participants', fn ($q) => $q->whereKeyNot($me->id))
            // ⚠️ ბოლო წერილიც **ჩემი ხედიდან** უნდა იყოს (§4.6) — თორემ
            // სიაში ისევ ის იწერებოდა, რაც ახლახან წავშალე
            ->with(['participants', 'messages' => fn ($q) => $q->visibleTo($me->id)->latest('id')->limit(1)])
            ->orderByDesc('last_message_at')
            ->orderByDesc('id')
            ->get();

        $unread = $this->chat->unreadCounts($me);
        // §10.5 — რიგის რიცხვი პატიოსანი რჩება, **ჯამი** კი დადუმებულებს ჭრის
        $muted = $this->chat->mutedConversationIds($me);
        $nicknames = $this->nicknamesFor($conversations, $me->id);

        return response()->json([
            'data' => $conversations->map(function (Conversation $c) use ($me, $unread, $muted, $nicknames) {
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
                    // §10.5 — გაჩუმებული საუბარი ბეჯს არ ანთებს, რიცხვს კი ინარჩუნებს
                    'muted' => in_array($c->id, $muted, true),
                    // §10.11 — ნიკნეიმი **ნამდვილ სახელს არ ანაცვლებს**; ორივე მიდის
                    'nickname' => $other ? ($nicknames[$c->id][$other->id] ?? null) : null,
                    'theme' => $c->theme,
                    'last_message_at' => $c->last_message_at?->toIso8601String(),
                ];
            })->all(),
            'unread_total' => $this->chat->unreadTotal($me),
        ]);
    }

    /** ჰედერის badge — მხოლოდ რიცხვი, იაფად */
    public function unread(Request $request)
    {
        // §10.5 — დადუმებული საუბარი ბეჯში არ ითვლება
        return response()->json(['unread' => $this->chat->unreadTotal($request->user())]);
    }

    /** საუბრის გახსნა username-ით (დამთხვევების გვერდიდანაც) */
    public function open(Request $request, string $username)
    {
        $other = $this->chat->resolve($username);
        abort_unless($other, 404);

        $conversation = $this->chat->between($request->user(), $other);

        return response()->json(['id' => $conversation->id]);
    }

    /** ერთ გვერდზე რამდენი წერილი მოდის */
    private const PER_PAGE = 50;

    /**
     * **შეტყობინებები — კურსორით და არა გვერდის ნომრით (Tasks §10.8).**
     *
     * ⚠️ **SPA ბოლო 50 წერილზე მეტს ვერ კითხულობდა** და ეს არავის
     * მოუთხოვია, თუმცა ყველაფერს სჭირდება: `fetchThread()` ყოველთვის
     * პირველ გვერდს იღებდა, `meta.last_page` არსად გამოიყენებოდა და
     * „ძველის ჩატვირთვის" ღილაკი საერთოდ არ არსებობდა.
     *
     * ⚠️ **გვერდის ნომერი აქ არასწორი ინსტრუმენტია**: ახალი წერილი სიას
     * წინ ემატება, ე.ი. „მე-2 გვერდი" ყოველ ახალ წერილზე სხვა რიგებს
     * ნიშნავს და ისტორიის კითხვისას დუბლები ჩნდებოდა. `before_id` ამას
     * ვერ განიცდის.
     *
     * ⚠️ **`around_id` წაკითხულად არ ნიშნავს** — ძებნიდან ან პინიდან
     * ისტორიაში ჩახტომა „ყველაფერი წავიკითხე" არ არის.
     */
    public function messages(Request $request, Conversation $conversation)
    {
        $me = $request->user();
        abort_unless($conversation->has($me->id), 404);

        $data = $request->validate([
            'before_id' => ['nullable', 'integer'],
            'around_id' => ['nullable', 'integer'],
            'per_page' => ['nullable', 'integer'],
        ]);

        // ⚠️ `max(…, 1)` — უარყოფითს `limit()` ჩუმად უგულებელყოფს (§B4)
        $limit = min(max((int) ($data['per_page'] ?? self::PER_PAGE), 1), 100);

        $base = fn () => $conversation->messages()
            // §4.6 — წაშლილი რიგი ბაზაში რჩება; ხედი user-ის ჭრილშია
            ->visibleTo($me->id)
            ->with(['author:id,name,username,avatar_path', 'reactions']);

        if ($around = $data['around_id'] ?? null) {
            /* ნახტომი: ნახევარი ფანჯარა ორივე მხარეს — თორემ ნაპოვნი
               წერილი ეკრანის კიდეში აღმოჩნდებოდა და კონტექსტი დაიკარგებოდა */
            $half = (int) floor($limit / 2);

            $older = $base()->where('id', '<=', $around)->orderByDesc('id')->limit($half + 1)->get();
            $newer = $base()->where('id', '>', $around)->orderBy('id')->limit($half)->get();

            $items = $older->concat($newer)->sortByDesc('id')->values();
        } else {
            $items = $base()
                ->when($data['before_id'] ?? null, fn ($q, $id) => $q->where('id', '<', $id))
                ->orderByDesc('id')
                ->limit($limit)
                ->get();
        }

        $oldest = $items->min('id');

        $hasMore = $oldest !== null && $conversation->messages()
            ->visibleTo($me->id)
            ->where('id', '<', $oldest)
            ->exists();

        $other = $conversation->otherThan($me->id);

        /* ⚠️ ისტორიაში ჩახტომა წაკითხვა არ არის (§10.8) — დანარჩენ
           შემთხვევაში კი გახსნა სწორედ „ჩატი გავხსენი"-ა. */
        if (! ($data['around_id'] ?? null)) {
            $this->chat->markRead($conversation, $me);
        }

        return response()->json([
            'data' => $items->map(fn (Message $m) => $this->payload($m, $me->id))->all(),
            'meta' => [
                'has_more' => $hasMore,
                'oldest_id' => $oldest,
                'newest_id' => $items->max('id'),
            ],
            'profile' => $other ? $this->profiles->header($other) : null,
            'blocked_by_me' => $other ? $this->chat->iBlocked($me, $other) : false,
            // ⚠️ „საერთოდ დაბლოკილია" ≠ „მე დავბლოკე" — UI-ს ორივე სჭირდება
            'blocked' => $other ? $this->chat->blockedBetween($me, $other) : false,
            // §10.3 — „ნანახია": მეორე მხარის `last_read_at` კლიენტს არასდროს მიდიოდა
            'other_read_at' => $other ? $this->otherReadAt($conversation, $other->id) : null,
            'muted' => $this->chat->isMuted($conversation, $me),
            'theme' => $conversation->theme,
            // §10.11 — ნიკნეიმი ნამდვილ სახელს არ ანაცვლებს; ორივე მიდის
            'nickname' => $other ? ($this->chat->nicknames($conversation, $me)[$other->id] ?? null) : null,
        ]);
    }

    /**
     * **ძებნა ერთ საუბარში (Tasks §10.9)** — `GET /chat/{conversation}/search`.
     *
     * ⚠️ **`scopeVisibleTo()`-ს გადის**: დამალული ან წაშლილი წერილი ძებნაში
     * არ უნდა ჩნდებოდეს — თორემ „წავშალე" მხოლოდ ბუშტს ეხებოდა.
     *
     * ⚠️ **`attachment_name`-შიც ეძებს**: მედიის წერილს `body` ხშირად არ
     * აქვს, ე.ი. მარტო ტექსტზე ძებნა ფაილებს ვერასდროს იპოვიდა.
     *
     * ⚠️ **ნაჭერს `Snippet::around()` ჭრის** (mb-უსაფრთხო) და ხაზგასმას
     * კლიენტი აკეთებს — ნედლი HTML არსად იგზავნება.
     */
    public function search(Request $request, Conversation $conversation)
    {
        $me = $request->user();
        abort_unless($conversation->has($me->id), 404);

        $data = $request->validate([
            'q' => ['required', 'string', 'min:2', 'max:100'],
            'limit' => ['nullable', 'integer'],
        ]);

        $term = trim($data['q']);
        $limit = min(max((int) ($data['limit'] ?? 30), 1), 100);
        $like = Like::contains($term);

        $items = $conversation->messages()
            ->visibleTo($me->id)
            ->where(fn ($q) => $q->where('body', 'like', $like)->orWhere('attachment_name', 'like', $like))
            ->orderByDesc('id')
            ->limit($limit)
            ->get();

        return response()->json([
            'data' => $items->map(fn (Message $m) => [
                'id' => $m->id,
                'mine' => $m->user_id === $me->id,
                'snippet' => Snippet::around((string) ($m->body ?: $m->attachment_name), $term),
                'created_at' => $m->created_at?->toIso8601String(),
            ])->all(),
            'total' => $items->count(),
        ]);
    }

    /** **პინების სია (§10.7)** — `scopeVisibleTo()`-ს გადის, ე.ი. წაშლილი თავისით ცვივა */
    public function pins(Request $request, Conversation $conversation)
    {
        $me = $request->user();
        abort_unless($conversation->has($me->id), 404);

        $items = $conversation->messages()
            ->visibleTo($me->id)
            ->whereNotNull('pinned_at')
            ->with(['author:id,name,username,avatar_path', 'reactions'])
            ->orderByDesc('pinned_at')
            ->get();

        return response()->json([
            'data' => $items->map(fn (Message $m) => $this->payload($m, $me->id))->all(),
        ]);
    }

    /**
     * **დაპინვა/მოხსნა (§10.7).**
     *
     * ⚠️ **`PATCH` და არა `POST`** — `EnsureModulePermission` POST-ს
     * `create`-ად კითხულობს (პროექტის არსებული წესი).
     *
     * ⚠️ **ორივე მონაწილეს შეუძლია**: პინი დესტრუქციული არაა და საუბრის
     * დონეზე დგას — განსხვავებით „ორივესთვის წაშლისგან", რომელიც ავტორობას
     * ითხოვს.
     */
    public function pin(Request $request, Message $message)
    {
        $me = $request->user();
        $conversation = $message->conversation;

        abort_unless($conversation && $conversation->has($me->id), 404);

        $data = $request->validate(['pinned' => ['required', 'boolean']]);

        $message = $this->chat->pin($message, $me, (bool) $data['pinned']);

        return response()->json(['data' => $this->payload($message->load('reactions'), $me->id)]);
    }

    /**
     * **რეაქცია (§10.10)** — `PUT /chat/messages/{message}/reaction`.
     *
     * ⚠️ **ცარიელი `emoji` მოხსნაა** და არა ვალიდაციის შეცდომა: იმავე
     * ემოჯის ხელახლა დაჭერაც მოხსნაა (Messenger-ის ქცევა).
     */
    public function react(Request $request, Message $message)
    {
        $me = $request->user();
        $conversation = $message->conversation;

        abort_unless($conversation && $conversation->has($me->id), 404);

        $data = $request->validate(['emoji' => ['nullable', 'string', 'max:32']]);

        $this->chat->react($message, $me, $data['emoji'] ?? null);

        return response()->json(['data' => $this->payload($message->load('reactions'), $me->id)]);
    }

    /**
     * **დადუმება (§10.5)** — `PUT /chat/{conversation}/mute`.
     *
     * ⚠️ `until` არჩევითია: მისი არარსებობა **სამუდამოდ** ნიშნავს და არა
     * „ახლავე ჩაირთოს" — ჩართვა ცხადი `muted: false`-ია.
     */
    public function mute(Request $request, Conversation $conversation)
    {
        $me = $request->user();
        abort_unless($conversation->has($me->id), 404);

        $data = $request->validate([
            'muted' => ['required', 'boolean'],
            'until' => ['nullable', 'date'],
        ]);

        $data['muted']
            ? $this->chat->mute($conversation, $me, isset($data['until']) ? Carbon::parse($data['until']) : null)
            : $this->chat->unmute($conversation, $me);

        return response()->json(['muted' => $this->chat->isMuted($conversation, $me)]);
    }

    /**
     * **თემა (§10.6)** — `PUT /chat/{conversation}/theme`.
     *
     * ⚠️ **საუბრისაა და არა მონაწილის**: Messenger-ის სემანტიკა — ორივე
     * ერთსა და იმავე ფერს ხედავს.
     */
    public function theme(Request $request, Conversation $conversation)
    {
        $me = $request->user();
        abort_unless($conversation->has($me->id), 404);

        $data = $request->validate([
            'theme' => ['nullable', Rule::in(Conversation::THEMES)],
        ]);

        $conversation->forceFill(['theme' => $data['theme'] ?? null])->save();

        return response()->json(['theme' => $conversation->theme]);
    }

    /**
     * **ნიკნეიმი (§10.11)** — `PUT /chat/{conversation}/nickname`.
     *
     * ⚠️ **მხოლოდ ჩემს ხედში**: მეორე მხარე ამას ვერ ხედავს და ნამდვილი
     * სახელიც პასუხში რჩება.
     */
    public function nickname(Request $request, Conversation $conversation)
    {
        $me = $request->user();
        abort_unless($conversation->has($me->id), 404);

        $other = $conversation->otherThan($me->id);
        abort_unless($other, 404);

        $data = $request->validate([
            'nickname' => ['nullable', 'string', 'max:60'],
        ]);

        $this->chat->setNickname($conversation, $me, $other, $data['nickname'] ?? null);

        return response()->json([
            'nickname' => $this->chat->nicknames($conversation, $me)[$other->id] ?? null,
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
                'image' => UploadLimits::rule('image'),
                'video' => UploadLimits::rule('video'),
                // ⚠️ ჩატში დოკუმენტს **ფორმატი არ ეზღუდება** — მიმოწერაა და
                // არა ბიბლიოთეკა; მხოლოდ ზომა მოქმედებს
                default => ['file', 'max:'.UploadLimits::effectiveKb('doc')],
            },
        ]);

        /* §16.4 — ადგილი **გამგზავნის** კვოტიდან იხარჯება. `storeUpload()`
           თვითონ აგდებს 413-ს, ე.ი. ცალკე შემოწმება აქ ზედმეტია და
           ორ ადგილას განსხვავებულ პასუხს დაბადებდა. */
        $path = $this->meter->storeUpload($me, $upload, StorageFolder::chatFiles($type));

        $message = $this->chat->send($conversation, $me, $type, $request->input('body'), [
            'attachment_path' => $path,
            'attachment_name' => $upload->getClientOriginalName(),
            // ⚠️ SEC-04 — სერვერის `finfo`, და არასდროს კლიენტის ჰედერი
            'attachment_mime' => SafeMime::ofUpload($upload),
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

        /* ⚠️ SEC-04 — სურათი/ვიდეო ძაფშივე `inline` იხატება, **დანარჩენი
           ჩამოიტვირთება**. `attachment_mime` აქ **განზრახ არ იკითხება**: ის
           (ძველ რიგზე) კლიენტის ჰედერი იყო, და HTML-ფაილი `text/html`-ით აპის
           origin-ზე მეორე მონაწილის ქუქით ხატდებოდა — ჩატის ერთი შეტყობინებით
           ანგარიშის მიტაცება. */
        return SafeMime::response($disk, $message->attachment_path, $message->attachment_name);
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
        /* §10.10 — რეაქციები ემოჯებად დაჯგუფებული. ⚠️ `relationLoaded`
           შემოწმება იმიტომ, რომ ეს ფორმა გაგზავნის პასუხშიც გამოიყენება,
           სადაც კავშირი ჯერ არ წაკითხულა — უამისოდ 50-წერილიან გვერდზე
           50 დამატებითი შეკითხვა იქნებოდა. */
        $reactions = [];
        $mineReaction = null;

        if ($message->relationLoaded('reactions')) {
            foreach ($message->reactions as $reaction) {
                $reactions[$reaction->emoji] = ($reactions[$reaction->emoji] ?? 0) + 1;

                if ((int) $reaction->user_id === $meId) {
                    $mineReaction = $reaction->emoji;
                }
            }
        }

        return [
            'id' => $message->id,
            'type' => $message->type,
            'body' => $message->body,
            'mine' => $message->user_id === $meId,
            'reactions' => $reactions,
            'my_reaction' => $mineReaction,
            'pinned' => $message->isPinned(),
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

    /**
     * მეორე მხარის `last_read_at` (§10.3).
     *
     * ⚠️ **ორივე მხარისთვის ეს უკვე ინახებოდა და კლიენტს არასდროს მიდიოდა** —
     * ე.ი. „ნანახია" ნიშანი მხოლოდ ერთ ველს აკლდა და არა სქემას.
     */
    private function otherReadAt(Conversation $conversation, int $otherId): ?string
    {
        $pivot = $conversation->participants()->whereKey($otherId)->first()?->pivot;

        return $pivot?->last_read_at ? Carbon::parse($pivot->last_read_at)->toIso8601String() : null;
    }

    /**
     * ნიკნეიმები საუბრების სიისთვის — **ერთი შეკითხვით** (§10.11).
     *
     * ⚠️ თითო საუბარზე ცალკე კითხვა N+1 იქნებოდა იმ სიაზე, რომელიც
     * 15 წამში ერთხელ თავიდან იკითხება.
     *
     * @return array<int, array<int, string>> conversation_id => [target_user_id => nickname]
     */
    private function nicknamesFor(Collection $conversations, int $meId): array
    {
        $rows = ConversationNickname::whereIn('conversation_id', $conversations->pluck('id'))
            ->where('user_id', $meId)
            ->get(['conversation_id', 'target_user_id', 'nickname']);

        $out = [];
        foreach ($rows as $row) {
            $out[(int) $row->conversation_id][(int) $row->target_user_id] = $row->nickname;
        }

        return $out;
    }
}
