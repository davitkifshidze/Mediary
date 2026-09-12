<?php

namespace App\Services\Notes;

use App\Models\NoteNotification;
use App\Models\NoteReminder;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * შეხსენებების გასროლა (Tasks §13.2/§13.3).
 *
 * ⚠️ **ორი გამომძახებელი, ერთი კოდი.** ჩვეულებრივ Laravel-ის scheduler
 * (`notes:remind` ყოველ წუთს) ასრულებს ამას, მაგრამ dev-მანქანაზე cron არ
 * დგას — ამიტომ იმავე მეთოდს **ბრაუზერის polling-იც** იძახებს მიმდინარე
 * user-ისთვის (`GET /api/note-reminders/due`). ასე ბრაუზერის შეტყობინება
 * §13.3-ის დაპირებისამებრ „დამოკიდებულების გარეშე" მუშაობს, ტელეგრამი კი
 * დახურულ ბრაუზერზეც გადის — თუ scheduler გაშვებულია.
 *
 * ⚠️ **ელფოსტის არხი წაშლილია (Tasks §8.2)** და ამით `schedule:work`-ზე
 * დამოკიდებულებაც მოიხსნა: დარჩენილი ორიდან ბრაუზერისა ისედაც polling-ითაა,
 * ე.ი. გახსნილ აპში შეხსენება cron-ის გარეშეც მოდის. **არაფერი იკარგება**,
 * თუნდაც აპი დახურული იყოს: ყოველი გასროლა `note_notifications`-ში იწერება
 * და ჟურნალი აპლიკაციაშივე იკითხება.
 *
 * ⚠️ **ერთი შეხსენება ორჯერ არ უნდა გაისროლოს.** გარანტია `next_at`-ის
 * პირობითი UPDATE-ია (compare-and-swap): რიგს ვიჭერთ **გაგზავნამდე**, და
 * მხოლოდ იმ შემთხვევაში, თუ `next_at` ჯერ კიდევ ისაა, რაც წავიკითხეთ.
 * ორი პარალელური გამომძახებელი (cron + ღია ტაბი) ერთსა და იმავე რიგს ვერ
 * დაიჭერს — მეორეს UPDATE 0 რიგს დაუბრუნებს და ის უბრალოდ გამოტოვებს.
 */
class ReminderDispatcher
{
    /** ერთ გაშვებაზე რამდენი შეხსენება დამუშავდეს (დაგვიანებული რიგის ჭერი) */
    private const BATCH = 200;

    /**
     * ⚠️ დიდი ხნით გამორთული ინტერვალური შეხსენება არ უნდა „აფეთქდეს" —
     * ერთი გამოტოვებული გასროლა ერთ შეტყობინებად ითვლება, დანარჩენი იკარგება.
     * (ამას `advanceAfterSending()` თავისით აკეთებს: ის „ახლადან" ითვლის.)
     */
    public function __construct(
        private NoteChannelSettings $settings,
        private TelegramNotifier $telegram,
    ) {}

    /**
     * ვადამოსული შეხსენებების დამუშავება.
     *
     * @param  User|null  $user  მხოლოდ ამ ანგარიშისა (polling); `null` = ყველა (cron)
     * @return int რამდენი შეხსენება გაისროლა
     */
    public function run(?User $user = null, ?CarbonInterface $now = null): int
    {
        $now = $now ? Carbon::instance($now)->utc() : now()->utc();

        $due = NoteReminder::withoutGlobalScope('owner')
            ->with(['noteEntry', 'user'])
            ->where('is_active', true)
            ->whereNotNull('next_at')
            ->where('next_at', '<=', $now)
            ->when($user, fn ($q) => $q->where('user_id', $user->getKey()))
            ->orderBy('next_at')
            ->limit(self::BATCH)
            ->get();

        $fired = 0;

        foreach ($due as $reminder) {
            if ($this->fire($reminder, $now)) {
                $fired++;
            }
        }

        return $fired;
    }

    /** ერთი შეხსენება: რიგის გადაწევა → შეტყობინებების შექმნა → გაგზავნა */
    private function fire(NoteReminder $reminder, Carbon $now): bool
    {
        $entry = $reminder->noteEntry;
        $owner = $reminder->user;

        // ჩანაწერი ან ანგარიში წაშლილია — შეხსენებას აზრი აღარ აქვს
        if (! $entry || ! $owner) {
            $reminder->forceFill(['is_active' => false, 'next_at' => null])->save();

            return false;
        }

        // ⚠️ **ჯერ ვიჭერთ რიგს, მერე ვაგზავნით.** გაგზავნა შეიძლება წამებს
        // გასტანოს (ტელეგრამი/SMTP); პირობითი UPDATE კი უზრუნველყოფს, რომ
        // ამ დროს მეორე გამომძახებელმა იგივე შეხსენება ვერ დაიჭიროს.
        $claimed = NoteReminder::withoutGlobalScope('owner')
            ->whereKey($reminder->getKey())
            ->where('is_active', true)
            ->where('next_at', $reminder->next_at)
            ->update($reminder->nextStateAfterSending($now));

        if ($claimed === 0) {
            return false;
        }

        $channels = array_values(array_intersect(
            $reminder->channels ?: ['browser'],
            NoteReminder::CHANNELS,
        )) ?: ['browser'];

        $settings = $this->settings->for($owner);
        $title = $entry->title;
        $body = $this->body($entry);

        foreach ($channels as $channel) {
            $notification = NoteNotification::withoutGlobalScope('owner')->create([
                'user_id' => $owner->getKey(),
                'note_entry_id' => $entry->getKey(),
                'note_reminder_id' => $reminder->getKey(),
                'channel' => $channel,
                'title' => $title,
                'body' => $body,
                'scheduled_for' => $now,
                // ბრაუზერისა რიგია — „გაგზავნილად" მაშინ ითვლება, როცა ფრონტი წაიღებს
                'status' => NoteNotification::STATUS_PENDING,
            ]);

            $error = match ($channel) {
                'telegram' => $this->sendTelegram($settings, $title, $body),
                // ბრაუზერი მიწოდებას აქ არ საჭიროებს — ის polling-ით მიდის
                default => null,
            };

            if ($channel === 'browser') {
                continue;
            }

            $notification->forceFill($error
                ? ['status' => NoteNotification::STATUS_FAILED, 'error' => $error]
                : ['status' => NoteNotification::STATUS_SENT, 'sent_at' => now()],
            )->save();
        }

        return true;
    }

    /** შეტყობინების ტექსტი — აღწერა + ვადა, თუ არის */
    private function body($entry): ?string
    {
        $parts = array_filter([
            $entry->description ? mb_substr((string) $entry->description, 0, 500) : null,
            $entry->due_at ? '⏰ '.$entry->due_at->format('Y-m-d H:i') : null,
        ]);

        return $parts ? implode("\n", $parts) : null;
    }

    private function sendTelegram(array $settings, string $title, ?string $body): ?string
    {
        if (! $settings['telegram_bot_token'] || ! $settings['telegram_chat_id']) {
            // ეს შეცდომა კი არაა — user-ს ეს არხი უბრალოდ არ მოურგებია
            return 'telegram_not_configured';
        }

        return $this->telegram->send(
            $settings['telegram_bot_token'],
            $settings['telegram_chat_id'],
            trim($title."\n\n".($body ?? '')),
        );
    }
}
