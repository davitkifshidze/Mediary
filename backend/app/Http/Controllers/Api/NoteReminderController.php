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

    /**
     * **ყველა შეხსენება ერთ სიაში (ეტაპი 11.2).**
     *
     * შეხსენებას თავისი გვერდი გაუჩნდა (`/notes/reminders`), ე.ი. სჭირდება
     * კითხვა „რა მელის საერთოდ" და არა მხოლოდ „რა აქვს ამ ჩანაწერს".
     *
     * ⚠️ **ჩანაწერი თან მოჰყვება** (`noteEntry:id,title`) — ეს არის ის „ბმა",
     * რომლის გარეშეც სია უაზროა: „ყოველდღე 09:00" არაფერს ამბობს, სანამ არ
     * ჩანს, *რას* ეხება. ორი სვეტი მოჰყვება და არა მთელი ჩანაწერი.
     *
     * ⚠️ **რიგი აქ არ ლაგდება „მდგომარეობით"** — ეს ეკრანის საქმეა
     * (`lib/reminders.ts::sortReminders()`), და ერთი წესი ორ ადგილას
     * (SQL + PHP + TS) აუცილებლად გაშორდებოდა. SQL მხოლოდ სტაბილურ რიგს იძლევა.
     *
     * ⚠️ `owner` global scope სხვისას ჭრის (`BelongsToUser`) — ცალკე
     * `where('user_id')` არ სჭირდება და არც უნდა დაემატოს.
     */
    public function all()
    {
        return NoteReminderResource::collection(
            NoteReminder::query()
                ->with('noteEntry:id,title,category_id')
                ->orderBy('note_entry_id')
                ->orderBy('id')
                ->get(),
        );
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
            // ⚠️ კედლის საათი **ოთხივე** პერიოდულს სჭირდება (§5.5) და **სიაა**
            // (ეტაპი 7): „ყოველ დღე 08:00-ზე და 20:00-ზე" ერთი შეხსენებაა.
            'times_of_day' => [
                'nullable', 'array', 'max:'.NoteReminder::MAX_TIMES_PER_DAY,
                'required_if:mode,daily', 'required_if:mode,weekly',
                'required_if:mode,monthly', 'required_if:mode,yearly',
            ],
            'times_of_day.*' => ['date_format:H:i'],
            // ⚠️ **მასივია და არა ერთი დღე** (§5.5) — 0 = კვირა (Carbon-ის `dayOfWeek`)
            // ⚠️ `min:1` **განზრახ არ წერია**: „აქტიურობის" გადამრთველი ყველა ველს
            // უკან აგზავნის და არაკვირეული შეხსენება `[]`-ს გამოგზავნიდა → 422.
            // კვირეულს ცარიელს `required_if` ისედაც აჭერს.
            'weekdays' => ['nullable', 'required_if:mode,weekly', 'array', 'max:7'],
            'weekdays.*' => ['integer', 'min:0', 'max:6'],
            // ⚠️ თვის რიცხვებიც **სიაა** (ეტაპი 7) — „1-ში, 15-ში და 25-ში".
            // ⚠️ 31 დაშვებულია: `NoteReminder::atDay()` მას თვის სიგრძეზე ჩამოიყვანს
            'days_of_month' => [
                'nullable', 'array', 'max:31',
                'required_if:mode,monthly', 'required_if:mode,yearly',
            ],
            'days_of_month.*' => ['integer', 'min:1', 'max:31'],
            'month' => ['nullable', 'required_if:mode,yearly', 'integer', 'min:1', 'max:12'],
            // ჯერადობა: სულ რამდენჯერ გაისროლოს; ცარიელი = უსასრულოდ
            'repeat_count' => ['nullable', 'integer', 'min:1', 'max:1000'],
            // ⚠️ **მოქმედების ფანჯარა** (ეტაპი 7) — „ამ დიაპაზონში", „ამ პერიოდით".
            // ორივე აბსოლუტური მომენტია; `after:starts_at` მხოლოდ მაშინ ირთვება,
            // როცა დასაწყისი მართლა გამოგზავნილია — თორემ ცარიელ `starts_at`-ს
            // წესი თარიღად კითხულობს და ვალიდური მოთხოვნა 422-ით ვარდება.
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', Rule::when($request->filled('starts_at'), ['after:starts_at'])],
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
            // ⚠️ ნორმალიზება მოდელშიც არის (`clocks()`/`selectedWeekdays()`/
            // `selectedDays()`) — აქ მხოლოდ შენახვის ფორმაა, რომ ბაზაში
            // დუბლიკატი და არეული რიგი არ ჩაჯდეს.
            // ცარიელი მასივი `null`-ად ჯდება — „არ აქვს" ერთი მნიშვნელობით
            'times_of_day' => $this->sortedList($data['times_of_day'] ?? []),
            'weekdays' => $this->sortedList($data['weekdays'] ?? [], fn ($v) => (int) $v),
            'days_of_month' => $this->sortedList($data['days_of_month'] ?? [], fn ($v) => (int) $v),
            'month' => $data['month'] ?? null,
            'repeat_count' => $data['repeat_count'] ?? null,
            'starts_at' => $data['starts_at'] ?? null,
            'ends_at' => $data['ends_at'] ?? null,
            'timezone' => $data['timezone'] ?? 'UTC',
            'channels' => array_values(array_unique($data['channels'] ?? ['browser'])) ?: ['browser'],
            'is_active' => (bool) ($data['is_active'] ?? true),
        ];
    }

    /**
     * სამივე სია ერთი წესით ჯდება ბაზაში: დუბლიკატის გარეშე, დალაგებული,
     * ცარიელი — `null`-ად.
     *
     * ⚠️ სამივესთვის ერთი დამხმარე იმიტომაა, რომ „დღეები", „რიცხვები" და
     * „საათები" ერთსა და იმავე კითხვას სვამენ; სამი ცალკე გამოსახულება
     * ადრე თუ გვიან ერთმანეთს დაშორდებოდა (ერთ-ერთი უკვე იწერებოდა
     * დაულაგებლად).
     */
    private function sortedList(array $values, ?callable $cast = null): ?array
    {
        $list = array_values(array_unique($cast ? array_map($cast, $values) : $values));
        sort($list);

        return $list ?: null;
    }
}
