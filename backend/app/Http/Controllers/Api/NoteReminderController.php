<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\NoteNotificationResource;
use App\Http\Resources\NoteReminderResource;
use App\Models\NoteEntry;
use App\Models\NoteNotification;
use App\Models\NoteReminder;
use App\Services\Notes\ReminderDispatcher;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * შეხსენებები და მათი მიწოდება (Tasks §13.2/§13.3).
 *
 * ⚠️ **`next_at`-ს კონტროლერი ხელით არასდროს წერს** — ის ყოველთვის
 * `NoteReminder::computeNextAt()`-იდან მოდის. თუ ორი გზა გაჩნდა, ერთი
 * მათგანი აუცილებლად აცდება (იგივე ხაფანგი, რასაც `Book::syncProgress()` ებრძვის).
 */
class NoteReminderController extends Controller
{
    public function index(NoteEntry $note)
    {
        return NoteReminderResource::collection($note->reminders()->get());
    }

    public function store(Request $request, NoteEntry $note)
    {
        $data = $this->validated($request);

        $reminder = $note->reminders()->make($this->attributes($data));
        $reminder->user_id = $request->user()->id;
        $reminder->next_at = $reminder->computeNextAt();
        $reminder->save();

        return (new NoteReminderResource($reminder))->response()->setStatusCode(201);
    }

    public function update(Request $request, NoteReminder $noteReminder)
    {
        $data = $this->validated($request);

        $noteReminder->fill($this->attributes($data));
        // ნებისმიერი ცვლილება რიგს თავიდან ითვლის — ძველი `next_at` აღარ ვარგა
        $noteReminder->next_at = $noteReminder->is_active ? $noteReminder->computeNextAt() : null;
        $noteReminder->save();

        return new NoteReminderResource($noteReminder);
    }

    public function destroy(NoteReminder $noteReminder)
    {
        $noteReminder->delete();

        return response()->noContent();
    }

    /**
     * ბრაუზერის არხის რიგი (§13.3).
     *
     * ⚠️ **GET-ია, თუმცა გვერდით ეფექტიც აქვს**: ვადამოსული შეხსენებები
     * აქვე სროლდება. ეს განზრახაა — cron dev-მანქანაზე არ დგას და ბრაუზერის
     * შეტყობინება „დამოკიდებულების გარეშე" უნდა მუშაობდეს. POST რომ ყოფილიყო,
     * `permission:` middleware მას `create`-ად ჩათვლიდა და მხოლოდ ნახვის
     * უფლების მქონე user შეხსენებას **ვერასდროს** მიიღებდა.
     */
    public function due(Request $request, ReminderDispatcher $dispatcher)
    {
        $dispatcher->run($request->user());

        $pending = NoteNotification::query()
            ->where('channel', 'browser')
            ->whereNull('read_at')
            // ძალიან ძველი გამოტოვებული შეტყობინება ეკრანზე აღარ ამოხტეს
            ->where('scheduled_for', '>=', now()->subDay())
            ->orderBy('scheduled_for')
            ->limit(20)
            ->get();

        return NoteNotificationResource::collection($pending);
    }

    /**
     * **შეხსენებების ჟურნალი (Tasks §8.2)** — რაც კი გასროლილა.
     *
     * ⚠️ **ეს ელფოსტის არხის ჩამნაცვლებელია.** არხი ამოღებულია („არ გვინდა"),
     * ე.ი. „აპი დახურული მქონდა და შეხსენება ვერ დავინახე" ვერსად უნდა
     * დაიკარგოს. ყოველი გასროლა ისედაც `note_notifications`-ში იწერებოდა —
     * უბრალოდ არსად ჩანდა; ახლა იკითხება.
     *
     * ⚠️ **`browser`-ის ჯერ წაუკითხავს `due` ცალკე აბრუნებს** (ის რიგია და
     * ამოხტომას ნიშნავს). აქ კი **ისტორიაა**, წაკითხულის ჩათვლით.
     *
     * ⚠️ **`owner` global scope ჭრის სხვისას** — `BelongsToUser`-ის წესი.
     */
    public function notifications(Request $request)
    {
        $data = $request->validate([
            'unread' => ['sometimes', 'boolean'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $query = NoteNotification::query()
            ->with('noteEntry:id,title')
            ->when($data['unread'] ?? false, fn ($q) => $q->whereNull('read_at'))
            ->orderByDesc('scheduled_for')
            ->orderByDesc('id');

        return NoteNotificationResource::collection(
            $query->paginate($data['per_page'] ?? 30),
        );
    }

    /**
     * „ვნახე" — ბრაუზერმა შეტყობინება აჩვენა.
     * PATCH-ია განზრახ: POST-ს `permission:` middleware `create`-ად წაიკითხავდა.
     */
    public function markRead(NoteNotification $noteNotification)
    {
        $noteNotification->forceFill([
            'read_at' => now(),
            'status' => NoteNotification::STATUS_SENT,
            'sent_at' => $noteNotification->sent_at ?? now(),
        ])->save();

        return new NoteNotificationResource($noteNotification);
    }

    /* ---------- დამხმარეები ---------- */

    private function validated(Request $request): array
    {
        return $request->validate([
            'mode' => ['required', Rule::in(NoteReminder::MODES)],
            // ერთჯერადი — აბსოლუტური მომენტი (ფრონტი ISO-ს გზავნის)
            'remind_at' => ['nullable', 'required_if:mode,once', 'date'],
            // ⚠️ პერიოდი ველია და არა ჩაშენებული 10/15/20 (§13.2)
            'interval_minutes' => [
                'nullable', 'required_if:mode,interval', 'integer',
                'min:'.NoteReminder::MIN_INTERVAL_MINUTES, 'max:'.(60 * 24 * 30),
            ],
            // ⚠️ კედლის საათი **ოთხივე** პერიოდულს სჭირდება (§5.5)
            'time_of_day' => [
                'nullable', 'date_format:H:i',
                'required_if:mode,daily', 'required_if:mode,weekly',
                'required_if:mode,monthly', 'required_if:mode,yearly',
            ],
            // ⚠️ **მასივია და არა ერთი დღე** (§5.5) — 0 = კვირა (Carbon-ის `dayOfWeek`)
            // ⚠️ `min:1` **განზრახ არ წერია**: „აქტიურობის" გადამრთველი ყველა ველს
            // უკან აგზავნის და არაკვირეული შეხსენება `[]`-ს გამოგზავნიდა → 422.
            // კვირეულს ცარიელს `required_if` ისედაც აჭერს.
            'weekdays' => ['nullable', 'required_if:mode,weekly', 'array', 'max:7'],
            'weekdays.*' => ['integer', 'min:0', 'max:6'],
            // ⚠️ 31 დაშვებულია: `NoteReminder::atDay()` მას თვის სიგრძეზე ჩამოიყვანს
            'day_of_month' => [
                'nullable', 'integer', 'min:1', 'max:31',
                'required_if:mode,monthly', 'required_if:mode,yearly',
            ],
            'month' => ['nullable', 'required_if:mode,yearly', 'integer', 'min:1', 'max:12'],
            // ჯერადობა: სულ რამდენჯერ გაისროლოს; ცარიელი = უსასრულოდ
            'repeat_count' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'timezone' => ['nullable', 'string', 'max:64', 'timezone'],
            'channels' => ['nullable', 'array'],
            'channels.*' => [Rule::in(NoteReminder::CHANNELS)],
            'is_active' => ['nullable', 'boolean'],
        ]);
    }

    /** ვალიდირებული input → სვეტები (`next_at` აქ **არ** ხვდება) */
    private function attributes(array $data): array
    {
        return [
            'mode' => $data['mode'],
            'remind_at' => $data['remind_at'] ?? null,
            'interval_minutes' => $data['interval_minutes'] ?? null,
            'time_of_day' => $data['time_of_day'] ?? null,
            // ⚠️ ნორმალიზება მოდელშიც არის (`selectedWeekdays()`) — აქ მხოლოდ
            // შენახვის ფორმაა, რომ ბაზაში დუბლიკატი არ ჩაჯდეს
            // ცარიელი მასივი `null`-ად ჯდება — „დღეები არ აქვს" ერთი მნიშვნელობით
            'weekdays' => array_values(array_unique(array_map('intval', $data['weekdays'] ?? []))) ?: null,
            'day_of_month' => $data['day_of_month'] ?? null,
            'month' => $data['month'] ?? null,
            'repeat_count' => $data['repeat_count'] ?? null,
            'timezone' => $data['timezone'] ?? 'UTC',
            'channels' => array_values(array_unique($data['channels'] ?? ['browser'])) ?: ['browser'],
            'is_active' => (bool) ($data['is_active'] ?? true),
        ];
    }
}
